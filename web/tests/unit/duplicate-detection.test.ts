/**
 * Duplicate / overlapping-recordings detection unit tests (#274)
 *
 * Covers the pure decision logic of the detection service: session keys,
 * quality scoring, keep recommendations, section building/stitching, summary
 * math, and the scan's month chunking. The RPC itself (find-duplicate-clusters)
 * and the jobs that call it run on the Fluxbase platform and are exercised
 * manually (see fluxbase/jobs/README.md).
 */
import { describe, expect, it } from 'vitest';

import {
	buildClusters,
	buildSummary,
	clampParams,
	DEFAULT_DUPLICATE_PARAMS,
	monthWindows,
	PARAM_LIMITS,
	parseSessionKey,
	qualityScore,
	recommendKeep,
	stitchClusters,
	type DuplicateCluster,
	type DuplicateSideStats
} from '../../../fluxbase/jobs/_shared/services/duplicate-detection.service';

function side(partial: Partial<DuplicateSideStats>): DuplicateSideStats {
	return {
		key: 'device:test',
		kind: 'device',
		count: 100,
		median_accuracy: 10,
		points_per_min: 1,
		...partial
	};
}

describe('parseSessionKey', () => {
	it('splits kind and value for all session kinds', () => {
		expect(parseSessionKey('import:abc-123')).toEqual({ kind: 'import', value: 'abc-123' });
		expect(parseSessionKey('device:owntracks-pixel')).toEqual({
			kind: 'device',
			value: 'owntracks-pixel'
		});
		expect(parseSessionKey('legacy:2026-06-03T13')).toEqual({
			kind: 'legacy',
			value: '2026-06-03T13'
		});
		expect(parseSessionKey('other:manual')).toEqual({ kind: 'other', value: 'manual' });
	});

	it('tolerates a key without a colon', () => {
		expect(parseSessionKey('weird')).toEqual({ kind: 'weird', value: '' });
	});
});

describe('qualityScore', () => {
	it('rewards density up to the 30 pts/min ceiling', () => {
		const sparse = qualityScore(side({ points_per_min: 0.5 }));
		const moderate = qualityScore(side({ points_per_min: 5 }));
		const saturated = qualityScore(side({ points_per_min: 60 }));
		expect(moderate).toBeGreaterThan(sparse);
		// 60 pts/min clamps to the same score as exactly 30.
		expect(saturated).toBe(qualityScore(side({ points_per_min: 30 })));
	});

	it('rewards better (lower) median accuracy', () => {
		expect(qualityScore(side({ median_accuracy: 5 }))).toBeGreaterThan(
			qualityScore(side({ median_accuracy: 50 }))
		);
	});

	it('treats unknown accuracy as mid-range, not as best or worst', () => {
		const unknown = qualityScore(side({ median_accuracy: null }));
		expect(unknown).toBeGreaterThan(qualityScore(side({ median_accuracy: 100 })));
		expect(unknown).toBeLessThan(qualityScore(side({ median_accuracy: 5 })));
	});
});

describe('recommendKeep', () => {
	it('prefers a clearly better recording: dense accurate FIT beats sparse noisy device', () => {
		const fit = side({ key: 'import:fit', kind: 'import', points_per_min: 60, median_accuracy: 5 });
		const device = side({
			key: 'device:a',
			kind: 'device',
			points_per_min: 0.5,
			median_accuracy: 35
		});
		expect(recommendKeep(fit, device)).toBe('a');
		expect(recommendKeep(device, fit)).toBe('b');
	});

	it('breaks near-ties in favour of the live recording over an import', () => {
		const device = side({
			key: 'device:a',
			kind: 'device',
			points_per_min: 2,
			median_accuracy: 10
		});
		const gpx = side({ key: 'import:gpx', kind: 'import', points_per_min: 2, median_accuracy: 10 });
		expect(recommendKeep(gpx, device)).toBe('b');
		expect(recommendKeep(device, gpx)).toBe('a');
	});

	it('breaks same-kind ties by density, then by stable key order', () => {
		const dense = side({ key: 'device:a', kind: 'device', points_per_min: 4, median_accuracy: 10 });
		const sparse = side({
			key: 'device:b',
			kind: 'device',
			points_per_min: 1,
			median_accuracy: 10
		});
		expect(recommendKeep(sparse, dense)).toBe('b');

		const tieA = side({ key: 'device:a', points_per_min: 2 });
		const tieB = side({ key: 'device:b', points_per_min: 2 });
		expect(recommendKeep(tieA, tieB)).toBe('a');
		expect(recommendKeep(tieB, tieA)).toBe('b');
	});
});

