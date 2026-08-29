// /Users/bart/Dev/wayli/fluxbase/jobs/_shared/services/trip-route/trip-route-geometry.ts
// Mirrors web/src/lib/services/trip-route/trip-route-geometry.ts and
// functions/_shared/services/trip-route/trip-route-geometry.ts. Update ALL together.
//
// Pure geometry helpers for Valhalla-snapped trip routes. No I/O — everything
// here is unit-testable and shared between the fluxbase job (which builds the
// stored shape) and the web client (which only re-exports/decodes it).
//
// The stored route shape lives in trips.metadata.routeShape:
//   { v: 1, segments: [[lat,lng],...][], source: 'valhalla', generated_at }
// `segments` is a list of polylines: movement is split into a new segment at
// every privacy-zone crossing (and at transport-mode run boundaries), so no
// stored vertex — and no rendered line endpoint — sits inside the owner's
// home/trip-exclusion zones. Coordinates are rounded to 5 decimals (~1 m).

export interface LatLng {
	lat: number;
	lng: number;
}

export interface PrivacyZone {
	lat: number;
	lng: number;
	radius_m: number;
}

/** Stored (compact) form: segments of [lat, lng] pairs. */
export type StoredSegments = Array<Array<[number, number]>>;

export interface RouteShape {
	v: 1;
	segments: StoredSegments;
	source: 'valhalla';
	generated_at: string;
}

const EARTH_RADIUS_M = 6371008.8;

/** Great-circle distance in meters (mirrors PostGIS ST_DWithin on geography). */
export function haversineMeters(a: LatLng, b: LatLng): number {
	const toRad = Math.PI / 180;
	const dLat = (b.lat - a.lat) * toRad;
	const dLng = (b.lng - a.lng) * toRad;
	const sinLat = Math.sin(dLat / 2);
	const sinLng = Math.sin(dLng / 2);
	const h = sinLat * sinLat + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * sinLng * sinLng;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** True when the point lies within radius_m of any privacy zone. */
export function isInsideZone(p: LatLng, zones: PrivacyZone[]): boolean {
	for (const z of zones) {
		if (haversineMeters(p, z) <= z.radius_m) return true;
	}
	return false;
}

/**
 * Split a polyline at privacy-zone crossings: only runs of ≥2 consecutive
 * points OUTSIDE every zone are kept. This is the JS mirror of the
 * ST_DWithin clipping in get_public_trip_track() — a shared trip must never
 * reveal where the user lives, and the stored shape is readable by anyone who
 * can read the trip row.
 */
export function clipPolylineToZones<T extends LatLng>(polyline: T[], zones: PrivacyZone[]): T[][] {
	if (zones.length === 0) return polyline.length >= 2 ? [polyline] : [];
	const segments: T[][] = [];
	let current: T[] = [];
	for (const p of polyline) {
		if (isInsideZone(p, zones)) {
			if (current.length >= 2) segments.push(current);
			current = [];
		} else {
			current.push(p);
		}
	}
	if (current.length >= 2) segments.push(current);
	return segments;
}

export interface ModeRun<T> {
	mode: string | null;
	points: T[];
}

/**
 * Split a time-ordered point list into consecutive runs of the same
 * transport_mode. Stationary runs are dropped (a parked cluster adds noise,
 * not route), runs shorter than minRunLength are dropped, and null/unknown
 * modes are kept (matched with the permissive 'auto' costing).
 */
export function splitIntoModeRuns<T extends { transport_mode?: string | null }>(
	points: T[],
	minRunLength = 2
): ModeRun<T>[] {
	const runs: ModeRun<T>[] = [];
	let current: ModeRun<T> | null = null;
	for (const p of points) {
		const mode = p.transport_mode ?? null;
		if (!current || current.mode !== mode) {
			current = { mode, points: [] };
			runs.push(current);
		}
		current.points.push(p);
	}
	return runs.filter(
		(r) => r.mode !== 'stationary' && r.points.length >= Math.max(2, minRunLength)
	);
}

/**
 * Costing for a transport-mode run. Mirrors costingForMode() in
 * transport-mode/valhalla-confirm.ts — pedestrian network for walking,
 * cycleways for cycling, and the permissive road matcher for everything else
 * (car, train, airplane, unknown).
 */
export function costingForRunMode(mode: string | null): 'auto' | 'pedestrian' | 'bicycle' {
	switch (mode) {
		case 'walking':
			return 'pedestrian';
		case 'cycling':
			return 'bicycle';
		default:
			return 'auto';
	}
}

/** Round a coordinate to 5 decimals (~1 m) — keeps the stored JSON compact. */
export function roundCoord(n: number): number {
	return Math.round(n * 100000) / 100000;
}

export function toStoredSegments(segments: LatLng[][]): StoredSegments {
	return segments.map((seg) => seg.map((p) => [roundCoord(p.lat), roundCoord(p.lng)]));
}

/** Decode the stored compact form back into renderable points. */
export function fromStoredSegments(segments: StoredSegments): LatLng[][] {
	return segments.map((seg) => seg.map(([lat, lng]) => ({ lat, lng })));
}

/**
 * Proportionally thin segments so the TOTAL point count stays within
 * maxTotalPoints. Always keeps the first and last point of every segment.
 */
export function downsampleSegments<T extends LatLng>(
	segments: T[][],
	maxTotalPoints = 1500
): T[][] {
	const total = segments.reduce((n, s) => n + s.length, 0);
	if (total <= maxTotalPoints) return segments;
	return segments.map((seg) => {
		const budget = Math.max(2, Math.round((seg.length / total) * maxTotalPoints));
		if (seg.length <= budget) return seg;
		const stride = Math.ceil(seg.length / budget);
		const kept = seg.filter((_, i) => i % stride === 0 || i === seg.length - 1);
		return kept;
	});
}
