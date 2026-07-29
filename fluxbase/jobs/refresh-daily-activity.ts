/**
 * Refresh daily activity aggregation (per-user, on-demand).
 *
 * Aggregates tracker_data into per-day distance/time/points, upserting into
 * tracker_daily_activity. Uses a single server-side SQL query (via the
 * refresh-daily-activity-sql RPC) instead of fetching raw points in batches —
 * the batch approach was unreliable due to SDK pagination issues and API row
 * limits. One query, all data, no pagination.
 *
 * @fluxbase:require-role authenticated
 * @fluxbase:timeout 300
 * @fluxbase:allow-net true
 * @fluxbase:allow-env true
 */

import type { FluxbaseClient, JobUtils } from './types';

export async function handler(
	_req: Request,
	fluxbase: FluxbaseClient,
	_fluxbaseService: FluxbaseClient,
	job: JobUtils
) {
	const context = job.getJobContext();
	const userId = context.user?.id;
	if (!userId) {
		return { success: false, error: 'No user context available' };
	}

	console.log(`📊 Refreshing daily activity for user ${userId}`);
	job.reportProgress(10, 'Aggregating daily activity...');

	// Use the user-scoped client — the RPC runs with auth.uid() = the user,
	// so RLS scoping is automatic.
	const db = fluxbase;

	try {
		// Call the server-side aggregation RPC. It does a single INSERT...SELECT
		// GROUP BY that processes ALL of the user's tracker_data in Postgres,
		// avoiding the need to fetch and paginate raw points in the job.
		const { data, error } = await (db.rpc as any).invoke(
			'refresh-daily-activity-sql',
			{ user_id: userId },
			{ namespace: 'wayli' }
		);

		if (error) {
			console.error('❌ refresh-daily-activity RPC error:', error);
			return { success: false, error: `RPC failed: ${(error as any).message}` };
		}

		const result = (data as any)?.result ?? data;
		const daysUpserted = (result as any)?.days_upserted ?? 0;

		job.reportProgress(100, `Done: ${daysUpserted} days`);
		console.log(`✅ Daily activity refreshed: ${daysUpserted} days for user ${userId}`);
		return { success: true, result: { days_upserted: daysUpserted, user_id: userId } };
	} catch (error: unknown) {
		console.error(`❌ refresh-daily-activity failed:`, error);
		return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
	}
}
