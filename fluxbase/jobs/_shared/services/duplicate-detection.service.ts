/**
 * Duplicate / overlapping-recordings detection service
 *
 * Wayli's tracker_data PK (user_id, recorded_at) makes exact duplicates
 * impossible, so "duplicates" here always means PARALLEL recordings: the same
 * trip captured twice (e.g. a FIT import plus the live OwnTracks feed). The
 * heavy lifting lives in the find-duplicate-clusters RPC; this service wraps
 * it, ranks each section ("cluster") by recording quality, and persists
 * reviewable duplicate_reports rows. Deletion never happens here — detection
 * only ever creates a report that the user reviews (DuplicateReview modal)
 * before the duplicate-cleanup job applies it.
 */

import type { FluxbaseClient } from '../../types.d.ts';

// ============================================================================
// Types
// ============================================================================

export interface DuplicateParams {
	/** Max |Δt| for two points to be considered the same moment (seconds). */
	time_window_s: number;
	/** Base match distance in meters; widened by the pair's GPS accuracy, capped at 500. */
	distance_m: number;
	/** Matches closer together than this merge into one section (minutes). */
	merge_gap_min: number;
	/** Sections with fewer matched pairs than this are noise, not duplicates. */
	min_pairs: number;
}

export const DEFAULT_DUPLICATE_PARAMS: DuplicateParams = {
	time_window_s: 180,
	distance_m: 150,
	merge_gap_min: 10,
	min_pairs: 8
};

/** Hard bounds for user-tuned thresholds — the UI clamps for feedback, the
 * backend clamps for authority (stored prefs may hold anything). */
export const PARAM_LIMITS: Record<keyof DuplicateParams, { min: number; max: number }> = {
	time_window_s: { min: 30, max: 600 },
	distance_m: { min: 50, max: 500 },
	merge_gap_min: { min: 2, max: 60 },
	min_pairs: { min: 3, max: 100 }
};

/**
 * Merge a (possibly partial/garbage) threshold object onto the defaults,
 * coercing and clamping every field into PARAM_LIMITS. Fields that are
 * missing or not finite numbers fall back to their default.
 */
export function clampParams(partial: unknown): DuplicateParams {
	const source = (partial ?? {}) as Record<string, unknown>;
	const merged = { ...DEFAULT_DUPLICATE_PARAMS };
	for (const key of Object.keys(DEFAULT_DUPLICATE_PARAMS) as Array<keyof DuplicateParams>) {
		const raw = source[key];
		// Number(null)/Number(false) are 0 — treat anything but numbers and
		// numeric strings as "not set" so it falls back to the default.
		if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') continue;
		const num = Number(raw);
		if (Number.isFinite(num)) {
			const limit = PARAM_LIMITS[key];
			merged[key] = Math.min(limit.max, Math.max(limit.min, Math.round(num)));
		}
	}
	return merged;
}

/**
 * The caller's tuned thresholds (user_preferences.preferences.
 * duplicate_detection), falling back to the defaults when nothing was saved
 * yet. Best-effort: a failed read must not break detection.
 */
export async function fetchUserParams(
	fluxbase: FluxbaseClient,
	userId: string
): Promise<DuplicateParams> {
	try {
		const { data } = await fluxbase
			.from('user_preferences')
			.select('preferences')
			.eq('id', userId)
			.maybeSingle();
		const prefs = (data as { preferences?: { duplicate_detection?: unknown } } | null)
			?.preferences;
		return clampParams(prefs?.duplicate_detection);
	} catch (err) {
		console.warn('Failed to read duplicate-detection preferences, using defaults:', err);
		return { ...DEFAULT_DUPLICATE_PARAMS };
	}
}

/**
 * Persist tuned thresholds under user_preferences.preferences.
 * duplicate_detection. Read-modify-write on the whole preferences JSONB so
 * sibling keys (e.g. onboarding_checklist) survive, with an upsert fallback
 * for users whose row doesn't exist yet. Caller-scoped (RLS) — a user can
 * only ever write their own row.
 */
export async function saveUserParams(
	fluxbase: FluxbaseClient,
	userId: string,
	params: DuplicateParams
): Promise<void> {
	const { data } = await fluxbase
		.from('user_preferences')
		.select('preferences')
		.eq('id', userId)
		.maybeSingle();
	const preferences = ((data as { preferences?: Record<string, unknown> } | null)?.preferences ??
		{}) as Record<string, unknown>;
	const merged = { ...preferences, duplicate_detection: params };

	const { data: updated, error } = await fluxbase
		.from('user_preferences')
		.update({ preferences: merged })
		.eq('id', userId)
		.select('id');
	if (!error && updated && (updated as unknown[]).length > 0) return;

	const { error: upsertError } = await fluxbase
		.from('user_preferences')
		.upsert({ id: userId, preferences: merged });
	if (upsertError) {
		console.warn(`Failed to save duplicate-detection preferences: ${upsertError.message}`);
	}
}

