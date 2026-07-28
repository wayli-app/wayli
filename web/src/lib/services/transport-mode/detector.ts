// /Users/bart/Dev/wayli/web/src/lib/services/transport-mode/detector.ts
//
// High-level detector: takes a chronologically-ordered list of observations,
// gap-segments them, runs the HMM per segment, and returns one mode decision
// per point. This is the single entry point shared by the browser (Location
// Data page) and the Deno background job (persistence).

import { SEGMENT_GAP_MS } from './segmentation';
import { extractFeatures } from './features';
import { viterbi, confidenceForPoint, emissionScores } from './model';
import { TRANSPORT_MODES, type TransportMode } from './states';
import type { ModeFeatures, ModeObservation, PointModeDecision } from './types';

function reasonFor(mode: TransportMode, speed: number): string {
	// Human-readable reason string stored in detection_reason. Kept aligned with
	// the TransportDetectionReason enum vocabulary the UI already labels.
	switch (mode) {
		case 'stationary':
			return 'speed_below_stationary_threshold';
		case 'walking':
			return 'speed_in_walking_range';
		case 'cycling':
			return 'speed_in_cycling_range';
		case 'car':
			return speed > 110 ? 'speed_in_high_speed_car_range' : 'speed_in_car_range';
		case 'train':
			return 'steady_speed_with_rail_context';
		case 'airplane':
			return 'speed_in_airplane_range';
		default:
			return 'hmm_decoded';
	}
}

/**
 * Decode an ordered list of observations into per-point transport-mode decisions.
 *
 * The caller MUST pass observations sorted ascending by timestamp. Points are
 * grouped into segments wherever the gap to the previous point exceeds
 * SEGMENT_GAP_MS (5 min) — each segment is decoded independently with Viterbi,
 * which is exactly the boundary where prior context (a tunnel, a flight) should
 * no longer influence the current mode.
 *
 * Returns one PointModeDecision per input observation, index-aligned.
 */
export function detectTransportModes(observations: ModeObservation[]): PointModeDecision[] {
	if (observations.length === 0) return [];

	const decisions: PointModeDecision[] = [];
	let segStart = 0;

	const flushSegment = (endExclusive: number) => {
		const segment = observations.slice(segStart, endExclusive);
		if (segment.length === 0) return;

		const features: ModeFeatures[] = extractFeatures(segment);

		// Single-point segment: no temporal context, score on emission alone.
		if (segment.length === 1) {
			const scores = emissionScores(features[0]);
			let bestIdx = 0;
			let best = -Infinity;
			for (let m = 0; m < scores.length; m++) {
				if (scores[m] > best) {
					best = scores[m];
					bestIdx = m;
				}
			}
			const mode = TRANSPORT_MODES[bestIdx];
			decisions.push({
				timestamp: segment[0].timestamp,
				mode,
				reason: reasonFor(mode, segment[0].speed),
				confidence: confidenceForPoint(features[0], bestIdx)
			});
			return;
		}

		// Multi-point: HMM + Viterbi over the segment.
		const { path } = viterbi(features);
		for (let i = 0; i < segment.length; i++) {
			const mode = TRANSPORT_MODES[path[i]];
			decisions.push({
				timestamp: segment[i].timestamp,
				mode,
				reason: reasonFor(mode, segment[i].speed),
				confidence: confidenceForPoint(features[i], path[i])
			});
		}
	};

	for (let i = 1; i <= observations.length; i++) {
		const isLast = i === observations.length;
		if (isLast) {
			flushSegment(i);
			break;
		}
		const gap = observations[i].timestamp - observations[i - 1].timestamp;
		if (gap > SEGMENT_GAP_MS) {
			flushSegment(i);
			segStart = i;
		}
	}

	return decisions;
}
