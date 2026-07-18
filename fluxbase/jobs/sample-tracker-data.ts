/**
 * Nightly data sampling job
 *
 * For each user who has explicitly opted in (user_data_sampling.enabled = true),
 * applies hybrid sampling: keeps points that are at least `min_distance_m` meters
 * AND `min_time_s` seconds apart from the previously kept point.
 *
 * Opt-in only. Never touches users without a config row.
 *
 * @fluxbase:require-role admin, service_role
 * @fluxbase:timeout 7200
 * @fluxbase:progress-timeout 7200
 * @fluxbase:allow-net true
 * @fluxbase:allow-env true
 * @fluxbase:schedule 0 4 * * *
 */

import type { FluxbaseClient, JobUtils } from './types';

const BATCH_DELETE = 500; // recorded_at values per DELETE request
const PAGE_SIZE = 1000; // fluxbase .select() page size (API cap)

interface SamplingConfig {
	user_id: string;
	enabled: boolean;
	min_distance_m: number;
	min_time_s: number;
}

interface TrackerPoint {
	recorded_at: string;
	lat: number;
	lng: number;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const R = 6371000;
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pickPointsToKeep(points: TrackerPoint[], cfg: SamplingConfig): Set<string> {
	// ponytail: O(n) single pass; sufficient for typical user (10k–500k points)
	const keep = new Set<string>();
	if (points.length === 0) return keep;

	let lastKept = points[0];
	keep.add(lastKept.recorded_at);

	for (let i = 1; i < points.length; i++) {
		const curr = points[i];
		const dist = haversineMeters(lastKept.lat, lastKept.lng, curr.lat, curr.lng);
		const dt =
			(new Date(curr.recorded_at).getTime() - new Date(lastKept.recorded_at).getTime()) / 1000;
		// Hybrid: must satisfy BOTH thresholds
		if (dist >= cfg.min_distance_m && dt >= cfg.min_time_s) {
			keep.add(curr.recorded_at);
			lastKept = curr;
		}
	}
	return keep;
}

async function fetchUserPoints(
	fluxbaseService: FluxbaseClient,
	userId: string
): Promise<TrackerPoint[]> {
	const all: TrackerPoint[] = [];
	let offset = 0;
	// ponytail: paginated walk — API caps .select() at 1000 rows
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const { data, error } = await fluxbaseService
			.from('tracker_data')
			.select('recorded_at, location')
			.eq('user_id', userId)
			.order('recorded_at', { ascending: true })
			.range(offset, offset + PAGE_SIZE - 1);
		if (error) throw error;
		const rows = (data as any[]) ?? [];
		for (const r of rows) {
			// location is a PostGIS point — comes back as WKB or {x,y} or "lat,lng" string
			const loc = r.location;
			let lat: number | null = null;
			let lng: number | null = null;
			if (loc && typeof loc === 'object' && 'x' in loc && 'y' in loc) {
				lng = Number(loc.x);
				lat = Number(loc.y);
			} else if (typeof loc === 'string') {
				const m = loc.match(/-?\d+(\.\d+)?/g);
				if (m && m.length >= 2) {
					lng = Number(m[0]);
					lat = Number(m[1]);
				}
			}
			if (lat != null && lng != null) {
				all.push({ recorded_at: r.recorded_at, lat, lng });
			}
		}
		if (rows.length < PAGE_SIZE) break;
		offset += PAGE_SIZE;
	}
	return all;
}

async function deleteRecordedAt(
	fluxbaseService: FluxbaseClient,
	userId: string,
	timestamps: string[]
): Promise<void> {
	for (let i = 0; i < timestamps.length; i += BATCH_DELETE) {
		const batch = timestamps.slice(i, i + BATCH_DELETE);
		const { error } = await fluxbaseService
			.from('tracker_data')
			.delete()
			.eq('user_id', userId)
			.in('recorded_at', batch);
		if (error) throw error;
	}
}

async function processUser(
	fluxbaseService: FluxbaseClient,
	cfg: SamplingConfig
): Promise<{ deleted: number; total: number }> {
	const points = await fetchUserPoints(fluxbaseService, cfg.user_id);
	if (points.length === 0) return { deleted: 0, total: 0 };

	const keepSet = pickPointsToKeep(points, cfg);
	const toDelete = points.filter((p) => !keepSet.has(p.recorded_at)).map((p) => p.recorded_at);

	if (toDelete.length > 0) {
		await deleteRecordedAt(fluxbaseService, cfg.user_id, toDelete);
	}

	await fluxbaseService
		.from('user_data_sampling')
		.update({
			last_run_at: new Date().toISOString(),
			last_deleted: toDelete.length
		})
		.eq('user_id', cfg.user_id);

	return { deleted: toDelete.length, total: points.length };
}

export async function handler(
	_req: Request,
	_fluxbase: FluxbaseClient,
	fluxbaseService: FluxbaseClient,
	job: JobUtils
) {
	const log = (msg: string) => {
		console.log(msg);
		try {
			(job.reportProgress as (p: number | null, m: string) => void)?.(null, msg);
		} catch {
			/* ignore */
		}
	};

	log('Starting nightly data sampling (opt-in users only)');

	const { data: configs, error } = await fluxbaseService
		.from('user_data_sampling')
		.select('user_id, enabled, min_distance_m, min_time_s')
		.eq('enabled', true);

	if (error) {
		console.error('Failed to fetch sampling configs:', error);
		return { success: false, error: error.message };
	}

	const enabled = (configs as SamplingConfig[]) ?? [];
	log(`Found ${enabled.length} user(s) with sampling enabled`);

	let totalDeleted = 0;
	let totalProcessed = 0;
	const errors: Array<{ user_id: string; error: string }> = [];

	for (let i = 0; i < enabled.length; i++) {
		const cfg = enabled[i];
		log(`[${i + 1}/${enabled.length}] Processing user ${cfg.user_id.slice(0, 8)}…`);
		try {
			const result = await processUser(fluxbaseService, cfg);
			totalDeleted += result.deleted;
			totalProcessed += result.total;
			log(`  → deleted ${result.deleted} / ${result.total} points`);
		} catch (err: any) {
			console.error(`User ${cfg.user_id} failed:`, err?.message ?? err);
			errors.push({ user_id: cfg.user_id, error: String(err?.message ?? err) });
		}
	}

	log(`Done. Deleted ${totalDeleted} of ${totalProcessed} points across ${enabled.length} users.`);
	return {
		success: true,
		result: {
			users_processed: enabled.length,
			users_failed: errors.length,
			total_deleted: totalDeleted,
			total_processed: totalProcessed,
			errors
		}
	};
}