export type SessionKind = 'import' | 'device' | 'legacy' | 'other';

export interface DuplicateSideStats {
	/** Stable session key, e.g. 'device:abc' / 'import:<uuid>' / 'legacy:<bucket>'. */
	key: string;
	kind: SessionKind;
	/** Matched points on this side of the section. */
	count: number;
	median_accuracy: number | null;
	points_per_min: number;
}

export interface DuplicateCluster {
	/** Stable within one report: 'c1', 'c2', ... — review decisions reference it. */
	id: string;
	start: string;
	end: string;
	a: DuplicateSideStats;
	b: DuplicateSideStats;
	pair_count: number;
	/** Quality verdict shown as the default in the review dialog. */
	recommended_keep: 'a' | 'b';
}

export interface DuplicateReportSource {
	kind: 'import' | 'scan';
	/** Present for import-triggered reports. */
	import_id?: string;
	format?: string;
	file_name?: string;
	/** Present for scan-triggered reports (ISO dates, inclusive). */
	start_date?: string;
	end_date?: string;
}

export interface DuplicateReportSummary {
	section_count: number;
	/** Points that would be removed when following every section's recommendation. */
	recommended_remove_count: number;
	span_start: string;
	span_end: string;
}

export interface DuplicateReportDraft {
	source_type: 'import' | 'scan';
	source: DuplicateReportSource;
	params: DuplicateParams;
	clusters: DuplicateCluster[];
	summary: DuplicateReportSummary;
}

/** Raw section row as returned by the find-duplicate-clusters RPC. */
export interface RawClusterRow {
	key_a: string;
	key_b: string;
	start_ts: string;
	end_ts: string;
	pair_count: number;
	count_a: number;
	count_b: number;
	median_acc_a: number | null;
	median_acc_b: number | null;
	duration_s: number;
}

export interface WrittenDuplicateReport extends DuplicateReportDraft {
	id: string;
	user_id: string;
	status: 'pending_review' | 'applied' | 'dismissed' | 'failed';
	created_at: string;
}

// ============================================================================
// Pure helpers (unit-tested)
// ============================================================================

export function parseSessionKey(key: string): { kind: SessionKind; value: string } {
	const idx = key.indexOf(':');
	const kind = (idx === -1 ? key : key.slice(0, idx)) as SessionKind;
	return { kind, value: idx === -1 ? '' : key.slice(idx + 1) };
}

/**
 * Calendar-month windows (UTC) covering [startDate, endDate], used by the
 * historical scan to chunk the RPC work so no single query spans a whole
 * history. Clusters landing on a boundary are stitched afterwards.
 */
export function monthWindows(startDate: Date, endDate: Date): Array<{ start: Date; end: Date }> {
	const windows: Array<{ start: Date; end: Date }> = [];
	const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
	const last = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
	while (cursor <= last) {
		const start = new Date(cursor);
		const end = new Date(
			Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 23, 59, 59, 999)
		);
		windows.push({ start, end });
		cursor.setUTCMonth(cursor.getUTCMonth() + 1);
	}
	return windows;
}

/**
 * Quality score for one side of a section: sampling density dominates
 * (0..1, saturating at 30 points/min — roughly 2s cadence), GPS accuracy
 * refines it (±5m ≈ 0.95, ±100m ≈ 0; unknown ≈ 0.3, deliberately between
 * a clean phone fix and a 1 Hz export).
 */
export function qualityScore(side: DuplicateSideStats): number {
	const density = Math.max(0, Math.min(side.points_per_min, 30)) / 30;
	const accuracy =
		side.median_accuracy == null
			? 0.3
			: Math.max(0, Math.min(1, 1 - side.median_accuracy / 100));
	return density * 0.65 + accuracy * 0.35;
}

/**
 * Which side a section should default to keeping. A clear quality gap (>5%
 * score difference) decides; otherwise the live recording beats imports
 * (an import must never silently outrank on-device data), then density,
 * then a stable key comparison so the verdict is deterministic.
 */
export function recommendKeep(a: DuplicateSideStats, b: DuplicateSideStats): 'a' | 'b' {
	const scoreA = qualityScore(a);
	const scoreB = qualityScore(b);
	if (scoreA > scoreB * 1.05) return 'a';
	if (scoreB > scoreA * 1.05) return 'b';

	const kindRank = (s: DuplicateSideStats): number =>
		s.kind === 'device' ? 2 : s.kind === 'import' ? 1 : 0;
	if (kindRank(a) !== kindRank(b)) return kindRank(a) > kindRank(b) ? 'a' : 'b';
	if (Math.abs(a.points_per_min - b.points_per_min) > 0.01) {
		return a.points_per_min > b.points_per_min ? 'a' : 'b';
	}
	return a.key <= b.key ? 'a' : 'b';
}

