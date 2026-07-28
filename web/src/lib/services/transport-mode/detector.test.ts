// /Users/bart/Dev/wayli/web/src/lib/services/transport-mode/detector.test.ts

import { describe, test, expect } from 'vitest';
import { detectTransportModes } from './detector';
import { SEGMENT_GAP_MS } from './segmentation';
import type { ModeObservation } from './types';

const SEC = 1000;
const MIN = 60 * SEC;

/**
 * Build a run of evenly-spaced observations at the given speeds (km/h).
 * Headings optional; defaults to a straight line (bearing 0).
 */
function run(
	speeds: number[],
	opts: { spacingMs?: number; headings?: (number | null)[]; startTs?: number } = {}
): ModeObservation[] {
	const spacing = opts.spacingMs ?? 10 * SEC;
	const startTs = opts.startTs ?? 0;
	const headings = opts.headings ?? speeds.map(() => 0);
	return speeds.map((speed, i) => ({
		timestamp: startTs + i * spacing,
		lat: 52 + i * 0.0001,
		lng: 4 + i * 0.0001,
		speed,
		heading: headings[i],
		accuracy: 15,
		geocode: null
	}));
}

describe('detectTransportModes', () => {
	test('steady walking speed decodes to walking end-to-end (no flicker)', () => {
		const obs = run([5, 5, 5, 5, 5, 4.5, 5, 5]);
		const decisions = detectTransportModes(obs);
		expect(decisions).toHaveLength(obs.length);
		// Every point should be walking — a single steady signal must not flicker.
		expect(decisions.every((d) => d.mode === 'walking')).toBe(true);
	});

	test('a single noisy high-speed fix among walking does not flip the whole run', () => {
		// The legacy rule engine flipped here (one 95 km/h GPS blip → train).
		// The HMM's transition matrix + temporal coherence should absorb it.
		const obs = run([5, 5, 5, 95, 5, 5, 5]);
		const decisions = detectTransportModes(obs);
		const modes = decisions.map((d) => d.mode);
		// The majority must stay walking; the lone blip should NOT become a
		// sustained train/airplane journey.
		const walking = modes.filter((m) => m === 'walking').length;
		expect(walking).toBeGreaterThanOrEqual(5);
		expect(modes.some((m) => m === 'airplane')).toBe(false);
	});

	test('highway car journey with realistic speed variation decodes to car', () => {
		// Real highway driving has CV > 0.15 (traffic, gentle braking) — the
		// signal that separates it from a train. Perfectly steady speeds are
		// legitimately train-like, so this test uses realistic variation.
		const obs = run([88, 105, 92, 110, 85, 98, 102]);
		const decisions = detectTransportModes(obs);
		expect(decisions.every((d) => d.mode === 'car' || d.mode === 'train')).toBe(true);
		const car = decisions.filter((d) => d.mode === 'car').length;
		expect(car).toBeGreaterThanOrEqual(4);
	});

	test('perfectly steady overlap speed without context may read as train (documented)', () => {
		// A perfectly steady 90–100 km/h run with zero variation is genuinely
		// train-like — speed and CV cannot distinguish it from rail. This test
		// pins that the model is allowed to decode train here; geocode context
		// (station tags) is what resolves the ambiguity in production.
		const obs = run([90, 95, 100, 98, 92, 88, 95]);
		const decisions = detectTransportModes(obs);
		expect(decisions.every((d) => d.mode === 'car' || d.mode === 'train')).toBe(true);
	});

	test('low coefficient-of-variation + straight heading favours train in the overlap', () => {
		// Rock-steady 100 km/h, dead-straight heading → train-like. With car-like
		// CV this would be car; the CV signal is the discriminator.
		const obs = run(Array(10).fill(100), {
			headings: Array(10).fill(0) // perfectly straight
		});
		const decisions = detectTransportModes(obs);
		const train = decisions.filter((d) => d.mode === 'train').length;
		const car = decisions.filter((d) => d.mode === 'car').length;
		// At least a strong train presence; the HMM should not be all-car here.
		expect(train).toBeGreaterThan(car);
	});

	test('stationary points decode to stationary', () => {
		const obs = run([0, 0, 0, 0, 0.5, 0, 0]);
		const decisions = detectTransportModes(obs);
		expect(decisions.every((d) => d.mode === 'stationary')).toBe(true);
	});

	test('flight speed decodes to airplane', () => {
		const obs = run([0, 250, 400, 500, 450, 300, 0], { spacingMs: 60 * SEC });
		const decisions = detectTransportModes(obs);
		const plane = decisions.filter((d) => d.mode === 'airplane').length;
		expect(plane).toBeGreaterThanOrEqual(4);
	});

	test('a >5min gap splits into independent segments', () => {
		// First segment: walking. Then a long gap. Then driving.
		const walk = run([5, 5, 5, 5], { startTs: 0 });
		const drive = run([60, 65, 60, 62], { startTs: 10 * MIN + SEGMENT_GAP_MS + 1 });
		const obs = [...walk, ...drive];
		const decisions = detectTransportModes(obs);
		expect(decisions.slice(0, 4).every((d) => d.mode === 'walking')).toBe(true);
		expect(decisions.slice(4).every((d) => d.mode === 'car' || d.mode === 'train')).toBe(true);
	});

	test('returns one decision per input observation, timestamp-aligned', () => {
		const obs = run([0, 10, 50, 120]);
		const decisions = detectTransportModes(obs);
		expect(decisions).toHaveLength(4);
		expect(decisions.map((d) => d.timestamp)).toEqual(obs.map((o) => o.timestamp));
	});

	test('confidence is always within [0, 1]', () => {
		const obs = run([0, 5, 30, 80, 200, 5, 0]);
		const decisions = detectTransportModes(obs);
		expect(decisions.every((d) => d.confidence >= 0 && d.confidence <= 1)).toBe(true);
	});

	test('empty input returns empty', () => {
		expect(detectTransportModes([])).toEqual([]);
	});

	test('single observation decodes via emission-only path', () => {
		const decisions = detectTransportModes(run([5]));
		expect(decisions).toHaveLength(1);
		expect(decisions[0].mode).toBe('walking');
		expect(decisions[0].confidence).toBeGreaterThan(0);
	});
});
