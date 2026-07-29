// /Users/bart/Dev/wayli/fluxbase/jobs/_shared/services/transport-mode/run-helpers.ts
//
// Shared decode-and-persist logic for the transport-mode jobs. Both the
// on-demand (detect-transport-mode.ts) and scheduled (all-users) jobs call
// decodeAndPersist so the streaming → HMM → UPDATE logic lives in one place.

import type { FluxbaseClient } from '../../../types.d.ts';
import { detectTransportModes } from './detector.ts';
import { LOOKBACK_MS } from './segmentation.ts';
import type { ModeObservation } from './types.ts';

export const BATCH_SIZE = 1000;
export const MAX_FIRST_RUN_HOURS = 24 * 365 * 3;
const UPDATE_BATCH = 500;

interface TrackerPointRow {
	recorded_at: string;
	location: string | object;
	speed: number | null;
	heading: number | null;
	accuracy: number | null;
	geocode: any;
}

/**
 * Decode transport modes for `userId` over the incremental window
 * [since - LOOKBACK, now] and persist results to tracker_data. Returns the
 * number of points decoded.
 */
export async function decodeAndPersist(
	db: FluxbaseClient,
	userId: string,
	now: Date,
	_detector = detectTransportModes
): Promise<number> {
	// Read watermark.
	const { data: stateRow } = await db
		.from('transport_mode_state')
		.select('last_processed_at')
		.eq('user_id', userId)
		.maybeSingle();
	const lastProcessedAt = (stateRow as any)?.last_processed_at ?? null;
	const since = lastProcessedAt
		? new Date(new Date(lastProcessedAt).getTime() - LOOKBACK_MS)
		: new Date(now.getTime() - MAX_FIRST_RUN_HOURS * 60 * 60 * 1000);

	// Stream tracker_data in batches and decode+persist INCREMENTALLY.
	//
	// Why per-batch instead of accumulating all rows? On a first run the window
	// is MAX_FIRST_RUN_HOURS (3 years) — for a user with hundreds of thousands
	// of points, accumulating every row in memory then decoding the whole thing
	// at once exhausts the V8 heap (this is exactly what crashed the job before:
	// "Fatal JavaScript out of memory" at ~256 MB with 315k points). Instead we
	// decode each batch as it arrives, thread the previous batch's tail as
	// Viterbi context (DetectionContext) so journeys spanning a batch boundary
	// stay coherent, and persist immediately. Peak memory is ~2x BATCH_SIZE.
	let updated = 0;
	let lastRecordedAt: string | null = null;
	let prevObs: ModeObservation[] = []; // cross-batch continuity tail
	const TAIL = 6;
	let sawAny = false;

	while (true) {
		let query = db
			.from('tracker_data')
			.select('recorded_at, location, speed, heading, accuracy, geocode')
			.eq('user_id', userId)
			.gte('recorded_at', since.toISOString())
			.order('recorded_at', { ascending: true })
			.limit(BATCH_SIZE);
		if (lastRecordedAt) query = query.gt('recorded_at', lastRecordedAt);
		const { data: batch, error } = await query;
		if (error) throw new Error(`Fetch failed: ${(error as any).message}`);
		if (!batch || batch.length === 0) break;
		sawAny = true;
		lastRecordedAt = batch[batch.length - 1].recorded_at;

		// Convert this batch to observations.
		const observations: ModeObservation[] = (batch as TrackerPointRow[]).map((row) => {
			const { lat, lng } = parseLocation(row.location);
			return {
				timestamp: new Date(row.recorded_at).getTime(),
				lat,
				lng,
				speed: row.speed ?? 0,
				heading: row.heading,
				accuracy: row.accuracy,
				geocode: row.geocode ?? null
			};
		});

		// Decode with the previous batch's tail as context, then keep this
		// batch's tail for the next iteration.
		const decisions = _detector(observations, { prevObs });
		prevObs = observations.slice(-TAIL);

		updated += await persistDecisions(db, userId, decisions);

		if (batch.length < BATCH_SIZE) break;
	}

	if (!sawAny) {
		await advanceWatermark(db, userId, now);
		return 0;
	}

	await advanceWatermark(db, userId, now);
	return updated;
}

/**
 * Persist a slice of decoded decisions to tracker_data, grouped by (mode,
 * reason) to minimise round-trips. Extracted so decodeAndPersist can call it
 * per batch (bounded memory) instead of once over the whole history.
 */
async function persistDecisions(
	db: FluxbaseClient,
	userId: string,
	decisions: { mode: string; reason: string; timestamp: number; confidence: number }[]
): Promise<number> {
	if (decisions.length === 0) return 0;
	let updated = 0;
	for (let i = 0; i < decisions.length; i += UPDATE_BATCH) {
		const slice = decisions.slice(i, i + UPDATE_BATCH);
		const groups = new Map<
			string,
			{ mode: string; reason: string; items: { ts: number; conf: number }[] }
		>();
		for (const d of slice) {
			const key = `${d.mode}|${d.reason}`;
			if (!groups.has(key)) groups.set(key, { mode: d.mode, reason: d.reason, items: [] });
			groups.get(key)!.items.push({ ts: d.timestamp, conf: d.confidence });
		}
		for (const { mode, reason, items } of groups.values()) {
			const tsIso = items.map((it) => new Date(it.ts).toISOString());
			const meanConf = items.reduce((a, b) => a + b.conf, 0) / items.length;
			const { error: updErr } = await db
				.from('tracker_data')
				.update({
					transport_mode: mode,
					detection_reason: reason,
					transport_mode_confidence: Number(meanConf.toFixed(3))
				})
				.eq('user_id', userId)
				.in('recorded_at', tsIso)
				// Never overwrite a point the user manually corrected — the
				// override flag is the only thing protecting their edits from
				// being silently erased by a re-decode. (Migration 082.)
				.neq('transport_mode_manual', true);
			if (!updErr) updated += items.length;
			else console.error(`⚠️ Update error for mode ${mode}:`, updErr);
		}
	}
	return updated;
}

export async function advanceWatermark(
	db: FluxbaseClient,
	userId: string,
	when: Date
): Promise<void> {
	const iso = when.toISOString();
	const { error } = await db
		.from('transport_mode_state')
		.upsert({ user_id: userId, last_processed_at: iso, updated_at: iso }, { onConflict: 'user_id' });
	if (error) console.error('⚠️ Failed to advance watermark:', error);
}

/** Parse a PostGIS location into lat/lng. Supports WKT "POINT(lng lat)" and GeoJSON. */
export function parseLocation(location: any): { lat: number; lng: number } {
	if (typeof location === 'string') {
		const m = location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
		if (m) return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
	}
	if (location && typeof location === 'object' && Array.isArray(location.coordinates)) {
		return { lng: location.coordinates[0], lat: location.coordinates[1] };
	}
	return { lat: 0, lng: 0 };
}
