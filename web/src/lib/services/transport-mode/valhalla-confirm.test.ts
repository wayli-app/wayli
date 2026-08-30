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
function segment(
	n: number,
	mode: string,
	confidence = 0.8,
	obsOpts: Partial<ModeObservation> = {}
) {
	const observations = Array.from({ length: n }, (_, i) => obs(i, obsOpts));
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
		// 2 calls: the rail-clone probe (pedestrian, no clone names in this
		// mock) + the per-segment auto probe that returns the rail edges.
		expect(mockClient.traceAttributes).toHaveBeenCalledTimes(2);
		expect(mockClient.traceAttributes).toHaveBeenLastCalledWith(expect.anything(), 'auto');
	});

	test('high-confidence slow walking segment → NOT sent to Valhalla', async () => {
		// Slow (p90 < 60 km/h), confident, unambiguous — no probe warranted.
		const { observations, decisions } = segment(10, 'walking', 0.9, { speed: 5 });
		const mockClient: ValhallaClient = { traceAttributes: vi.fn() };

		const result = await confirmWithValhalla(observations, decisions, mockClient);

		expect(mockClient.traceAttributes).not.toHaveBeenCalled();
		expect(result).toEqual(decisions); // unchanged
	});

	test('fast walking-labeled segment → probed with auto costing, absurd verdict rejected', async () => {
		// The Jul-7 failure mode: 30-60 km/h trace on rails labeled walking,
		// pedestrian-matched onto footways → walking @0.9. Now: probed (fast),
		// matched with auto, and the footway verdict is kinematically rejected.
		const { observations, decisions } = segment(10, 'walking', 0.9, { speed: 60 });
		const mockClient: ValhallaClient = {
			traceAttributes: vi.fn().mockResolvedValue({
				edges: [
					{ road_class: 'residential', use: 'footway', rail: false, length: 3, speed: 20 },
					{ road_class: 'service_other', use: 'footway', rail: false, length: 3, speed: 20 }
				],
				shape: [],
				matched: true
			} satisfies ValhallaTraceResult)
		};

		const result = await confirmWithValhalla(observations, decisions, mockClient);

		// 2 calls: rail-clone probe (pedestrian) + auto probe (fast run).
		expect(mockClient.traceAttributes).toHaveBeenCalledTimes(2);
		expect(mockClient.traceAttributes).toHaveBeenNthCalledWith(1, expect.anything(), 'pedestrian');
		expect(mockClient.traceAttributes).toHaveBeenNthCalledWith(2, expect.anything(), 'auto');
		// Footway verdict rejected (60 km/h ≠ walking) — Stage-1 preserved.
		expect(result.every((d) => d.mode === 'walking')).toBe(true);
		expect(result[0].reason).toBe(decisions[0].reason);
	});

	test('rail-clone probe: pedestrian match on RAILWAY | paths → definitive train, no further probing', async () => {
		// Tilesets built with rail cloning expose rail lines as pedestrian
		// paths named "RAILWAY | …". A rail-speed run whose pedestrian match
		// lands on those paths is a train — period. No auto probing follows.
		const { observations, decisions } = segment(10, 'car');
		const railNames = {
			edges: [
				{
					road_class: 'service_other',
					use: 'path',
					rail: false,
					length: 5,
					names: ['RAILWAY | 4701']
				},
				{
					road_class: 'service_other',
					use: 'path',
					rail: false,
					length: 4,
					names: ['RAILWAY | 4701']
				}
			],
			shape: [],
			matched: true
		} satisfies ValhallaTraceResult;
		const mockClient: ValhallaClient = {
			traceAttributes: vi.fn().mockResolvedValue(railNames)
		};

		const result = await confirmWithValhalla(observations, decisions, mockClient);

		expect(result.every((d) => d.mode === 'train')).toBe(true);
		expect(result[0].reason).toBe('valhalla_rail_edge');
		expect(result[0].confidence).toBe(0.95);
		// Definitive verdict → the auto probe never happens.
		expect(mockClient.traceAttributes).toHaveBeenCalledTimes(1);
		expect(mockClient.traceAttributes).toHaveBeenCalledWith(expect.anything(), 'pedestrian');
	});

	test('off-road rule: poor auto match at rail speed → train', async () => {
		// Intercity-train shape (calibrated on the Jul 24/26 traces): ~50 km of
		// travel over 36 min (~83 km/h avg), matched onto 1 km of slow local
		// roads. The road hypothesis fails → train.
		const n = 10;
		const observations = Array.from({ length: n }, (_, i) =>
			obs(i, { timestamp: i * 240_000, speed: 130, lat: 52 + i * 0.05 })
		);
		const decisions = observations.map((o, i) => decision(i, 'car', 0.63));
		const mockClient: ValhallaClient = {
			traceAttributes: vi.fn().mockResolvedValue({
				edges: [
					{ road_class: 'unclassified', use: 'road', rail: false, length: 0.5, speed: 50 },
					{ road_class: 'residential', use: 'road', rail: false, length: 0.5, speed: 30 }
				],
				shape: [],
				matched: true
			} satisfies ValhallaTraceResult)
		};

		const result = await confirmWithValhalla(observations, decisions, mockClient);

		expect(result.every((d) => d.mode === 'train')).toBe(true);
		expect(result[0].reason).toBe('valhalla_offroad_rail');
		expect(result[0].confidence).toBe(0.85);
	});

	test('off-road rule: plausible road match keeps car verdict', async () => {
		// A real car drive: matched length ≈ path length, edges as fast as the
		// observed speeds → motorway verdict stands, off-road rule stays out.
		const n = 10;
		const observations = Array.from({ length: n }, (_, i) =>
			obs(i, { timestamp: i * 240_000, speed: 120, lat: 52 + i * 0.045 })
		);
		const decisions = observations.map((o, i) => decision(i, 'car', 0.7));
		const mockClient: ValhallaClient = {
			traceAttributes: vi.fn().mockResolvedValue({
				edges: [
					{ road_class: 'motorway', use: 'road', rail: false, length: 20, speed: 120 },
					{ road_class: 'motorway', use: 'road', rail: false, length: 20, speed: 118 }
				],
				// Snapped shape tracks the raw points closely (a real road match).
				shape: observations.map((o) => ({ lat: o.lat, lon: o.lng })),
				matched: true
			} satisfies ValhallaTraceResult)
		};

		const result = await confirmWithValhalla(observations, decisions, mockClient);

		expect(result.every((d) => d.mode === 'car')).toBe(true);
		expect(result[0].reason).toBe('valhalla_motorway_edge');
	});

	test('off-road rule: fragmented sparse journey merged across gaps → train', async () => {
		// The Jul-24 shape: a sparse tracker (~6 min between fixes) shatters the
		// ride into 2-point fragments below the 5-min detector gap. Each fragment
		// is too short to judge, but merged across the 30-min run window the ride
		// is one 27 km, ~55 km/h off-road journey → train for every point.
		const n = 6;
		const observations = Array.from({ length: n }, (_, i) =>
			obs(i, { timestamp: i * 360_000, speed: 110, lat: 52 + i * 0.05 })
		);
		const decisions = observations.map((o, i) => decision(i, 'car', 0.7));
		const mockClient: ValhallaClient = {
			traceAttributes: vi.fn().mockResolvedValue({
				edges: [
					{ road_class: 'unclassified', use: 'road', rail: false, length: 0.5, speed: 50 },
					{ road_class: 'residential', use: 'road', rail: false, length: 0.5, speed: 30 }
				],
				shape: [],
				matched: true
			} satisfies ValhallaTraceResult)
		};

		const result = await confirmWithValhalla(observations, decisions, mockClient);

		// Fragments are probed individually; the union off-road check classifies
		// the whole journey.
		expect(mockClient.traceAttributes.mock.calls.length).toBeGreaterThan(0);
		expect(result.every((d) => d.mode === 'train')).toBe(true);
		expect(result[0].reason).toBe('valhalla_offroad_rail');
	});

	test('off-road rule: sustained beyond-rail speed → airplane', async () => {
		const n = 10;
		const observations = Array.from({ length: n }, (_, i) =>
			obs(i, { timestamp: i * 240_000, speed: 800, lat: 52 + i * 0.5 })
		);
		const decisions = observations.map((o, i) => decision(i, 'car', 0.55));
		const mockClient: ValhallaClient = {
			traceAttributes: vi.fn().mockResolvedValue({
				edges: [{ road_class: 'motorway', use: 'road', rail: false, length: 5, speed: 120 }],
				shape: [],
				matched: true
			} satisfies ValhallaTraceResult)
		};

		const result = await confirmWithValhalla(observations, decisions, mockClient);

		expect(result.every((d) => d.mode === 'airplane')).toBe(true);
		expect(result[0].reason).toBe('valhalla_offroad_air');
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

		expect(mockClient.traceAttributes).toHaveBeenCalledTimes(2);
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

	test('segments separated by large gaps processed independently', async () => {
		// Two car segments separated by a >30min gap (separate runs); second gets rail verdict.
		const seg1 = segment(5, 'car');
		const seg2obs = Array.from({ length: 5 }, (_, i) =>
			obs(i, { timestamp: 40 * MIN + i * 30_000, speed: 95 })
		);
		const seg2dec = seg2obs.map((o, i) => ({
			timestamp: o.timestamp,
			mode: 'car' as const,
			reason: 'speed_in_car_range',
			confidence: 0.8
		}));

		const observations = [...seg1.observations, ...seg2obs];
		const decisions = [...seg1.decisions, ...seg2dec];

		const motorway = {
			edges: [{ road_class: 'motorway', use: 'road', rail: false, speed: 110, length: 5 }],
			shape: [],
			matched: true
		} satisfies ValhallaTraceResult;
		const railEdges = {
			edges: [{ road_class: 'primary', use: 'road', rail: true, length: 5 }],
			shape: [],
			matched: true
		} satisfies ValhallaTraceResult;
		const mockClient: ValhallaClient = {
			// Per costing: the rail-clone probe (pedestrian) gets no rail names;
			// the auto probes get answers via a call counter (run1 motorway, run2 rail).
			traceAttributes: vi.fn().mockImplementation(async (_pts: unknown, costing: string) => {
				if (costing === 'pedestrian') return motorway;
				autoCalls += 1;
				return autoCalls === 1 ? motorway : railEdges;
			})
		};
		let autoCalls = 0;

		const result = await confirmWithValhalla(observations, decisions, mockClient);

		expect(mockClient.traceAttributes).toHaveBeenCalledTimes(4);
		// First segment stays car (motorway), second becomes train (rail).
		expect(result.slice(0, 5).every((d) => d.mode === 'car')).toBe(true);
		expect(result.slice(5).every((d) => d.mode === 'train')).toBe(true);
	});

	test('single-point run skipped (<2 points cannot match)', async () => {
		const observations = [obs(0)];
		const decisions = [decision(0, 'car', 0.5)];
		const mockClient: ValhallaClient = { traceAttributes: vi.fn() };

		await confirmWithValhalla(observations, decisions, mockClient);
		expect(mockClient.traceAttributes).not.toHaveBeenCalled();
	});

	test('two-point run is probed (fragments merge into runs)', async () => {
		const observations = [obs(0), obs(1)];
		const decisions = [decision(0, 'car', 0.5), decision(1, 'car', 0.5)];
		const mockClient: ValhallaClient = {
			traceAttributes: vi.fn().mockResolvedValue({
				edges: [],
				shape: [],
				matched: false
			} satisfies ValhallaTraceResult)
		};

		await confirmWithValhalla(observations, decisions, mockClient);
		// rail-clone probe + per-segment probe
		expect(mockClient.traceAttributes).toHaveBeenCalledTimes(2);
	});

	test('empty input → empty output, no API calls', async () => {
		const mockClient: ValhallaClient = { traceAttributes: vi.fn() };
		const result = await confirmWithValhalla([], [], mockClient);
		expect(result).toEqual([]);
		expect(mockClient.traceAttributes).not.toHaveBeenCalled();
	});

	test('walking mode uses pedestrian costing', async () => {
		// Slow segment (p90 < 40 km/h) keeps the Stage-1-mode costing.
		const { observations, decisions } = segment(5, 'walking', 0.5, { speed: 4 }); // low confidence → sent
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
		const { observations, decisions } = segment(5, 'cycling', 0.5, { speed: 20 });
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
