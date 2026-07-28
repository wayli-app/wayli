/**
 * Transport-mode detection (per-user, on-demand).
 *
 * Decodes transport mode (stationary/walking/cycling/car/train/airplane) for the
 * authenticated user's tracker_data using the HMM detector, and persists the
 * result to tracker_data.transport_mode / detection_reason /
 * transport_mode_confidence. Incremental: resumes from a per-user watermark with
 * a 1h lookback so the tail of the previous segment is re-decoded (modes depend
 * on the whole segment).
 *
 * @fluxbase:require-role authenticated
 * @fluxbase:timeout 3600
 * @fluxbase:progress-timeout 3600
 * @fluxbase:allow-net true
 * @fluxbase:allow-env true
 */

import type { FluxbaseClient, JobUtils } from './types';
import { decodeAndPersist } from './_shared/services/transport-mode/run-helpers.ts';

export async function handler(
	_req: Request,
	_fluxbase: FluxbaseClient,
	fluxbaseService: FluxbaseClient,
	job: JobUtils
) {
	const context = job.getJobContext();
	const userId = context.user?.id;
	if (!userId) {
		return { success: false, error: 'No user context available' };
	}

	console.log(`🚆 Starting transport-mode detection for user ${userId}`);
	job.reportProgress(5, 'Decoding transport modes...');

	try {
		const updated = await decodeAndPersist(fluxbaseService, userId, new Date());
		job.reportProgress(100, `Done: ${updated} points decoded`);
		console.log(`✅ Transport-mode detection complete: ${updated} points for user ${userId}`);
		return { success: true, result: { points_processed: updated, user_id: userId } };
	} catch (error: unknown) {
		console.error(`❌ Transport-mode detection failed for user ${userId}:`, error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}
