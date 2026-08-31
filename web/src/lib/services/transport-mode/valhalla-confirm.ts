// web/src/lib/services/transport-mode/valhalla-confirm.ts
// Mirrors fluxbase/jobs/_shared/services/transport-mode/valhalla-confirm.ts. Update both together.
//
import { segmentByGaps, SEGMENT_GAP_MS } from './segmentation';
import type { ModeObservation, PointModeDecision } from './types';
import type { TransportMode } from './states';
import type {
	ValhallaCosting,
	ValhallaTracePoint,
	ValhallaTraceResult
} from '../external/valhalla.service';
import {
	modeFromEdges,
	offRoadClassification,
	railCloneVerdict,
	type RunSpeedStats
} from './valhalla-mapping';
import { haversineMeters } from '../trip-route/trip-route-geometry';

/** Injectable Valhalla client (for tests). */
export interface ValhallaClient {
	traceAttributes(
		points: ValhallaTracePoint[],
		costing: ValhallaCosting
	): Promise<ValhallaTraceResult>;
}

/** Stage-1 modes in the ambiguous overlap zone that benefit from map matching. */
const AMBIGUOUS_MODES = new Set<TransportMode>(['car', 'train']);

/** Stage-1 confidence below this → send to Valhalla for confirmation. */
const CONFIDENCE_THRESHOLD = 0.6;

/** Observed p90 speed (km/h) at or above which a segment is always probed. */
const FAST_SEGMENT_P90_KMH = 60;

/** Observed p90 speed (km/h) at or above which matching always uses `auto`. */
const AUTO_COSTING_P90_KMH = 40;

/** Rail-clone probe window (km/h p90): fast enough to be rail, slow enough to be real. */
const RAIL_PROBE_MIN_P90_KMH = 25;
const RAIL_PROBE_MAX_P90_KMH = 250;

/** Max segments to send per job batch (bounds Valhalla load + job duration). */
const MAX_SEGMENTS_PER_CALL = 150;

/** Max gap (ms) between consecutive segments still treated as one journey. */
const RUN_MERGE_GAP_MS = 30 * 60 * 1000;

/** Map a Stage-1 mode to the Valhalla costing that matches it. */
function costingForMode(mode: TransportMode): ValhallaCosting {
	switch (mode) {
		case 'walking':
		case 'stationary':
			return 'pedestrian';
		case 'cycling':
			return 'bicycle';
		default:
			// car, train, airplane, unknown — auto is the most permissive road matcher.
			return 'auto';
	}
}

/** Percentile of observed speeds (km/h), ignoring missing values. */
function p90Speed(observations: ModeObservation[]): number {
	const speeds = observations
		.map((o) => o.speed)
		.filter((s): s is number => typeof s === 'number' && Number.isFinite(s))
		.toSorted((a, b) => a - b);
	if (speeds.length === 0) return 0;
	const idx = Math.min(speeds.length - 1, Math.floor(speeds.length * 0.9));
	return speeds[idx];
}

function speedStatsFor(observations: ModeObservation[]): RunSpeedStats | null {
	const speeds = observations
		.map((o) => o.speed)
		.filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
	const p90Kmh = p90Speed(observations);
	const durationSec =
		observations.length >= 2
			? (observations[observations.length - 1].timestamp - observations[0].timestamp) / 1000
			: null;
	let pathMeters = 0;
	for (let i = 1; i < observations.length; i++) {
		pathMeters += haversineMeters(observations[i - 1], observations[i]);
	}
	if (speeds.length === 0) return null;
	return {
		p90Kmh,
		avgKmh: durationSec && durationSec > 0 ? (pathMeters / durationSec) * 3.6 : null,
		pathMeters,
		durationSec
	};
}

function tracePoints(observations: ModeObservation[]): ValhallaTracePoint[] {
	return observations.map((o) => ({ lat: o.lat, lon: o.lng, timestamp: o.timestamp }));
}

/**
 * Send uncertain segments to Valhalla and merge the confirmed modes back into
 * the decisions. Everything that isn't overridden passes through untouched.
 * Valhalla failures are logged and swallowed — Stage-1 results are always
 * preserved as the fallback (graceful degradation).
 */
