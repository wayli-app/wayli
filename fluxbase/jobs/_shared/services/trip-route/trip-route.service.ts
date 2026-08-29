// /Users/bart/Dev/wayli/fluxbase/jobs/_shared/services/trip-route/trip-route.service.ts
//
// Builds road-snapped route shapes for trips via the self-hosted Valhalla
// server (/trace_attributes, same client the transport-mode detector uses)
// and stores them in trips.metadata.routeShape.
//
// Key invariants:
//   * tracker_data is READ-ONLY here — datapoints are never modified. The
//     only write is the routeShape key on the trip's metadata.
//   * Only the privacy-clipped shape is stored: the raw snapped polyline is
//     split at every crossing of the owner's privacy zones (home address +
//     trip exclusions, via the privacy_zones() SQL function), so the stored
//     geometry never contains a point inside a zone. trips.metadata is
//     readable by anyone who can read the trip row (public trips), so an
//     unclipped shape would leak the owner's home.
//   * The whole feature is behind the per-user beta opt-in
//     `user_preferences.preferences.beta_features.valhalla_routes` (account
//     settings → Beta Features). Jobs only process opted-in users; the web
//     falls back to rendering raw GPS points for everyone else — including
//     opted-out users whose trips already have a stored shape (their own
//     dashboard view; public trip pages render stored shapes as published
//     content).
//
// Fallbacks: if Valhalla fails for a movement run (network error, no match),
// that run's RAW points are used for its segment, so a partial outage degrades
// to today's raw-point rendering instead of a missing route.

import { traceAttributes, type ValhallaTracePoint } from '../external/valhalla.service.ts';
import {
	clipPolylineToZones,
	costingForRunMode,
	downsampleSegments,
	splitIntoModeRuns,
	toStoredSegments,
	type LatLng,
	type PrivacyZone,
	type RouteShape
} from './trip-route-geometry.ts';

interface FluxbaseClient {
	from(table: string): any;
	rpc<T = any>(fn: string, params?: Record<string, unknown>): Promise<{ data: T | null; error: any }>;
}

/** Fluxbase API caps reads at 1000 rows — page tracker_data with this size. */
const TRACKER_PAGE = 1000;

/** Input sampling cap per trip: display fidelity bound + Valhalla load bound. */
const MAX_INPUT_POINTS = 4000;

/** Stored shape cap — the renderer samples to 1500 anyway. */
const MAX_SHAPE_POINTS = 1500;

export interface TripForRoute {
	id: string;
	user_id: string;
	start_date: string;
	end_date: string;
	metadata: Record<string, any> | null;
}

export type RouteGenResult =
	| 'stored'
	| 'skipped-no-points'
	| 'skipped-empty'
	| 'skipped-disabled'
	| 'error';

/**
 * Read the per-user beta opt-in (beta_features.valhalla_routes). Route
 * generation only runs for opted-in users — enabling it is an account-level
 * beta toggle, not a server admin setting.
 */
export async function isUserValhallaRoutesOptedIn(db: FluxbaseClient, userId: string): Promise<boolean> {
	try {
		const { data, error } = await db
			.from('user_preferences')
			.select('preferences')
			.eq('id', userId)
			.maybeSingle();
		if (error) return false;
		return (data as any)?.preferences?.beta_features?.valhalla_routes === true;
	} catch {
		return false;
	}
}

/** Load the owner's privacy zones via the shared SQL function (home + exclusions). */
export async function loadPrivacyZones(db: FluxbaseClient, userId: string): Promise<PrivacyZone[]> {
	try {
		const { data, error } = await db.rpc('privacy_zones', { p_user: userId });
		if (error || !data) return [];
		const rows = Array.isArray(data) ? data : ((data as any).result ?? []);
		return (rows as any[])
			.filter((z) => z && z.lat != null && z.lng != null)
			.map((z) => ({ lat: Number(z.lat), lng: Number(z.lng), radius_m: Number(z.radius_m) }));
	} catch {
		return [];
	}
}

