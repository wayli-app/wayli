import { describe, test, expect, vi } from 'vitest';
import { confirmWithValhalla, type ValhallaClient } from './valhalla-confirm';
import type { ModeObservation, PointModeDecision } from './types';
import type { ValhallaTraceResult } from './valhalla.service';

const MIN = 60 * 1000;

function obs(i: number, opts: Partial<ModeObservation> = {}): ModeObservation {
	return {
		timestamp: i * 30_000,
		lat: 52 + i * 0.0001,
		lng: 4 + i * 0.0001,
		speed: 90,
		heading: 0,
		accuracy: 15,
		geocode: null,
		...opts
	};
}

function decision(i: number, mode: string, confidence: number): PointModeDecision {
	return {
		timestamp: i * 30_000,
		mode: mode as any,
		reason: 'speed_in_car_range',
		confidence
	};
}

/** Build N observations + decisions as one continuous segment (no gaps). */
function segment(n: number, mode: string, confidence = 0.8) {
	const observations = Array.from({ length: n }, (_, i) => obs(i));
	const decisions = Array.from({ length: n }, (_, i) => decision(i, mode, confidence));
	return { observations, decisions };
}

describe('confirmWithValhalla', () => {
	test('car segment matched to rail edges → overridden to train', async () => {
		const { observations, decisions } = segment(10, 'car');
		const mockClient: ValhallaClient = {
			traceAttributes: vi.fn().mockResolvedValue({
				edges: [
					{ road_class: 'primary', use: 'road', rail: true, length: 5, speed: 100 },
					{ road_class: 'primary', use: 'road', rail: true, length: 4 }
				],
				shape: [],
				matched: true
			} satisfies ValhallaTraceResult)
		};

		const result = await confirmWithValhalla(observations, decisions, mockClient);

		// All points overridden to train with high confidence.
		expect(result.every((d) => d.mode === 'train')).toBe(true);
		expect(result[0].confidence).toBe(0.95);
		expect(result[0].reason).toBe('valhalla_rail_edge');
		expect(mockClient.traceAttributes).toHaveBeenCalledOnce();
		// Called with 'auto' costing (Stage-1 mode was car).
		expect(mockClient.traceAttributes).toHaveBeenCalledWith(expect.anything(), 'auto');
	});

	test('high-confidence walking segment → NOT sent to Valhalla', async () => {
		const { observations, decisions } = segment(10, 'walking', 0.9);
		const mockClient: ValhallaClient = { traceAttributes: vi.fn() };

		const result = await confirmWithValhalla(observations, decisions, mockClient);

		expect(mockClient.traceAttributes).not.toHaveBeenCalled();
		expect(result).toEqual(decisions); // unchanged
	});

	test('low-confidence segment → sent and confirmed', async () => {
		const { observations, decisions } = segment(10, 'car', 0.4); // below threshold
		const mockClient: ValhallaClient = {
			traceAttributes: vi.fn().mockResolvedValue({
				edges: [{ road_class: 'motorway', use: 'road', rail: false, speed: 110, length: 8 }],
				shape: [],
				matched: true
			} satisfies ValhallaTraceResult)
		};

		const result = await confirmWithValhalla(observations, decisions, mockClient);

		expect(mockClient.traceAttributes).toHaveBeenCalledOnce();
		expect(result.every((d) => d.mode === 'car')).toBe(true);
		expect(result[0].reason).toBe('valhalla_motorway_edge');
	});

	test('Valhalla API failure → Stage-1 results preserved', async () => {
		const { observations, decisions } = segment(10, 'car');
		const mockClient: ValhallaClient = {
			traceAttributes: vi.fn().mockRejectedValue(new Error('network timeout'))
		};

		const result = await confirmWithValhalla(observations, decisions, mockClient);

		expect(result).toEqual(decisions); // all Stage-1 results unchanged
	});

	test('inconclusive Valhalla match (null verdict) → Stage-1 preserved', async () => {
		const { observations, decisions } = segment(10, 'car');
		const mockClient: ValhallaClient = {
			traceAttributes: vi.fn().mockResolvedValue({
				edges: [{ road_class: 'residential', use: 'road', rail: false, speed: 30, length: 1 }],
				shape: [],
				matched: true
			} satisfies ValhallaTraceResult)
		};

		const result = await confirmWithValhalla(observations, decisions, mockClient);

		expect(result).toEqual(decisions);
	});

	test('segments separated by gaps processed independently', async () => {
		// Two car segments separated by a >5min gap; second gets rail verdict.
		const seg1 = segment(5, 'car');
		const seg2obs = Array.from({ length: 5 }, (_, i) =>
			obs(i, { timestamp: 10 * MIN + i * 30_000, speed: 95 })
		);
		const seg2dec = seg2obs.map((o, i) => ({
			timestamp: o.timestamp,
			mode: 'car' as const,
			reason: 'speed_in_car_range',
			confidence: 0.8
		}));

		const observations = [...seg1.observations, ...seg2obs];
		const decisions = [...seg1.decisions, ...seg2dec];

		const mockClient: ValhallaClient = {
			traceAttributes: vi
				.fn()
				.mockResolvedValueOnce({
					edges: [{ road_class: 'motorway', use: 'road', rail: false, speed: 110, length: 5 }],
					shape: [],
					matched: true
				} satisfies ValhallaTraceResult)
				.mockResolvedValueOnce({
					edges: [{ road_class: 'primary', use: 'road', rail: true, length: 5 }],
					shape: [],
					matched: true
				} satisfies ValhallaTraceResult)
		};

		const result = await confirmWithValhalla(observations, decisions, mockClient);

		expect(mockClient.traceAttributes).toHaveBeenCalledTimes(2);
		// First segment stays car (motorway), second becomes train (rail).
		expect(result.slice(0, 5).every((d) => d.mode === 'car')).toBe(true);
		expect(result.slice(5).every((d) => d.mode === 'train')).toBe(true);
	});

	test('short segments (<3 points) skipped', async () => {
		const observations = [obs(0), obs(1)];
		const decisions = [decision(0, 'car', 0.5), decision(1, 'car', 0.5)];
		const mockClient: ValhallaClient = { traceAttributes: vi.fn() };

		await confirmWithValhalla(observations, decisions, mockClient);
		expect(mockClient.traceAttributes).not.toHaveBeenCalled();
	});

	test('empty input → empty output, no API calls', async () => {
		const mockClient: ValhallaClient = { traceAttributes: vi.fn() };
		const result = await confirmWithValhalla([], [], mockClient);
		expect(result).toEqual([]);
		expect(mockClient.traceAttributes).not.toHaveBeenCalled();
	});

	test('walking mode uses pedestrian costing', async () => {
		const { observations, decisions } = segment(5, 'walking', 0.5); // low confidence → sent
		const mockClient: ValhallaClient = {
			traceAttributes: vi.fn().mockResolvedValue({
				edges: [{ road_class: 'residential', use: 'footway', rail: false, length: 1 }],
				shape: [],
				matched: true
			} satisfies ValhallaTraceResult)
		};

		await confirmWithValhalla(observations, decisions, mockClient);
		expect(mockClient.traceAttributes).toHaveBeenCalledWith(expect.anything(), 'pedestrian');
	});

	test('cycling mode uses bicycle costing', async () => {
		const { observations, decisions } = segment(5, 'cycling', 0.5);
		const mockClient: ValhallaClient = {
			traceAttributes: vi.fn().mockResolvedValue({
				edges: [{ road_class: 'residential', use: 'cycleway', rail: false, length: 1 }],
				shape: [],
				matched: true
			} satisfies ValhallaTraceResult)
		};

		await confirmWithValhalla(observations, decisions, mockClient);
		expect(mockClient.traceAttributes).toHaveBeenCalledWith(expect.anything(), 'bicycle');
	});
});
