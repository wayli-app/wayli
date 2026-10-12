import { fluxbase } from '$lib/fluxbase';

/**
 * Duplicate / overlapping-recordings reports (#274)
 *
 * Client side of duplicate_reports: list/review/dismiss reports created by
 * import-time detection or the data editor's historical scan, build preview
 * point sets for the review map, and submit the cleanup job after the user
 * confirms. Mirrors the backend types in
 * fluxbase/jobs/_shared/services/duplicate-detection.service.ts.
 */

export type SessionKind = 'import' | 'device' | 'legacy' | 'other';

export interface DuplicateSideStats {
	key: string;
	kind: SessionKind;
	count: number;
	median_accuracy: number | null;
	points_per_min: number;
}

export interface DuplicateCluster {
	id: string;
	start: string;
	end: string;
	a: DuplicateSideStats;
	b: DuplicateSideStats;
	pair_count: number;
	recommended_keep: 'a' | 'b';
}

export interface DuplicateReportSource {
	kind: 'import' | 'scan';
	import_id?: string;
	format?: string;
	file_name?: string;
	start_date?: string;
	end_date?: string;
}

export interface DuplicateReportSummary {
	section_count: number;
	recommended_remove_count: number;
	span_start: string;
	span_end: string;
}

export type DuplicateDecision = 'a' | 'b' | 'skip';

export interface DuplicateReport {
	id: string;
	user_id: string;
	status: 'pending_review' | 'applied' | 'dismissed' | 'failed';
	source_type: 'import' | 'scan';
	source: DuplicateReportSource | null;
	clusters: DuplicateCluster[];
	summary: DuplicateReportSummary | null;
	created_at: string;
	updated_at: string;
}

export type KeepDecision = { cluster_id: string; keep: Exclude<DuplicateDecision, 'skip'> };

// ============================================================================
// Detection thresholds (tuning)
// ============================================================================

export interface DuplicateParams {
	/** Max |Δt| for two points to be considered the same moment (seconds). */
	time_window_s: number;
	/** Base match distance in meters; widened by the pair's GPS accuracy. */
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

/** Mirrors PARAM_LIMITS in the backend detection service (authoritative). */
export const PARAM_LIMITS: Record<keyof DuplicateParams, { min: number; max: number }> = {
	time_window_s: { min: 30, max: 600 },
	distance_m: { min: 50, max: 500 },
	merge_gap_min: { min: 2, max: 60 },
	min_pairs: { min: 3, max: 100 }
};

/** Client-side mirror of the backend clampParams (input UX; the scan job
 * clamps with authority before persisting). */
export function clampParams(partial: unknown): DuplicateParams {
	const source = (partial ?? {}) as Record<string, unknown>;
	const merged = { ...DEFAULT_DUPLICATE_PARAMS };
	for (const key of Object.keys(DEFAULT_DUPLICATE_PARAMS) as Array<keyof DuplicateParams>) {
		const raw = source[key];
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
 * The user's saved thresholds (user_preferences.preferences.
 * duplicate_detection), falling back to the defaults when untuned.
 */
export async function getDuplicateParams(): Promise<DuplicateParams> {
	try {
		const { data: userData } = await fluxbase.auth.getUser();
		const userId = userData?.user?.id;
		if (!userId) return { ...DEFAULT_DUPLICATE_PARAMS };

		const { data } = await fluxbase
			.from('user_preferences')
			.select('preferences')
			.eq('id', userId)
			.maybeSingle();
		const prefs = (data as { preferences?: { duplicate_detection?: unknown } } | null)?.preferences;
		return clampParams(prefs?.duplicate_detection);
	} catch (err) {
		console.error('Failed to read duplicate-detection thresholds:', err);
		return { ...DEFAULT_DUPLICATE_PARAMS };
	}
}

export async function listDuplicateReports(
	status: DuplicateReport['status'] = 'pending_review',
	limit = 20
): Promise<DuplicateReport[]> {
	const { data, error } = await fluxbase
		.from('duplicate_reports')
		.select('*')
		.eq('status', status)
		.order('created_at', { ascending: false })
		.limit(limit);

	if (error) throw new Error(error.message);
	return (data ?? []) as unknown as DuplicateReport[];
}

export async function dismissDuplicateReport(reportId: string): Promise<void> {
	const { error } = await fluxbase
		.from('duplicate_reports')
		.update({ status: 'dismissed', updated_at: new Date().toISOString() })
		.eq('id', reportId);
	if (error) throw new Error(error.message);
}

// ============================================================================
// Review-map preview points
// ============================================================================

export interface PreviewPoint {
	recorded_at: string;
	lat: number;
	lng: number;
	session_key: string;
}

/**
 * Mirror of the session-key CASE in find-duplicate-clusters.sql: imports are
 * bucketed by their per-run import_id, pre-feature imports by import hour,
 * live points by device id.
 */
export function sessionKeyOf(p: {
	geocode: unknown;
	device_id: string | null;
	tracker_type: string | null;
}): string {
	const props = (p.geocode as any)?.properties ?? {};
	if (props.import_id) return `import:${props.import_id}`;
	if (props.imported_at) return `legacy:${String(props.imported_at).slice(0, 13)}`;
	if (p.device_id) return `device:${p.device_id}`;
	return `other:${p.tracker_type ?? 'unknown'}`;
}

/**
 * Points for the review map, across the report's span. Fetched in pages and
 * stride-sampled to `cap` so huge imports don't stall the modal.
 */
export async function fetchPreviewPoints(
	userId: string,
	startISO: string,
	endISO: string,
	cap = 4000
): Promise<PreviewPoint[]> {
	const all: Array<PreviewPoint & { device_id: string | null; tracker_type: string | null }> = [];
	let offset = 0;
	const PAGE = 1000;
	const HARD_CAP = 12000;

	while (all.length < HARD_CAP) {
		const { data, error } = await fluxbase
			.from('tracker_data')
			.select('recorded_at, location, device_id, tracker_type, geocode')
			.eq('user_id', userId)
			.gte('recorded_at', startISO)
			.lte('recorded_at', endISO)
			.order('recorded_at', { ascending: true })
			.range(offset, offset + PAGE - 1);

		if (error) throw new Error(error.message);
		const batch = (data ?? []) as any[];
		for (const p of batch as any[]) {
			const loc = p.location;
			const lat = loc?.coordinates?.[1] ?? loc?.lat;
			const lng = loc?.coordinates?.[0] ?? loc?.lng;
			if (typeof lat !== 'number' || typeof lng !== 'number') continue;
			all.push({
				recorded_at: p.recorded_at,
				lat,
				lng,
				session_key: sessionKeyOf(p),
				device_id: p.device_id,
				tracker_type: p.tracker_type
			});
		}
		if (batch.length < PAGE) break;
		offset += PAGE;
	}

	const stride = Math.ceil(all.length / cap);
	return all
		.filter((_, i) => i % stride === 0)
		.map(({ device_id: _d, tracker_type: _t, ...point }) => point);
}
