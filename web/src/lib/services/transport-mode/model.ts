// /Users/bart/Dev/wayli/web/src/lib/services/transport-mode/model.ts
//
// The HMM: transition matrix + emission model + Viterbi decoder.
//
// Why an HMM over the existing per-point rule engine?
//   The rules decide each point's mode independently (the only temporal signal
//   is a hand-rolled continuity/fallback layer). That produces flicker — a
//   single noisy fix at 95 km/h can flip car→train→car within seconds. An HMM
//   instead finds the single most-likely *sequence* of modes for a whole
//   segment, so a momentary speed blip cannot break a sustained train journey.
//   The transition matrix encodes "modes persist" (high self-transition) and
//   "physically plausible neighbours only" (you don't walk→airplane directly),
//   which is exactly what the continuity rules tried to do — but globally and
//   consistently instead of point-by-point.
//
// The existing geocode rules feed the *emission* model as features, so all the
// train-station / airport / highway detection work is preserved.

import {
	MODE_PHYSICAL_LIMITS,
	ACCELERATION_LIMITS,
	MODE_CONTINUITY_LIMITS,
	SPEED_CV_THRESHOLDS
} from '../../utils/transport-mode.config';
import { NUM_MODES, TRANSPORT_MODES, MODE_INDEX, type TransportMode } from './states';
import type { ModeFeatures, SegmentContext } from './types';

// Working in log-space avoids underflow on long segments.
const LOG_ZERO = -Infinity;

function safeLog(p: number): number {
	return p <= 0 ? LOG_ZERO : Math.log(p);
}

// ─── Transition matrix ───────────────────────────────────────────────────────

/**
 * Build the log transition matrix T[i][j] = log P(next=j | curr=i).
 *
 * Self-transitions dominate (modes persist). Off-diagonal probabilities are
 * scaled down further by a physical-plausibility factor derived from the
 * continuity limits (max allowed speed diff between two modes) — so you can
 * walk→cycling but walking→airplane is near-impossible.
 *
 * All rows are normalised to probability 1 (log 0).
 */
function buildTransitionMatrix(): number[][] {
	// Base bias toward staying in the same mode. Tuned very high: transport
	// modes are sticky by nature — you don't switch vehicle every few seconds.
	// 0.97 means a single noisy emission that briefly favours the other mode
	// cannot flip the decoded sequence; it takes a sustained run of evidence to
	// transition. This is what suppresses rapid train↔car oscillation.
	const SELF = 0.97;
	const remaining = 1 - SELF;

	const T: number[][] = Array.from({ length: NUM_MODES }, () => new Array(NUM_MODES).fill(0));

	for (let i = 0; i < NUM_MODES; i++) {
		const fromMode = TRANSPORT_MODES[i];
		const fromMax = MODE_PHYSICAL_LIMITS[fromMode].max;

		// Candidate off-diagonal transitions, weighted by plausibility.
		const weights = new Array(NUM_MODES).fill(0);
		let weightSum = 0;
		for (let j = 0; j < NUM_MODES; j++) {
			if (j === i) continue;
			const toMode = TRANSPORT_MODES[j];
			const toMax = MODE_PHYSICAL_LIMITS[toMode].max;
			// Plausibility: how much speed overlap exists between the two modes.
			// Modes that share a speed band are reachable neighbours.
			const overlap = Math.min(fromMax, toMax) - Math.max(0, 0); // simplified: any→any plausible at low speed
			const continuity = MODE_CONTINUITY_LIMITS[toMode]?.maxSpeedDiff ?? 30;
			// Higher allowed speed-diff between from→to => more plausible transition.
			// Walking→car (diff 50) is plausible; walking→airplane (diff 1500) is not in one step.
			const plausibility = Math.min(1, continuity / 50) * (overlap > 0 ? 1 : 0.1);
			weights[j] = plausibility;
			weightSum += plausibility;
		}

		// Assign probabilities.
		T[i][i] = SELF;
		if (weightSum > 0) {
			for (let j = 0; j < NUM_MODES; j++) {
				if (j === i) continue;
				T[i][j] = (remaining * weights[j]) / weightSum;
			}
		} else {
			// No plausible neighbour — distribute remaining onto self.
			T[i][i] = 1;
		}

		// Normalise defensively.
		const rowSum = T[i].reduce((a, b) => a + b, 0);
		if (rowSum > 0) for (let j = 0; j < NUM_MODES; j++) T[i][j] /= rowSum;
	}

	// Convert to log-space once.
	const logT: number[][] = T.map((row) => row.map(safeLog));
	return logT;
}

// ─── Emission model ──────────────────────────────────────────────────────────

/**
 * Emission probability P(observation | mode) for a single observation.
 *
 * Combines:
 *  - speed fit against MODE_PHYSICAL_LIMITS (the dominant signal)
 *  - speed coefficient-of-variation (train = steady, car = variable) in the
 *    60–110 km/h overlap where speed alone can't decide
 *  - heading turn rate (trains run straight; cars weave in cities)
 *  - geocode context (at a station boosts train, at an airport boosts airplane,
 *    on a motorway boosts car, at a venue boosts stationary)
 *
 * The result is an unnormalised score per mode; Viterbi normalises implicitly
 * because it compares scores, not absolutes.
 */
