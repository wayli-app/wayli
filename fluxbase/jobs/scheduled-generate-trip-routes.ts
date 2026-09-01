/**
 * Scheduled Valhalla route generation (backfill + keep-fresh).
 *
 * Iterates every active/completed trip of users who opted into the
 * road-snapping beta (account setting) and that has no stored routeShape yet
 * (or all of them with { "force": true }) and snaps its tracker points to the
 * road network via Valhalla. Read-only on tracker_data; writes only
 * trips.metadata.routeShape. Also what the admin button on the server
 * settings page submits.
 *
 * Payload: { "force"?: boolean } — regenerate shapes that already exist.
 *
 * @fluxbase:require-role admin, service_role
 * @fluxbase:timeout 21600
 * @fluxbase:progress-timeout 21600
 * @fluxbase:allow-net true
 * @fluxbase:allow-env true
 * @fluxbase:schedule 0 5 * * *
 */

import {
	generateTripRoute,
	isUserValhallaRoutesOptedIn,
	type TripForRoute
} from './_shared/services/trip-route/trip-route.service.ts';
import type { FluxbaseClient, JobUtils } from './types';

const TRIPS_PAGE = 200;

export async function handler(
	_req: Request,
	_fluxbase: FluxbaseClient,
	fluxbaseService: FluxbaseClient,
	job: JobUtils
) {
	const db = fluxbaseService;
	const force = (job.getJobContext().payload as any)?.force === true;

	console.log(`🛣️ Scheduled trip route generation (force=${force})`);
	job.reportProgress(0, 'Enumerating trips...');

	// Page candidate trips; filter for a missing routeShape in JS — the
	// jsonb-path filter syntax differs across PostgREST versions. The per-user
	// beta opt-in is checked below (cached per user for the run).
	const candidates: TripForRoute[] = [];
	let offset = 0;
	while (true) {
		const { data, error } = await db
			.from('trips')
			.select('id, user_id, start_date, end_date, metadata')
			.in('status', ['active', 'completed'])
			.order('start_date', { ascending: true })
			.range(offset, offset + TRIPS_PAGE - 1);
		if (error) {
			return { success: false, error: `Enumerate failed: ${(error as any).message}` };
		}
		const batch = (data as any[]) ?? [];
		for (const trip of batch) {
			if (force || (trip as any).metadata?.routeShape == null) {
				candidates.push(trip as TripForRoute);
			}
		}
		if (batch.length < TRIPS_PAGE) break;
		offset += TRIPS_PAGE;
	}

	// Per-user beta opt-in, one query per user for the whole run.
	const optedIn = new Map<string, boolean>();
	async function isOptedIn(userId: string): Promise<boolean> {
		if (!optedIn.has(userId)) {
			optedIn.set(userId, await isUserValhallaRoutesOptedIn(db, userId));
		}
		return optedIn.get(userId) ?? false;
	}

	const todo = [] as TripForRoute[];
	for (const trip of candidates) {
		if (await isOptedIn(trip.user_id)) todo.push(trip);
	}
	console.log(`🗺️ ${todo.length} trips to process (${candidates.length - todo.length} skipped: beta not enabled)`);

	const counts: Record<string, number> = {};
	for (let i = 0; i < todo.length; i++) {
		if (await job.isCancelled()) {
			return { success: false, error: 'Cancelled' };
		}
		job.reportProgress(Math.round((i / todo.length) * 100), `Trip ${i + 1}/${todo.length}`);
		const result = await generateTripRoute(db, todo[i]);
		counts[result] = (counts[result] ?? 0) + 1;
	}

	job.reportProgress(100, 'Done');
	console.log(`✅ Trip route generation complete: ${JSON.stringify(counts)}`);
	return { success: true, result: { trips_processed: todo.length, outcomes: counts } };
}