describe('buildClusters', () => {
	it('assigns stable ids, computes per-minute density and a recommendation', () => {
		const clusters = buildClusters([
			{
				key_a: 'import:fit-file',
				key_b: 'device:phone',
				start_ts: '2026-06-03T06:12:00Z',
				end_ts: '2026-06-03T09:45:00Z',
				pair_count: 600,
				count_a: 12000,
				count_b: 640,
				median_acc_a: 5,
				median_acc_b: 35,
				duration_s: 12780
			}
		]);

		expect(clusters).toHaveLength(1);
		const c = clusters[0];
		expect(c.id).toBe('c1');
		expect(c.a.points_per_min).toBeCloseTo(12000 / 213, 5);
		expect(c.b.points_per_min).toBeCloseTo(640 / 213, 5);
		expect(c.a.kind).toBe('import');
		expect(c.b.kind).toBe('device');
		// 1 Hz ±5m clearly beats ~3/min ±35m.
		expect(c.recommended_keep).toBe('a');
	});
});

describe('stitchClusters', () => {
	const base = {
		pair_count: 10,
		recommended_keep: 'a' as const
	};

	it('merges adjacent same-pair sections across a scan-window boundary', () => {
		const clusters: DuplicateCluster[] = [
			{
				...base,
				id: 'c1',
				start: '2026-05-31T10:00:00Z',
				end: '2026-05-31T12:00:00Z',
				a: side({ key: 'device:phone', count: 240, points_per_min: 2 }),
				b: side({ key: 'import:fit', kind: 'import', count: 7000, points_per_min: 58 })
			},
			{
				...base,
				id: 'c2',
				start: '2026-05-31T12:05:00Z',
				end: '2026-05-31T14:00:00Z',
				a: side({ key: 'device:phone', count: 240, points_per_min: 2 }),
				b: side({ key: 'import:fit', kind: 'import', count: 6900, points_per_min: 58 })
			}
		];

		const stitched = stitchClusters(clusters, DEFAULT_DUPLICATE_PARAMS.merge_gap_min);
		expect(stitched).toHaveLength(1);
		expect(stitched[0].id).toBe('c1');
		expect(stitched[0].start).toBe('2026-05-31T10:00:00Z');
		expect(stitched[0].end).toBe('2026-05-31T14:00:00Z');
		expect(stitched[0].a.count).toBe(480);
		expect(stitched[0].b.count).toBe(13900);
		expect(stitched[0].pair_count).toBe(20);
		// Density recomputed over the merged span keeps the recommendation honest.
		expect(stitched[0].b.points_per_min).toBeCloseTo(13900 / 240, 5);
	});

	it('keeps sections of the same pair separate beyond the merge gap', () => {
		const clusters: DuplicateCluster[] = [
			{
				...base,
				id: 'c1',
				start: '2026-05-31T08:00:00Z',
				end: '2026-05-31T09:00:00Z',
				a: side({ key: 'device:phone', count: 100 }),
				b: side({ key: 'import:fit', kind: 'import', count: 3000 })
			},
			{
				...base,
				id: 'c2',
				// 3h later — a second ride the same day, not a continuation.
				start: '2026-05-31T12:00:00Z',
				end: '2026-05-31T13:00:00Z',
				a: side({ key: 'device:phone', count: 100 }),
				b: side({ key: 'import:fit', kind: 'import', count: 3000 })
			}
		];

		expect(stitchClusters(clusters, DEFAULT_DUPLICATE_PARAMS.merge_gap_min)).toHaveLength(2);
	});

	it('never merges different session pairs', () => {
		const clusters: DuplicateCluster[] = [
			{
				...base,
				id: 'c1',
				start: '2026-05-31T10:00:00Z',
				end: '2026-05-31T12:00:00Z',
				a: side({ key: 'device:phone', count: 100 }),
				b: side({ key: 'import:fit', kind: 'import', count: 3000 })
			},
			{
				...base,
				id: 'c2',
				start: '2026-05-31T10:30:00Z',
				end: '2026-05-31T12:30:00Z',
				a: side({ key: 'device:phone', count: 100 }),
				b: side({ key: 'device:watch', count: 3000 })
			}
		];

		expect(stitchClusters(clusters, DEFAULT_DUPLICATE_PARAMS.merge_gap_min)).toHaveLength(2);
	});
});

