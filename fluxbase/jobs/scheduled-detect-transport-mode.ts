/**
 * Scheduled transport-mode detection for all users.
 *
 * Runs daily to decode transport modes incrementally for every user that has
 * tracker_data. Each user is processed from their own watermark. This is the
 * backfill + keep-fresh path; users can also trigger detect-transport-mode.ts
 * on-demand for their own account.
 *
 * @fluxbase:require-role admin, service_role
 * @fluxbase:timeout 21600
 * @fluxbase:progress-timeout 21600
 * @fluxbase:allow-net true
 * @fluxbase:allow-env true
 * @fluxbase:schedule 0 4 * * *
 */

import type { FluxbaseClient, JobUtils } from './types';
import { decodeAndPersist } from './_shared/services/transport-mode/run-helpers.ts';
import { detectTransportModes } from './_shared/services/transport-mode/detector.ts';

const USERS_RANGE = 1000;

export async function handler(
	_req: Request,
	_fluxbase: FluxbaseClient,
	fluxbaseService: FluxbaseClient,
	job: JobUtils
) {
	const db = fluxbaseService;
	// Optional payload: { "reprocess_all": true } forces a full 3-year
	// re-decode for every user regardless of watermark (admin "full re-run").
	// The per-user detector-version bump (DETECTOR_VERSION) triggers the same
	// full window automatically after detection-logic changes.
	const reprocessAll = (job.getJobContext().payload as any)?.reprocess_all === true;
	console.log(`🌐 Scheduled transport-mode detection for all users (reprocess_all=${reprocessAll})`);
	job.reportProgress(0, 'Enumerating users with tracker data...');

	// Distinct users that have tracker_data. We page through tracker_data and
	// collect unique user_ids (RLS-free service-role read). A dedicated
	// distinct() helper isn't on the client, so we dedupe in JS.
	const userIds = new Set<string>();
	let offset = 0;
	while (true) {
		const { data, error } = await db
			.from('tracker_data')
			.select('user_id')
			.range(offset, offset + USERS_RANGE - 1);
		if (error) {
			console.error('❌ Failed to enumerate users:', error);
			return { success: false, error: `Enumerate failed: ${(error as any).message}` };
		}
		if (!data || data.length === 0) break;
		for (const row of data) {
			const uid = (row as any).user_id;
			if (uid) userIds.add(uid);
		}
		offset += USERS_RANGE;
		if (data.length < USERS_RANGE) break;
	}

	const unique = Array.from(userIds);
	console.log(`👥 Processing ${unique.length} users`);

	const now = new Date();
	let processed = 0;
	let totalPoints = 0;
	for (let i = 0; i < unique.length; i++) {
		if (await job.isCancelled()) {
			console.log('🛑 Cancelled');
			return { success: false, error: 'Cancelled' };
		}
		const userId = unique[i];
		job.reportProgress(Math.round((i / unique.length) * 100), `User ${i + 1}/${unique.length}`);
		try {
			const points = await decodeAndPersist(db, userId, now, detectTransportModes, {
				reprocessAll
			});
			processed++;
			totalPoints += points;
		} catch (e) {
			console.error(`⚠️ User ${userId} failed:`, e);
		}
	}

	job.reportProgress(100, `Done: ${processed} users, ${totalPoints} points`);
	console.log(`✅ Scheduled run complete: ${processed} users, ${totalPoints} points`);
	return {
		success: true,
		result: { users_processed: processed, points_decoded: totalPoints }
	};
}
