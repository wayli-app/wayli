/**
 * Refresh daily activity aggregation (per-user, on-demand).
 *
 * Aggregates tracker_data into per-day distance/time/points, upserting into
 * tracker_daily_activity. Incremental: only processes days newer than the
 * user's watermark (with a 1-day lookback to absorb late/edited points).
 * The activity_calendar RPC reads this cache table instead of aggregating live.
 *
 * @fluxbase:require-role authenticated
 * @fluxbase:timeout 120
 * @fluxbase:allow-net true
 * @fluxbase:allow-env true
 */

import type { FluxbaseClient, JobUtils } from './types';

const LOOKBACK_DAYS = 1;

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
	job.reportProgress(5, 'Aggregating daily activity...');

	// Use the user-scoped client (RLS-respecting) — the authenticated RLS
	// policy (auth.uid() = user_id) covers both reads and writes for the
	// user's own rows. No service_role/tenant_service policy needed.
	const db = fluxbase;

	try {
		// Read watermark.
		const { data: stateRow } = await db
			.from('tracker_daily_activity_state')
			.select('last_processed_at')
			.eq('user_id', userId)
			.maybeSingle();
		const lastProcessedAt = (stateRow as any)?.last_processed_at ?? null;

		// Since = watermark - lookback. On first run (no watermark), process all.
		const since = lastProcessedAt
			? new Date(new Date(lastProcessedAt).getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
			: null;

		// Aggregate tracker_data into per-day sums.
		let query = db
			.from('tracker_data')
			.select('recorded_at, distance, time_spent')
			.eq('user_id', userId)
			.order('recorded_at', { ascending: true });
		if (since) query = query.gte('recorded_at', since);

		// Fetch in batches and group by day.
		const byDay = new Map<string, { distance: number; time_spent: number; points: number }>();
		let offset = 0;
		const BATCH = 5000;

		while (true) {
			if (await job.isCancelled()) {
				return { success: false, error: 'Cancelled' };
			}
			const { data: batch, error } = await query.range(offset, offset + BATCH - 1);
			if (error) {
				console.error('❌ Fetch error:', error);
				return { success: false, error: `Fetch failed: ${(error as any).message}` };
			}
			if (!batch || batch.length === 0) break;

			for (const row of batch as any[]) {
				const day = new Date(row.recorded_at).toISOString().slice(0, 10);
				const cur = byDay.get(day) ?? { distance: 0, time_spent: 0, points: 0 };
				cur.distance += Number(row.distance) || 0;
				cur.time_spent += Number(row.time_spent) || 0;
				cur.points += 1;
				byDay.set(day, cur);
			}

			offset += BATCH;
			if (batch.length < BATCH) break;
		}

		// Upsert per-day aggregates.
		const upserts = Array.from(byDay.entries()).map(([day, v]) => ({
			user_id: userId,
			day,
			distance: Math.round(v.distance * 100) / 100,
			time_spent: Math.round(v.time_spent * 100) / 100,
			points: v.points,
			updated_at: new Date().toISOString()
		}));

		let upserted = 0;
		if (upserts.length > 0) {
			const UPSERT_BATCH = 500;
			for (let i = 0; i < upserts.length; i += UPSERT_BATCH) {
				const slice = upserts.slice(i, i + UPSERT_BATCH);
				const { error: upErr } = await db
					.from('tracker_daily_activity')
					.upsert(slice, { onConflict: 'user_id,day' });
				if (!upErr) upserted += slice.length;
				else console.error('⚠️ Upsert error:', upErr);
			}
		}

		// Advance the watermark.
		const nowIso = new Date().toISOString();
		await db
			.from('tracker_daily_activity_state')
			.upsert(
				{ user_id: userId, last_processed_at: nowIso, updated_at: nowIso },
				{ onConflict: 'user_id' }
			);

		job.reportProgress(100, `Done: ${upserted} days`);
		console.log(`✅ Daily activity refreshed: ${upserted} days for user ${userId}`);
		return { success: true, result: { days_upserted: upserted, user_id: userId } };
	} catch (error: unknown) {
		console.error(`❌ refresh-daily-activity failed:`, error);
		return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
	}
}