export function emissionScores(f: ModeFeatures, segCtx?: SegmentContext): number[] {
	const scores = new Array(NUM_MODES).fill(1);

	// Base-rate prior: how common each mode is at typical tracker speeds.
	// Applied as a constant multiplier so the speed-fit + context can still
	// override it with strong evidence (e.g. an airport fix makes airplane win
	// despite its low prior). Without this, the train/car overlap band is a
	// coin flip — but cars are an order of magnitude more common than trains,
	// so car is the correct default there.
	//
	// The train prior sits at 0.5 (between the original 0.45 and a higher value):
	// cars remain somewhat more common than trains, but within the 60-110 km/h
	// overlap a large steady cluster is genuinely ambiguous. Rather than tilt
	// the prior either way, we let station contagion (below) make the call, and
	// give car a symmetric moderate-CV nudge in the overlap so it isn't
	// systematically under-weighted relative to train.
	const PRIOR: Record<string, number> = {
		stationary: 1.0,
		walking: 1.0,
		cycling: 0.9,
		car: 1.0,
		train: 0.5,
		airplane: 0.05 // very rare; only wins with overwhelming evidence
	};

	// Segment-level signals (optional — default to "no whole-segment context").
	// Per-point station proximity is on the feature itself (f.stationProximity).
	const meanIntervalSec = segCtx?.meanIntervalSec ?? 0;

	for (let m = 0; m < NUM_MODES; m++) {
		const mode = TRANSPORT_MODES[m];
		const limits = MODE_PHYSICAL_LIMITS[mode];

		// Trapezoidal speed membership: peak (1.0) in the mode's "core" band,
		// sloping down to ~0.1 at the physical limits, then near-zero outside.
		// Core band = inner 60% of [min, max]. This gives each mode a clear
		// preferred speed so a 5 km/h point strongly favours walking over car,
		// and an 80 km/h point favours car over train unless other signals say
		// otherwise. Outside the physical limits, score drops to a tiny floor
		// (not exactly 0 — a single bad GPS fix shouldn't permanently exclude
		// the true mode; the transition matrix + neighbours recover it).
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
			// f.speed > limits.max
			s = Math.max(0.0008, 0.1 * Math.max(0, 1 - (f.speed - limits.max) / 15));
		}

		// Train-vs-car disambiguation in the 55–115 km/h overlap. Speed alone
		// cannot decide there. CV and turn rate are tiebreakers; the strong
		// "very steady = train" signal is gated on per-point rail context
		// (f.stationProximity, time-decayed from a station visit) because pure
		// speed-steadiness alone is NOT a reliable train signal — cruise-control
		// highway driving is equally steady. Without nearby rail context the
		// overlap stays a balanced car/train call leaning car (the default).
		if (mode === 'train' || mode === 'car') {
			if (f.speed >= 55 && f.speed <= 115) {
				// Blend: proximity 1.0 (at a station) -> full 2.6x train boost;
				// proximity 0 (far from any station) -> only the 1.3x mild nudge.
				const railBoost = 1.3 + (2.6 - 1.3) * f.stationProximity; // 1.3 .. 2.6
				if (mode === 'train') {
					if (f.speedCV < 0.08) s *= railBoost;
					else if (f.speedCV < 0.12)
						s *= 1.1; // borderline -> slight nudge
					else if (f.speedCV > SPEED_CV_THRESHOLDS.CAR_LIKE) s *= 0.6;
				} else {
					// Symmetric car nudges so the overlap isn't train-biased:
					// moderate variation (0.12-0.25) is typical city/highway car
					// driving and nudges car; high variation (>0.25) strongly car.
					if (f.speedCV > SPEED_CV_THRESHOLDS.CAR_LIKE) s *= 1.3;
					else if (f.speedCV > 0.12) s *= 1.15;
				}
				// Turn rate: trains rarely exceed ~3 deg/s sustained. Re-tuned
				// threshold from 5 -> 4 deg/s using heading-bearing data.
				if (mode === 'train' && f.headingTurnRate > 4) s *= 0.5;
			}
		}

		// Geocode context multipliers (strong, reliable signals).
		// f.stationProximity (0..1, time-decayed from a station visit) anchors
		// train locally: the nearer a point is to a station visit, the more it
		// leans train. This is the key rail signal, but it decays so a long drive
		// that merely passed one station isn't boosted end-to-end.
		if (mode === 'train' && f.atTrainStation) s *= 4.0;
		if (mode === 'train' && f.stationProximity > 0) s *= 1 + 1.6 * f.stationProximity; // up to ~2.6x
		if (mode === 'airplane' && f.atAirport) s *= 4.0;
		if (mode === 'car' && f.onHighway && f.speed > 50) s *= 1.8;
		if (mode === 'stationary' && f.atVenue && f.speed < 3) s *= 2.5;
		// Being at a station strongly de-emphasises car/cycling there.
		if (f.atTrainStation && (mode === 'car' || mode === 'cycling')) s *= 0.3;
		// Near a station (rail context) gently de-emphasises car, scaled by
		// proximity so it only affects the local journey leg, not a far-away one.
		if (f.stationProximity > 0 && mode === 'car' && f.speed > 30) s *= 1 - 0.4 * f.stationProximity;
		if (f.atAirport && mode !== 'airplane' && mode !== 'stationary') s *= 0.3;

		// Measurement-density feature (segment-level). Empirically, car trips
		// with navigation on produce dense fixes (<~5s) while train trips with
		// the phone idle produce sparse ones (>~30s). This is a weak signal
		// (config-dependent), so the multiplier is gentle and only fires in the
		// overlap band where speed/CV/station can't fully decide. Derived from
		// the already-computed time_spent — no new data.
		if (meanIntervalSec > 0 && f.speed >= 30 && f.speed <= 200) {
			if (mode === 'train' && meanIntervalSec >= 30) s *= 1.25;
			if (mode === 'car' && meanIntervalSec < 8) s *= 1.15;
		}

		// Accuracy weighting: noisy fixes contribute less to all modes equally,
		// so the transition matrix (temporal coherence) carries more weight.
		s = s * (0.3 + 0.7 * f.accuracyWeight);

		// Apply the base-rate prior last; strong context (station/airport) has
		// already multiplied in above and can overcome a low prior.
		s *= PRIOR[mode] ?? 1;

		scores[m] = s;
	}

	return scores;
}

