// /Users/bart/Dev/wayli/fluxbase/jobs/_shared/services/transport-mode/model.ts
// Mirrors web/src/lib/services/transport-mode/model.ts. Update both together.

import {
	MODE_PHYSICAL_LIMITS,
	MODE_CONTINUITY_LIMITS,
	SPEED_CV_THRESHOLDS
} from './config.ts';
import { NUM_MODES, TRANSPORT_MODES, MODE_INDEX } from './states.ts';
import type { ModeFeatures } from './types.ts';

const LOG_ZERO = -Infinity;

function safeLog(p: number): number {
	return p <= 0 ? LOG_ZERO : Math.log(p);
}

function buildTransitionMatrix(): number[][] {
	const SELF = 0.97;
	const remaining = 1 - SELF;
	const T: number[][] = Array.from({ length: NUM_MODES }, () => new Array(NUM_MODES).fill(0));
	for (let i = 0; i < NUM_MODES; i++) {
		const fromMode = TRANSPORT_MODES[i];
		const fromMax = MODE_PHYSICAL_LIMITS[fromMode].max;
		const weights = new Array(NUM_MODES).fill(0);
		let weightSum = 0;
		for (let j = 0; j < NUM_MODES; j++) {
			if (j === i) continue;
			const toMode = TRANSPORT_MODES[j];
			const toMax = MODE_PHYSICAL_LIMITS[toMode].max;
			const overlap = Math.min(fromMax, toMax);
			const continuity = MODE_CONTINUITY_LIMITS[toMode]?.maxSpeedDiff ?? 30;
			const plausibility = Math.min(1, continuity / 50) * (overlap > 0 ? 1 : 0.1);
			weights[j] = plausibility;
			weightSum += plausibility;
		}
		T[i][i] = SELF;
		if (weightSum > 0) {
			for (let j = 0; j < NUM_MODES; j++) {
				if (j === i) continue;
				T[i][j] = (remaining * weights[j]) / weightSum;
			}
		} else {
			T[i][i] = 1;
		}
		const rowSum = T[i].reduce((a, b) => a + b, 0);
		if (rowSum > 0) for (let j = 0; j < NUM_MODES; j++) T[i][j] /= rowSum;
	}
	return T.map((row) => row.map(safeLog));
}

export function emissionScores(f: ModeFeatures): number[] {
	const scores = new Array(NUM_MODES).fill(1);
	const PRIOR: Record<string, number> = {
		stationary: 1.0,
		walking: 1.0,
		cycling: 0.9,
		car: 1.0,
		train: 0.45,
		airplane: 0.05
	};
	for (let m = 0; m < NUM_MODES; m++) {
		const mode = TRANSPORT_MODES[m];
		const limits = MODE_PHYSICAL_LIMITS[mode];
		const coreMin = limits.min + (limits.max - limits.min) * 0.2;
		const coreMax = limits.min + (limits.max - limits.min) * 0.8;
		let s: number;
		if (f.speed >= coreMin && f.speed <= coreMax) {
			s = 1;
		} else if (f.speed >= limits.min && f.speed < coreMin) {
			s = 0.1 + 0.9 * ((f.speed - limits.min) / (coreMin - limits.min));
		} else if (f.speed > coreMax && f.speed <= limits.max) {
			s = 0.1 + 0.9 * ((limits.max - f.speed) / (limits.max - coreMax));
		} else if (f.speed < limits.min) {
			s = Math.max(0.0008, 0.1 * Math.max(0, 1 - (limits.min - f.speed) / 5));
		} else {
			s = Math.max(0.0008, 0.1 * Math.max(0, 1 - (f.speed - limits.max) / 15));
		}
		if (mode === 'train' || mode === 'car') {
			if (f.speed >= 55 && f.speed <= 115) {
				if (mode === 'train') {
					if (f.speedCV < 0.08) s *= 2.6;
					else if (f.speedCV > SPEED_CV_THRESHOLDS.CAR_LIKE) s *= 0.6;
				} else {
					if (f.speedCV > SPEED_CV_THRESHOLDS.CAR_LIKE) s *= 1.2;
				}
				if (mode === 'train' && f.headingTurnRate > 5) s *= 0.5;
			}
		}
		if (mode === 'train' && f.atTrainStation) s *= 4.0;
		if (mode === 'airplane' && f.atAirport) s *= 4.0;
		if (mode === 'car' && f.onHighway && f.speed > 50) s *= 1.8;
		if (mode === 'stationary' && f.atVenue && f.speed < 3) s *= 2.5;
		if (f.atTrainStation && (mode === 'car' || mode === 'cycling')) s *= 0.3;
		if (f.atAirport && mode !== 'airplane' && mode !== 'stationary') s *= 0.3;
		s = s * (0.3 + 0.7 * f.accuracyWeight);
		s *= PRIOR[mode] ?? 1;
		scores[m] = s;
	}
	return scores;
}

export interface ViterbiResult {
	path: number[];
	logProbs: number[];
}

export function viterbi(features: ModeFeatures[]): ViterbiResult {
	const n = features.length;
	if (n === 0) return { path: [], logProbs: [] };
	const logT = buildTransitionMatrix();
	const start = new Array(NUM_MODES).fill(safeLog(1 / NUM_MODES));
	start[MODE_INDEX['stationary']] = safeLog((1 / NUM_MODES) * 1.3);
	const dp: number[][] = Array.from({ length: n }, () => new Array(NUM_MODES).fill(LOG_ZERO));
	const back: number[][] = Array.from({ length: n }, () => new Array(NUM_MODES).fill(0));
	const e0 = emissionScores(features[0]);
	for (let s = 0; s < NUM_MODES; s++) dp[0][s] = start[s] + safeLog(e0[s]);
	for (let t = 1; t < n; t++) {
		const et = emissionScores(features[t]);
		for (let s = 0; s < NUM_MODES; s++) {
			let best = LOG_ZERO;
			let bestPrev = 0;
			for (let p = 0; p < NUM_MODES; p++) {
				const val = dp[t - 1][p] + logT[p][s];
				if (val > best) {
					best = val;
					bestPrev = p;
				}
			}
			dp[t][s] = best + safeLog(et[s]);
			back[t][s] = bestPrev;
		}
	}
	const path = new Array(n);
	let bestFinal = 0;
	let bestFinalVal = LOG_ZERO;
	for (let s = 0; s < NUM_MODES; s++) {
		if (dp[n - 1][s] > bestFinalVal) {
			bestFinalVal = dp[n - 1][s];
			bestFinal = s;
		}
	}
	path[n - 1] = bestFinal;
	for (let t = n - 2; t >= 0; t--) path[t] = back[t + 1][path[t + 1]];
	const logProbs = path.map((s, t) => dp[t][s]);
	return { path, logProbs };
}

export function confidenceForPoint(f: ModeFeatures, modeIndex: number): number {
	const scores = emissionScores(f).map(Math.log);
	const max = Math.max(...scores);
	const sumExp = scores.reduce((a, s) => a + Math.exp(s - max), 0);
	const softmax = Math.exp(scores[modeIndex] - max) / sumExp;
	return Math.max(0.3, Math.min(1, softmax));
}
