import { describe, test, expect } from 'vitest';
import {
	haversineMeters,
	isInsideZone,
	clipPolylineToZones,
	splitIntoModeRuns,
	costingForRunMode,
	roundCoord,
	toStoredSegments,
	fromStoredSegments,
	downsampleSegments,
	type LatLng,
	type PrivacyZone
} from './trip-route-geometry';

const p = (lat: number, lng: number): LatLng => ({ lat, lng });

const AMSTERDAM = p(52.372, 4.893);
const UTRECHT = p(52.09, 5.12); // ~35 km from Amsterdam

describe('haversineMeters', () => {
	test('same point is zero', () => {
		expect(haversineMeters(AMSTERDAM, AMSTERDAM)).toBe(0);
	});

	test('Amsterdam–Utrecht is roughly 35 km', () => {
		const d = haversineMeters(AMSTERDAM, UTRECHT);
		expect(d).toBeGreaterThan(32000);
		expect(d).toBeLessThan(38000);
	});

	test('1 degree of latitude is ~111 km', () => {
		const d = haversineMeters(p(52, 4), p(53, 4));
		expect(d).toBeGreaterThan(110000);
		expect(d).toBeLessThan(112000);
	});
});

describe('isInsideZone', () => {
	const zone: PrivacyZone = { lat: 52.372, lng: 4.893, radius_m: 250 };

	test('center is inside', () => {
		expect(isInsideZone(AMSTERDAM, [zone])).toBe(true);
	});

	test('point ~1 km away is outside', () => {
		expect(isInsideZone(p(52.381, 4.893), [zone])).toBe(false);
	});

	test('no zones means never inside', () => {
		expect(isInsideZone(AMSTERDAM, [])).toBe(false);
	});
});

describe('clipPolylineToZones', () => {
	const home: PrivacyZone = { lat: 52.0, lng: 5.0, radius_m: 500 };

	test('no zones keeps the polyline as one segment', () => {
		const line = [p(52.0, 5.0), p(52.01, 5.0), p(52.02, 5.0)];
		expect(clipPolylineToZones(line, [])).toEqual([line]);
	});

	test('points inside the zone are removed and the line splits', () => {
		// 3 points ~1.1 km apart: middle point inside the 500 m zone.
		const line = [p(52.0, 5.0), p(52.0099, 5.0), p(52.0198, 5.0)];
		const segs = clipPolylineToZones(line, [home]);
		// First point is the zone center → inside → only the tail survives.
		expect(segs).toHaveLength(1);
		expect(segs[0].map((x) => x.lat)).toEqual([52.0099, 52.0198]);
	});

	test('a zone crossing in the middle produces two segments (singleton runs dropped)', () => {
		// ~550 m steps along latitude around a 500 m zone at (52.0, 5.0).
		const line = [p(51.99, 5.0), p(51.995, 5.0), p(52.0, 5.0), p(52.005, 5.0), p(52.01, 5.0)];
		const segs = clipPolylineToZones(line, [home]);
		expect(segs).toHaveLength(2);
		expect(segs[0].map((x) => x.lat)).toEqual([51.99, 51.995]);
		expect(segs[1].map((x) => x.lat)).toEqual([52.005, 52.01]);
	});

	test('outside runs of a single point are dropped entirely', () => {
		const line = [p(51.995, 5.0), p(52.0, 5.0), p(52.005, 5.0)];
		expect(clipPolylineToZones(line, [home])).toEqual([]);
	});

	test('everything inside the zone yields no segments', () => {
		const line = [p(52.0, 5.0), p(52.0001, 5.0)];
		expect(clipPolylineToZones(line, [home])).toEqual([]);
	});

	test('segments shorter than 2 points are dropped', () => {
		const line = [p(51.99, 5.0), p(52.0, 5.0), p(52.0001, 5.0)];
		const segs = clipPolylineToZones(line, [home]);
		// Last two points are inside → only a 1-point run outside remains → dropped.
		expect(segs).toEqual([]);
	});
});

describe('splitIntoModeRuns', () => {
	const pt = (mode: string | null) => ({ transport_mode: mode });

	test('splits consecutive runs by mode', () => {
		const runs = splitIntoModeRuns([pt('car'), pt('car'), pt('walking'), pt('walking')]);
		expect(runs.map((r) => r.mode)).toEqual(['car', 'walking']);
		expect(runs[0].points).toHaveLength(2);
	});

	test('drops stationary runs', () => {
		const runs = splitIntoModeRuns([pt('car'), pt('car'), pt('stationary'), pt('stationary')]);
		expect(runs.map((r) => r.mode)).toEqual(['car']);
	});

	test('drops runs shorter than 2 points', () => {
		const runs = splitIntoModeRuns([pt('car'), pt('walking'), pt('walking')]);
		expect(runs.map((r) => r.mode)).toEqual(['walking']);
	});

	test('keeps null/unknown modes as their own run', () => {
		const runs = splitIntoModeRuns([pt(null), pt(null)]);
		expect(runs).toHaveLength(1);
		expect(runs[0].mode).toBeNull();
	});
});

describe('costingForRunMode', () => {
	test('walking → pedestrian', () => {
		expect(costingForRunMode('walking')).toBe('pedestrian');
	});

	test('cycling → bicycle', () => {
		expect(costingForRunMode('cycling')).toBe('bicycle');
	});

	test('car/train/unknown/null → auto', () => {
		expect(costingForRunMode('car')).toBe('auto');
		expect(costingForRunMode('train')).toBe('auto');
		expect(costingForRunMode(null)).toBe('auto');
	});
});

describe('stored segment codec', () => {
	test('rounds to 5 decimals and roundtrips', () => {
		const segs = [[p(52.123456789, 4.987654321), p(52.2, 5.0)]];
		const stored = toStoredSegments(segs);
		expect(stored[0][0]).toEqual([52.12346, 4.98765]);
		const back = fromStoredSegments(stored);
		expect(back[0][0].lat).toBeCloseTo(52.123456, 4);
		expect(back[0][0].lng).toBeCloseTo(4.987654, 4);
	});

	test('roundCoord precision', () => {
		expect(roundCoord(1.23456789)).toBe(1.23457);
		expect(roundCoord(-1.999999)).toBe(-2);
	});
});

describe('downsampleSegments', () => {
	const make = (n: number) => Array.from({ length: n }, (_, i) => p(52 + i * 0.001, 5));

	test('no-op under the cap', () => {
		const segs = [make(10), make(10)];
		expect(downsampleSegments(segs, 100)).toBe(segs);
	});

	test('thins to the total budget and keeps segment endpoints', () => {
		const segs = [make(1000), make(1000)];
		const out = downsampleSegments(segs, 100);
		const total = out.reduce((n, s) => n + s.length, 0);
		expect(total).toBeLessThanOrEqual(110); // budget 50 per segment + endpoints
		// First/last point of each thinned segment are the originals' endpoints.
		expect(out[0][0].lat).toBeCloseTo(segs[0][0].lat, 10);
		expect(out[0][out[0].length - 1].lat).toBeCloseTo(segs[0][999].lat, 10);
		expect(out[1][out[1].length - 1].lat).toBeCloseTo(segs[1][999].lat, 10);
	});
});
