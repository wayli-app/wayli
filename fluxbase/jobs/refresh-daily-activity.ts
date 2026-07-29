/**
 * Refresh daily activity aggregation (per-user, on-demand).
 *
 * Aggregates tracker_data into per-day distance/time/points via the
 * refresh-daily-activity-sql RPC, which runs a single INSERT...SELECT GROUP BY
 * in Postgres. No batch fetching of raw points, no pagination issues.
 *
 * @fluxbase:require-role authenticated
 * @fluxbase:timeout 300
 * @fluxbase:allow-net true
 * @fluxbase:allow-env true
 */

import type { FluxbaseClient, JobUtils } from './types';

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

	console.log(`📊 Refreshing daily activity for user ${userId}`);
	job.reportProgress(10, 'Aggregating daily activity...');

	// Use the user-scoped client so the RPC's auth.uid() resolves correctly.
	// The RPC handles the INSERT...SELECT with the user's own ID.
	const db = _fluxbase;

	try {
		const { data, error } = await (db.rpc as any).invoke(
			'refresh-daily-activity-sql',
			{},
			{ namespace: 'wayli' }
		);

		if (error) {
			console.error('❌ refresh-daily-activity RPC error:', error);
			return { success: false, error: `RPC failed: ${(error as any).message}` };
		}

		const result = (data as any)?.result ?? data;
		const rows = Array.isArray(result) ? result : [];
		const daysUpserted = (rows[0] as any)?.days_upserted ?? (result as any)?.days_upserted ?? 0;

		job.reportProgress(100, `Done: ${daysUpserted} days`);
		console.log(`✅ Daily activity refreshed: ${daysUpserted} days for user ${userId}`);
		return { success: true, result: { days_upserted: daysUpserted, user_id: userId } };
	} catch (error: unknown) {
		console.error(`❌ refresh-daily-activity failed:`, error);
		return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
	}
}