export async function confirmWithValhalla(
	observations: ModeObservation[],
	decisions: PointModeDecision[],
	valhalla: ValhallaClient
): Promise<PointModeDecision[]> {
	if (observations.length === 0 || decisions.length === 0) return decisions;
	if (observations.length !== decisions.length) {
		console.warn(
			`[valhalla-confirm] observations (${observations.length}) != decisions (${decisions.length}); skipping`
		);
		return decisions;
	}

	const segmentIdxGroups = segmentByGaps(observations, SEGMENT_GAP_MS);

	// Segments worth probing (per the gate above).
	const candidateSegments: number[][] = [];
	const isCandidate = (idxs: number[]): boolean => {
		const first = decisions[idxs[0]];
		const p90 = p90Speed(idxs.map((i) => observations[i]));
		return (
			AMBIGUOUS_MODES.has(first.mode) ||
			first.confidence < CONFIDENCE_THRESHOLD ||
			p90 >= FAST_SEGMENT_P90_KMH
		);
	};
	for (const idxs of segmentIdxGroups) {
		if (isCandidate(idxs)) candidateSegments.push(idxs);
	}

	// Merge consecutive segments into runs (see header). Runs are built from
	// ALL segments — not just candidates: a sparse slow window (train crawling
	// through a station) has fragments that fail the candidate gate, but the
	// rail-clone probe evaluates the whole run and deserves those points.
	const runs: number[][] = [];
	for (const idxs of segmentIdxGroups) {
		const run = runs[runs.length - 1];
		if (
			run &&
			observations[idxs[0]].timestamp - observations[run[run.length - 1]].timestamp <
				RUN_MERGE_GAP_MS
		) {
			run.push(...idxs);
		} else {
			runs.push([...idxs]);
		}
	}

	let apiCalls = 0;
	const overCap = () => apiCalls >= MAX_SEGMENTS_PER_CALL;

	const result = [...decisions];
	let confirmed = 0;
	let overridden = 0;
	const apply = (idxs: number[], mode: string, evidence: string, confidence: number) => {
		for (const i of idxs) {
			result[i] = {
				...result[i],
				mode: mode as PointModeDecision['mode'],
				reason: evidence,
				confidence
			};
		}
	};

	for (const runIdxs of runs) {
		const runObs = runIdxs.map((i) => observations[i]);
		if (runObs.length < 2) continue; // a single point cannot be matched
		// Fast runs always use auto: pedestrian/bicycle matching of a fast trace
		// snaps to footways/cycleways and yields impossible verdicts.
		const runP90 = p90Speed(runObs);
		const runCosting: ValhallaCosting =
			runP90 >= AUTO_COSTING_P90_KMH ? 'auto' : costingForMode(decisions[runIdxs[0]].mode);

		// 0. Rail-clone probe: for rail-plausible runs, a pedestrian match that
		//    lands on "RAILWAY | …" clone paths is DEFINITIVE train evidence —
		//    it fires even when the road match looks plausible (train running
		//    parallel to a trunk road). Definitive → skip all other probing.
		//    Rail-plausibility is measured over MOVING points only: a train's
		//    station dwells (walking-speed points) must not drag the run's
		//    speed profile below the probe window (the Jul-7 urban case).
		const movingObs = runObs.filter((o) => (o.speed ?? 0) >= 5);
		const probeP90 = movingObs.length >= 2 ? p90Speed(movingObs) : runP90;
		if (probeP90 >= RAIL_PROBE_MIN_P90_KMH && probeP90 <= RAIL_PROBE_MAX_P90_KMH && !overCap()) {
			try {
				// eslint-disable-next-line no-await-in-loop -- one bounded probe per run
				const railTrace = await valhalla.traceAttributes(tracePoints(runObs), 'pedestrian');
				apiCalls++;
				const railVerdict = railCloneVerdict(railTrace.edges);
				if (railVerdict) {
					confirmed++;
					if (railVerdict.mode !== decisions[runIdxs[0]].mode) overridden++;
					apply(runIdxs, railVerdict.mode, railVerdict.evidence, railVerdict.confidence);
					continue;
				}
			} catch (err) {
				// Non-fatal — fall through to the regular probing below.
				console.warn(
					`[valhalla-confirm] rail-clone probe failed for run (${runObs[0].timestamp}):`,
					err instanceof Error ? err.message : err
				);
			}
		}

		// 1. Per-segment probing + sanity-gated edge verdicts. Segments outside
		//    the confirm gate are still matched here when they sit inside a run —
		//    their shape/edges feed the union off-road check below.
		interface Probed {
			shape: Array<{ lat: number; lng: number }>;
			edges: ValhallaTraceResult['edges'];
		}
		const probed: Probed[] = [];
		for (const idxs of segmentIdxGroups) {
			// Only candidate segments get individual probes (cost control) —
			// non-candidate points in the run are covered by the rail probe
			// above or keep their Stage-1 result.
			if (idxs.length < 2 || !isCandidate(idxs) || !idxs.some((i) => runIdxs.includes(i))) continue;
			if (overCap()) break;
			const segmentObs = idxs.map((i) => observations[i]);
			const segP90 = p90Speed(segmentObs);
			const segCosting: ValhallaCosting =
				segP90 >= AUTO_COSTING_P90_KMH ? 'auto' : costingForMode(decisions[idxs[0]].mode);
			try {
				// eslint-disable-next-line no-await-in-loop -- segments are matched sequentially by design (bounded by MAX_SEGMENTS_PER_CALL)
				const trace = await valhalla.traceAttributes(tracePoints(segmentObs), segCosting);
				apiCalls++;
				probed.push({
					shape: trace.shape.map((s) => ({ lat: s.lat, lng: s.lon })),
					edges: trace.edges
				});

				const segStats = speedStatsFor(segmentObs);
				const verdict =
					trace.edges.length > 0 ? modeFromEdges(trace.edges, segStats ?? undefined) : null;
				// Per-segment off-road: a single segment can already be a complete
				// train leg (poor match, rail-like speed, long enough on its own).
				const segOffRoad =
					segCosting === 'auto' && segStats
						? offRoadClassification({
								raw: segmentObs,
								shape: trace.shape.map((s) => ({ lat: s.lat, lng: s.lon })),
								edges: trace.edges,
								speedsKmh: segmentObs
									.map((o) => o.speed)
									.filter((s): s is number => typeof s === 'number'),
								durationSec: segStats.durationSec
							})
						: null;
				const segFinal = segOffRoad ?? verdict;
				if (segFinal) {
					confirmed++;
					if (segFinal.mode !== decisions[idxs[0]].mode) overridden++;
					apply(idxs, segFinal.mode, segFinal.evidence, segFinal.confidence);
				}
			} catch (err) {
				// Non-fatal: log and keep Stage-1 for this segment.
				console.warn(
					`[valhalla-confirm] trace_attributes failed for segment (${segmentObs[0].timestamp}):`,
					err instanceof Error ? err.message : err
				);
			}
		}

		// 2. Off-road rule on the run UNION (auto-costing runs only). Whole-run
		//    probe when no segment qualified on its own; a failed probe counts
		//    as unmatched — itself the train signal.
		if (runCosting === 'auto') {
			let unionShape: Array<{ lat: number; lng: number }> = [];
			let unionEdges: ValhallaTraceResult['edges'] = [];
			let haveProbe = probed.length > 0;
			if (haveProbe) {
				for (const p of probed) {
					unionShape.push(...p.shape);
					unionEdges.push(...p.edges);
				}
			} else if (runObs.length >= 3 && !overCap()) {
				try {
					// eslint-disable-next-line no-await-in-loop -- one bounded whole-run probe
					const trace = await valhalla.traceAttributes(tracePoints(runObs), runCosting);
					apiCalls++;
					haveProbe = true;
					unionShape = trace.shape.map((s) => ({ lat: s.lat, lng: s.lon }));
					unionEdges = trace.edges;
				} catch (err) {
					// The run as a whole can't be snapped to roads — unmatched.
					haveProbe = true;
					console.warn(
						`[valhalla-confirm] whole-run probe failed for run (${runObs[0].timestamp}) — treating as unmatched:`,
						err instanceof Error ? err.message : err
					);
				}
			}

			const runStats = speedStatsFor(runObs);
			if (haveProbe && runStats) {
				const offRoad = offRoadClassification({
					raw: runObs,
					shape: unionShape,
					edges: unionEdges,
					speedsKmh: runObs.map((o) => o.speed).filter((s): s is number => typeof s === 'number'),
					durationSec: runStats.durationSec
				});
				if (offRoad) {
					confirmed++;
					if (offRoad.mode !== decisions[runIdxs[0]].mode) overridden++;
					apply(runIdxs, offRoad.mode, offRoad.evidence, offRoad.confidence);
				}
			}
		}
	}

	if (confirmed > 0) {
		console.log(`[valhalla-confirm] ${confirmed} verdicts applied, ${overridden} overridden`);
	}

	return result;
}
