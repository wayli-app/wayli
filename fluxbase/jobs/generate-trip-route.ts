/**
 * Generate the Valhalla-snapped route shape for a single trip.
 *
 * Stores the privacy-clipped snapped polyline in trips.metadata.routeShape
 * (see _shared/services/trip-route/trip-route.service.ts for the invariants:
 * tracker_data is never modified, only zone-clipped geometry is stored).
 *
 * Payload: { "trip_id": "<uuid>" }
 *
 * @fluxbase:require-role admin, service_role
 * @fluxbase:timeout 600
 * @fluxbase:progress-timeout 600
 * @fluxbase:allow-net true
 * @fluxbase:allow-env true
 */

import {
	generateTripRoute,
	isUserValhallaRoutesOptedIn
} from './_shared/services/trip-route/trip-route.service.ts';
import type { FluxbaseClient, JobUtils } from './types';

export async function handler(
	_req: Request,
	_fluxbase: FluxbaseClient,
	fluxbaseService: FluxbaseClient,
	job: JobUtils
) {
	const context = job.getJobContext();
	const tripId = (context.payload as any)?.trip_id;
	if (!tripId) {
		return { success: false, error: 'Missing trip_id in payload' };
	}

	const db = fluxbaseService;

	const { data: trip, error } = await db
		.from('trips')
		.select('id, user_id, start_date, end_date, metadata')
		.eq('id', tripId)
		.single();
	if (error || !trip) {
		return { success: false, error: `Trip not found: ${(error as any)?.message ?? tripId}` };
	}

	if (!(await isUserValhallaRoutesOptedIn(db, (trip as any).user_id))) {
		return {
			success: false,
			error: 'Road-snapping beta is not enabled for this trip owner (beta_features.valhalla_routes)'
		};
	}

	job.reportProgress(10, 'Snapping route via Valhalla...');
	const result = await generateTripRoute(db, trip as any);
	job.reportProgress(100, `Done: ${result}`);
	return { success: result !== 'error', result: { trip_id: tripId, outcome: result } };
}
