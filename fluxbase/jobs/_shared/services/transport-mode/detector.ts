// /Users/bart/Dev/wayli/fluxbase/jobs/_shared/services/transport-mode/detector.ts
// Mirrors web/src/lib/services/transport-mode/detector.ts. Update both together.

import { SEGMENT_GAP_MS } from './segmentation.ts';
import { extractFeatures } from './features.ts';
import { viterbi, confidenceForPoint, emissionScores } from './model.ts';
import { TRANSPORT_MODES, type TransportMode } from './states.ts';
import type { ModeFeatures, ModeObservation, PointModeDecision } from './types.ts';

function reasonFor(mode: TransportMode, speed: number): string {
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

export function detectTransportModes(observations: ModeObservation[]): PointModeDecision[] {
	if (observations.length === 0) return [];
	const decisions: PointModeDecision[] = [];
	let segStart = 0;

	const flushSegment = (endExclusive: number) => {
		const segment = observations.slice(segStart, endExclusive);
		if (segment.length === 0) return;
		const features: ModeFeatures[] = extractFeatures(segment);

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
