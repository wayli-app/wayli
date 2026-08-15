// /Users/bart/Dev/wayli/fluxbase/jobs/_shared/services/transport-mode/valhalla-confirm.ts
//
// Stage 2 of the two-stage transport-mode pipeline. Stage 1 (the HMM/Viterbi
// detector) produces candidate modes from speed/heading/geocode signals. This
// stage sends AMBIGUOUS segments to Valhalla's map matcher, which snaps the
// GPS points to the OSM road/rail network — the matched edges give definitive
// ground truth (a rail edge IS a train).
//
// Only segments where Stage 1 is uncertain or in the car/train overlap zone
// are sent (~20% of segments), keeping Valhalla load manageable.

import { segmentByGaps, SEGMENT_GAP_MS } from './segmentation';
import type { ModeObservation, PointModeDecision } from './types';
import type { TransportMode } from './states';
import type { ValhallaCosting, ValhallaTracePoint, ValhallaTraceResult } from '../external/valhalla.service';
import { modeFromEdges } from './valhalla-mapping';

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

/** Max segments to send per call (bounds Valhalla load + job duration). */
const MAX_SEGMENTS_PER_CALL = 50;

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

/**
 * Send ambiguous segments to Valhalla and merge the confirmed modes back into
 * the decisions. Non-ambiguous, high-confidence decisions pass through
 * untouched. Valhalla failures are logged and swallowed — Stage-1 results are
 * always preserved as the fallback (graceful degradation).
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

	// Group into gap-bounded segments (same splitter the detector uses).
	const segmentIdxGroups = segmentByGaps(observations, SEGMENT_GAP_MS);

	// Pick the segments that need confirmation.
	const toConfirm: number[][] = [];
	for (const idxs of segmentIdxGroups) {
		if (idxs.length < 3) continue; // too short to match meaningfully
		const first = decisions[idxs[0]];
		const needsConfirm =
			AMBIGUOUS_MODES.has(first.mode) || first.confidence < CONFIDENCE_THRESHOLD;
		if (needsConfirm) toConfirm.push(idxs);
	}

	// Cap the number of API calls.
	if (toConfirm.length > MAX_SEGMENTS_PER_CALL) {
		toConfirm.length = MAX_SEGMENTS_PER_CALL;
	}

	if (toConfirm.length === 0) return decisions;

	const result = [...decisions];
	let confirmed = 0;
	let overridden = 0;

	for (const idxs of toConfirm) {
		const segmentObs = idxs.map((i) => observations[i]);
		const stage1Mode = decisions[idxs[0]].mode;
		const costing = costingForMode(stage1Mode);

		try {
			const points: ValhallaTracePoint[] = segmentObs.map((o) => ({
				lat: o.lat,
				lon: o.lng,
				timestamp: o.timestamp
			}));
			const trace = await valhalla.traceAttributes(points, costing);

			if (!trace.matched || trace.edges.length === 0) continue; // no match — keep Stage-1

			const verdict = modeFromEdges(trace.edges);
			if (!verdict) continue; // inconclusive — keep Stage-1

			confirmed++;
			if (verdict.mode !== stage1Mode) overridden++;

			// Apply the verdict to every point in the segment.
			for (const i of idxs) {
				result[i] = {
					...result[i],
					mode: verdict.mode,
					reason: verdict.evidence,
					confidence: verdict.confidence
				};
			}
		} catch (err) {
			// Non-fatal: log and keep Stage-1 for this segment.
			console.warn(
				`[valhalla-confirm] trace_attributes failed for segment (${segmentObs[0].timestamp}):`,
				err instanceof Error ? err.message : err
			);
		}
	}

	if (confirmed > 0) {
		console.log(
			`[valhalla-confirm] ${confirmed}/${toConfirm.length} segments matched, ${overridden} overridden`
		);
	}

	return result;
}