function parseLocation(location: any): { lat: number; lng: number } | null {
	if (typeof location === 'string') {
		const m = location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
		if (m) return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
	}
	if (location && typeof location === 'object' && Array.isArray(location.coordinates)) {
		return { lng: location.coordinates[0], lat: location.coordinates[1] };
	}
	return null;
}

/**
 * Load a trip's tracker points (read-only), time-ordered, strided down to
 * MAX_INPUT_POINTS. Same date window as get_public_trip_track(): start of
 * start_date through end of end_date.
 */
async function loadTripPoints(
	db: FluxbaseClient,
	trip: TripForRoute
): Promise<Array<LatLng & { transport_mode: string | null }>> {
	const sd = (trip.start_date || '').slice(0, 10);
	const ed = (trip.end_date || trip.start_date || '').slice(0, 10);

	const all: Array<{ lat: number; lng: number; transport_mode: string | null }> = [];
	let offset = 0;
	while (true) {
		const { data, error } = await db
			.from('tracker_data')
			.select('location, transport_mode')
			.eq('user_id', trip.user_id)
			.gte('recorded_at', `${sd}T00:00:00Z`)
			.lte('recorded_at', `${ed}T23:59:59Z`)
			.order('recorded_at', { ascending: true })
			.range(offset, offset + TRACKER_PAGE - 1);
		if (error) throw new Error(`tracker_data fetch failed: ${(error as any).message}`);
		const batch = (data as any[]) ?? [];
		for (const row of batch) {
			const loc = parseLocation(row.location);
			if (loc) all.push({ ...loc, transport_mode: row.transport_mode ?? null });
		}
		if (batch.length < TRACKER_PAGE) break;
		offset += TRACKER_PAGE;
	}

	if (all.length > MAX_INPUT_POINTS) {
		const stride = Math.ceil(all.length / MAX_INPUT_POINTS);
		return all.filter((_, i) => i % stride === 0);
	}
	return all;
}

/**
 * Snap one trip's movement to the road network and store the privacy-clipped
 * shape in trips.metadata.routeShape. Never touches tracker_data.
 */
export async function generateTripRoute(db: FluxbaseClient, trip: TripForRoute): Promise<RouteGenResult> {
	try {
		const points = await loadTripPoints(db, trip);
		if (points.length < 2) return 'skipped-no-points';

		const zones = await loadPrivacyZones(db, trip.user_id);
		const runs = splitIntoModeRuns(points);
		if (runs.length === 0) return 'skipped-no-points';

		// Snap each movement run with the costing that matches its transport
		// mode; a failed/empty match falls back to that run's raw points.
		const polylines: LatLng[][] = [];
		for (const run of runs) {
			let shape: LatLng[] = [];
			try {
				const trace: ValhallaTracePoint[] = run.points.map((p) => ({ lat: p.lat, lon: p.lng }));
				const result = await traceAttributes(trace, costingForRunMode(run.mode), db);
				shape = result.shape.map((s) => ({ lat: s.lat, lng: s.lon }));
			} catch (err) {
				console.warn(
					`[trip-route] Valhalla match failed for a ${run.mode ?? 'unknown'} run of trip ${trip.id}, using raw points:`,
					err instanceof Error ? err.message : err
				);
			}
			if (shape.length < 2) shape = run.points;
			polylines.push(shape);
		}

		// Privacy clipping: split every polyline at zone crossings BEFORE
		// anything is stored — see the header invariants.
		const clipped: LatLng[][] = [];
		for (const poly of polylines) {
			clipped.push(...clipPolylineToZones(poly, zones));
		}
		if (clipped.length === 0) return 'skipped-empty';

		const shape: RouteShape = {
			v: 1,
			segments: toStoredSegments(downsampleSegments(clipped, MAX_SHAPE_POINTS)),
			source: 'valhalla',
			generated_at: new Date().toISOString()
		};

		const { error: updateError } = await db
			.from('trips')
			.update({ metadata: { ...(trip.metadata ?? {}), routeShape: shape } })
			.eq('id', trip.id);
		if (updateError) throw new Error(`trips update failed: ${(updateError as any).message}`);
		return 'stored';
	} catch (err) {
		console.error(`[trip-route] Failed to generate route for trip ${trip.id}:`, err);
		return 'error';
	}
}