describe('buildSummary', () => {
	it('counts sections and the points the recommendations would remove', () => {
		const summary = buildSummary([
			{
				id: 'c1',
				start: '2026-06-03T06:00:00Z',
				end: '2026-06-03T09:00:00Z',
				a: side({ key: 'import:fit', kind: 'import', count: 10000 }),
				b: side({ key: 'device:phone', count: 600 }),
				pair_count: 300,
				recommended_keep: 'a'
			},
			{
				id: 'c2',
				start: '2026-06-04T06:00:00Z',
				end: '2026-06-04T07:00:00Z',
				a: side({ key: 'device:watch', count: 200 }),
				b: side({ key: 'import:fit', kind: 'import', count: 5000 }),
				pair_count: 150,
				recommended_keep: 'b'
			}
		]);

		expect(summary.section_count).toBe(2);
		expect(summary.recommended_remove_count).toBe(600 + 200);
		expect(summary.span_start).toBe('2026-06-03T06:00:00Z');
		expect(summary.span_end).toBe('2026-06-04T07:00:00Z');
	});
});

describe('monthWindows', () => {
	it('splits a range into UTC calendar months, clamped to whole months', () => {
		const windows = monthWindows(
			new Date('2026-05-15T08:00:00Z'),
			new Date('2026-07-02T10:00:00Z')
		);
		expect(windows).toHaveLength(3);
		expect(windows[0].start.toISOString()).toBe('2026-05-01T00:00:00.000Z');
		expect(windows[0].end.toISOString()).toBe('2026-05-31T23:59:59.999Z');
		expect(windows[1].start.toISOString()).toBe('2026-06-01T00:00:00.000Z');
		expect(windows[2].end.toISOString()).toBe('2026-07-31T23:59:59.999Z');
	});

	it('returns one window when both dates sit in the same month', () => {
		expect(
			monthWindows(new Date('2026-06-03T00:00:00Z'), new Date('2026-06-20T00:00:00Z'))
		).toHaveLength(1);
	});
});

describe('clampParams', () => {
	it('returns the defaults for null/undefined/partial input', () => {
		expect(clampParams(null)).toEqual(DEFAULT_DUPLICATE_PARAMS);
		expect(clampParams(undefined)).toEqual(DEFAULT_DUPLICATE_PARAMS);
		expect(clampParams({})).toEqual(DEFAULT_DUPLICATE_PARAMS);
		expect(clampParams({ distance_m: 300 })).toEqual({
			...DEFAULT_DUPLICATE_PARAMS,
			distance_m: 300
		});
	});

	it('coerces numeric strings and rounds fractions', () => {
		expect(clampParams({ time_window_s: '240', min_pairs: 7.6 })).toEqual({
			...DEFAULT_DUPLICATE_PARAMS,
			time_window_s: 240,
			min_pairs: 8
		});
	});

	it('clamps every field into its hard bounds', () => {
		expect(
			clampParams({ time_window_s: 5, distance_m: 9999, merge_gap_min: 0, min_pairs: 1e9 })
		).toEqual({
			time_window_s: PARAM_LIMITS.time_window_s.min,
			distance_m: PARAM_LIMITS.distance_m.max,
			merge_gap_min: PARAM_LIMITS.merge_gap_min.min,
			min_pairs: PARAM_LIMITS.min_pairs.max
		});
	});

	it('ignores non-finite values instead of producing NaN thresholds', () => {
		expect(clampParams({ time_window_s: 'abc', distance_m: NaN, merge_gap_min: null })).toEqual(
			DEFAULT_DUPLICATE_PARAMS
		);
	});
});