/** Turn raw RPC rows into report-ready clusters with stable ids. */
export function buildClusters(rows: RawClusterRow[]): DuplicateCluster[] {
	return rows.map((row, i) => {
		const durationMin = Math.max(row.duration_s / 60, 1 / 60);
		const a: DuplicateSideStats = {
			key: row.key_a,
			kind: parseSessionKey(row.key_a).kind,
			count: row.count_a,
			median_accuracy: row.median_acc_a,
			points_per_min: row.count_a / durationMin
		};
		const b: DuplicateSideStats = {
			key: row.key_b,
			kind: parseSessionKey(row.key_b).kind,
			count: row.count_b,
			median_accuracy: row.median_acc_b,
			points_per_min: row.count_b / durationMin
		};
		return {
			id: `c${i + 1}`,
			start: row.start_ts,
			end: row.end_ts,
			a,
			b,
			pair_count: row.pair_count,
			recommended_keep: recommendKeep(a, b)
		};
	});
}

/**
 * Merge sections of the same session pair that sit closer together than the
 * merge gap. The historical scan detects month-by-month, so one trip spanning
 * a month boundary would otherwise appear as two sections and ask the user
 * twice. Match counts sum (windows never overlap); median accuracy becomes the
 * count-weighted blend.
 */
export function stitchClusters(
	clusters: DuplicateCluster[],
	mergeGapMin: number
): DuplicateCluster[] {
	const groups = new Map<string, DuplicateCluster[]>();
	for (const c of clusters) {
		const pairKey = `${[c.a.key, c.b.key].sort().join('|')}`;
		const list = groups.get(pairKey);
		if (list) list.push(c);
		else groups.set(pairKey, [c]);
	}

	const stitched: DuplicateCluster[] = [];
	for (const list of groups.values()) {
		list.sort((x, y) => x.start.localeCompare(y.start));
		let current: DuplicateCluster = { ...list[0], a: { ...list[0].a }, b: { ...list[0].b } };
		for (let i = 1; i < list.length; i++) {
			const next = list[i];
			const gapMin = (new Date(next.start).getTime() - new Date(current.end).getTime()) / 60_000;
			if (gapMin > mergeGapMin) {
				stitched.push(current);
				current = { ...next, a: { ...next.a }, b: { ...next.b } };
				continue;
			}
			const blend = (
				x: DuplicateSideStats,
				y: DuplicateSideStats
			): DuplicateSideStats => ({
				...x,
				count: x.count + y.count,
				median_accuracy:
					x.median_accuracy == null
						? y.median_accuracy
						: y.median_accuracy == null
							? x.median_accuracy
							: Math.round(
									((x.median_accuracy * x.count + y.median_accuracy * y.count) /
										(x.count + y.count)) *
										10
								) / 10
			});
			current = {
				...current,
				end: next.end > current.end ? next.end : current.end,
				a: blend(current.a, next.a),
				b: blend(current.b, next.b),
				pair_count: current.pair_count + next.pair_count
			};
		}
		stitched.push(current);
	}

	stitched.sort((x, y) => x.start.localeCompare(y.start));
	return stitched.map((c, i) => {
		const durationMin = Math.max(
			(new Date(c.end).getTime() - new Date(c.start).getTime()) / 60_000,
			1 / 60
		);
		const a = { ...c.a, points_per_min: c.a.count / durationMin };
		const b = { ...c.b, points_per_min: c.b.count / durationMin };
		return {
			...c,
			id: `c${i + 1}`,
			a,
			b,
			recommended_keep: recommendKeep(a, b)
		};
	});
}

/**
 * Report summary. recommended_remove_count is the naive sum over sections'
 * losing sides; when one stream loses in several adjacent sections a few
 * points may be counted twice, which is fine for an indicative count — the
 * exact delete set is re-derived per section at apply time.
 */
export function buildSummary(clusters: DuplicateCluster[]): DuplicateReportSummary {
	return {
		section_count: clusters.length,
		recommended_remove_count: clusters.reduce(
			(sum, c) => sum + (c.recommended_keep === 'a' ? c.b.count : c.a.count),
			0
		),
		span_start: clusters[0]?.start ?? '',
		span_end: clusters[clusters.length - 1]?.end ?? ''
	};
}

// ============================================================================
// Detection (RPC wrappers)
// ============================================================================

interface RpcResult<T> {
	data?: T;
	error?: { message: string } | null;
}