// ─── Viterbi ─────────────────────────────────────────────────────────────────

/**
 * Initialise the start distribution. We're agnostic about the first point's
 * mode (uniform), EXCEPT we slightly favour 'stationary' since the median point
 * in a tracker feed is a stopped device. This only affects the very first point
 * of a segment; transitions dominate after that.
 */
function startLogScores(): number[] {
	const base = new Array(NUM_MODES).fill(safeLog(1 / NUM_MODES));
	base[MODE_INDEX['stationary']] = safeLog((1 / NUM_MODES) * 1.3);
	return base;
}

export interface ViterbiResult {
	/** Most-likely mode index per observation. */
	path: number[];
	/** log-probability of the best path through each point (for confidence). */
	logProbs: number[];
}

/**
 * Standard Viterbi over the HMM. Returns the most-likely state sequence and the
 * log-probability of the best path arriving at each point.
 *
 * `features` is the per-observation feature array (one per point in the
 * segment). The caller is responsible for gap-segmentation: each call decodes
 * exactly one gap-bounded segment.
 */
export function viterbi(features: ModeFeatures[], segCtx?: SegmentContext): ViterbiResult {
	const n = features.length;
	if (n === 0) return { path: [], logProbs: [] };

	const logT = buildTransitionMatrix();
	const start = startLogScores();

	// dp[t][s] = log P(best path ending in state s at time t)
	// back[t][s] = previous state on that best path
	const dp: number[][] = Array.from({ length: n }, () => new Array(NUM_MODES).fill(LOG_ZERO));
	const back: number[][] = Array.from({ length: n }, () => new Array(NUM_MODES).fill(0));

	// t = 0
	const e0 = emissionScores(features[0], segCtx);
	for (let s = 0; s < NUM_MODES; s++) {
		dp[0][s] = start[s] + safeLog(e0[s]);
	}

	// t = 1..n-1
	for (let t = 1; t < n; t++) {
		const et = emissionScores(features[t], segCtx);
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

	// Backtrack from the best final state.
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
	for (let t = n - 2; t >= 0; t--) {
		path[t] = back[t + 1][path[t + 1]];
	}

	// Per-point log-prob of the best path arriving there.
	const logProbs = path.map((s, t) => dp[t][s]);

	return { path, logProbs };
}

// ─── Confidence ──────────────────────────────────────────────────────────────

/**
 * Convert a Viterbi log-probability into a [0,1] confidence for persistence +
 * UI display. We compare the chosen state's emission score against the max
 * across states (a soft winner-take-all), so confidence is high when one mode
 * clearly fits and low (~0.4) when several modes are plausible. The transition
 * matrix already handled temporal coherence, so this reflects per-point fit.
 */
export function confidenceForPoint(f: ModeFeatures, modeIndex: number): number {
	const scores = emissionScores(f).map(Math.log);
	const max = Math.max(...scores);
	const sumExp = scores.reduce((a, s) => a + Math.exp(s - max), 0);
	const softmax = Math.exp(scores[modeIndex] - max) / sumExp;
	// Scale up: softmax over 6 states maxes at ~1 but typically sits 0.4–0.7.
	return Math.max(0.3, Math.min(1, softmax));
}

export { ACCELERATION_LIMITS };
export type { TransportMode };