/**
 * Unwrap an rpc.invoke response into the procedure's rows. The Fluxbase RPC
 * endpoint answers with an execution envelope ({ status, result: [row, ...] })
 * for sync calls, or the rows array directly depending on version — and each
 * row wraps the SQL's single output column under its name. Handle all shapes
 * like refresh-daily-activity.ts does; getting this wrong silently yields
 * "no clusters" instead of an error.
 */
export function unwrapRpcRows(data: unknown, column: string): unknown[] {
	const envelope = data as { result?: unknown } | unknown[] | null;
	let rows: unknown[];
	if (Array.isArray(envelope)) {
		rows = envelope;
	} else if (envelope && typeof envelope === 'object' && Array.isArray(envelope.result)) {
		rows = envelope.result;
	} else {
		return [];
	}
	if (rows.length === 0) return [];
	const first = rows[0] as Record<string, unknown> | unknown;
	if (first && typeof first === 'object' && !Array.isArray(first)) {
		const row = first as Record<string, unknown>;
		if (column in row) {
			const inner = row[column];
			return Array.isArray(inner) ? inner : [];
		}
		// Wrapped under a single key but not the expected column — the SQL
		// changed or the wrong procedure answered; don't pass garbage on.
		const keys = Object.keys(row);
		if (keys.length === 1 && Array.isArray(row[keys[0]])) return [];
	}
	return rows;
}

async function invokeClusterRpc(
	fluxbase: FluxbaseClient,
	args: Record<string, unknown>
): Promise<RawClusterRow[]> {
	const { data, error } = (await fluxbase.rpc.invoke('find-duplicate-clusters', args, {
		namespace: 'wayli'
	})) as RpcResult<unknown>;
	if (error) {
		throw new Error(`find-duplicate-clusters failed: ${error.message}`);
	}
	return unwrapRpcRows(data, 'clusters') as RawClusterRow[];
}

export async function detectForImport(
	fluxbase: FluxbaseClient,
	importId: string,
	source: Pick<DuplicateReportSource, 'format' | 'file_name'>,
	params: DuplicateParams = DEFAULT_DUPLICATE_PARAMS
): Promise<DuplicateReportDraft | null> {
	const rows = await invokeClusterRpc(fluxbase, {
		import_id: importId,
		...params
	});
	if (rows.length === 0) return null;

	const clusters = buildClusters(rows);
	return {
		source_type: 'import',
		source: { kind: 'import', import_id: importId, ...source },
		params,
		clusters,
		summary: buildSummary(clusters)
	};
}

export async function detectForRange(
	fluxbase: FluxbaseClient,
	startDate: string,
	endDate: string,
	params: DuplicateParams = DEFAULT_DUPLICATE_PARAMS
): Promise<DuplicateReportDraft | null> {
	const rows = await invokeClusterRpc(fluxbase, {
		start_date: startDate,
		end_date: endDate,
		...params
	});
	if (rows.length === 0) return null;

	const clusters = buildClusters(rows);
	return {
		source_type: 'scan',
		source: { kind: 'scan', start_date: startDate, end_date: endDate },
		params,
		clusters,
		summary: buildSummary(clusters)
	};
}

/**
 * Exact delete set for one reviewed section: the losing side's points that
 * still match the kept side inside the section window. Re-derived at apply
 * time (never trusted from the report) so points that arrived after the scan
 * are handled with the same predicate that found the section.
 */
export async function findVictims(
	fluxbase: FluxbaseClient,
	section: { keeperKey: string; loserKey: string; start: string; end: string },
	params: DuplicateParams = DEFAULT_DUPLICATE_PARAMS
): Promise<string[]> {
	const { data, error } = (await fluxbase.rpc.invoke(
		'find-duplicate-victims',
		{
			keeper_key: section.keeperKey,
			loser_key: section.loserKey,
			window_start: section.start,
			window_end: section.end,
			time_window_s: params.time_window_s,
			distance_m: params.distance_m
		},
		{ namespace: 'wayli' }
	)) as RpcResult<unknown>;
	if (error) {
		throw new Error(`find-duplicate-victims failed: ${error.message}`);
	}
	return unwrapRpcRows(data, 'victims') as string[];
}

// ============================================================================
// Report persistence
// ============================================================================

export async function writeReport(
	fluxbase: FluxbaseClient,
	userId: string,
	draft: DuplicateReportDraft
): Promise<string> {
	const { data, error } = await fluxbase
		.from('duplicate_reports')
		.insert({
			user_id: userId,
			status: 'pending_review',
			source_type: draft.source_type,
			source: draft.source,
			params: draft.params,
			clusters: draft.clusters,
			summary: draft.summary
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Failed to write duplicate report: ${error?.message ?? 'no row returned'}`);
	}
	return (data as { id: string }).id;
}
