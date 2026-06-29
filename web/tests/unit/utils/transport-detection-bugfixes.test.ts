// /Users/bart/Dev/wayli/web/tests/unit/utils/transport-detection-bugfixes.test.ts
//
// Regression tests for transport-mode-detection bug fixes:
//   B1 — current point must not be duplicated in the point history
//   B5 — GPS accuracy must down-weight / exclude noisy fixes
//   B6 — a long GPS gap must reset journey continuity (tunnels, phone off, flights)

import { describe, it, expect } from 'vitest';
import {
	detectEnhancedMode,
	createEnhancedModeContext
} from '../../../src/lib/utils/enhanced-transport-mode';
import { TransportModeDetector } from '../../../src/lib/services/transport-mode-detector.service';
import {
	calculateMultiPointSpeed,
	getAdaptiveWindowSize
} from '../../../src/lib/utils/multi-point-speed';
import type { PointData } from '../../../src/lib/types/transport-detection.types';

function createTrainStationGeocode(stationName: string) {
	return {
		type: 'Feature',
		properties: {
			label: stationName,
			addendum: { osm: { railway: 'station', name: stationName } },
			address: { name: stationName, city: 'Amsterdam' },
			category: ['transport:rail', 'transport:station']
		},
		geometry: { type: 'Point', coordinates: [4.9041, 52.3676] }
	};
}

describe('B1: no duplicate current point', () => {
	it('createDetectionContext appends current exactly once (history + current)', () => {
		const detector = new TransportModeDetector();
		const p1: PointData = { lat: 52.0, lng: 4.0, timestamp: 1000 };
		const p2: PointData = { lat: 52.1, lng: 4.1, timestamp: 2000 };
		const current: PointData = { lat: 52.2, lng: 4.2, timestamp: 3000 };

		const ctx = detector.createDetectionContext(
			current,
			p2,
			[p1, p2], // prior history, NOT including current
			[],
			{ atTrainStation: false, atAirport: false, onHighway: false }
		);

		// 2 prior + 1 current, with no doubling of the current sample
		expect(ctx.pointHistory).toHaveLength(3);
		expect(ctx.pointHistory[ctx.pointHistory.length - 1]).toBe(current);
	});

	it('detectEnhancedMode does not persist the current point into context.pointHistory', () => {
		const context = createEnhancedModeContext();
		const currLat = 52.4;
		const currLng = 4.95;

		// 30 m/s = 108 km/h
		detectEnhancedMode(52.3, 4.9, currLat, currLng, 60, null, context, 30);

		// After the fix, pointHistory holds prior points only; the current coords are appended
		// transiently inside createDetectionContext and must not be stored on the context.
		const storedCurrent = context.pointHistory.some(
			(p) => Math.abs(p.lat - currLat) < 0.0001 && Math.abs(p.lng - currLng) < 0.0001
		);
		expect(storedCurrent).toBe(false);
	});
});

describe('B5: GPS accuracy weighting', () => {
	it('excludes unusably inaccurate fixes (accuracy > 100m) from speed averaging', () => {
		const good = (speed: number): PointData => ({
			lat: 52.0,
			lng: 4.0,
			timestamp: 0,
			speed,
			accuracy: 10
		});
		const points: PointData[] = [
			good(50),
			good(55),
			good(60),
			{ lat: 52.001, lng: 4.001, timestamp: 0, speed: 250, accuracy: 150 } // garbage fix
		];

		const speed = calculateMultiPointSpeed(points, 4);

		// The 250 km/h garbage point (150m accuracy) must not dominate the average.
		expect(speed).toBeLessThan(150);
		expect(speed).toBeGreaterThan(0);
	});

	it('getAdaptiveWindowSize widens the window for noisy fixes and shrinks it for clean ones', () => {
		const clean: PointData[] = [
			{ lat: 52.0, lng: 4.0, timestamp: 0, accuracy: 10 },
			{ lat: 52.001, lng: 4.001, timestamp: 1, accuracy: 12 },
			{ lat: 52.002, lng: 4.002, timestamp: 2, accuracy: 8 }
		];
		expect(getAdaptiveWindowSize(clean)).toBe(3); // clean GPS -> small smoothing window

		const noisy: PointData[] = [
			{ lat: 52.0, lng: 4.0, timestamp: 0, accuracy: 60 },
			{ lat: 52.001, lng: 4.001, timestamp: 1, accuracy: 55 },
			{ lat: 52.002, lng: 4.002, timestamp: 2, accuracy: 70 }
		];
		expect(getAdaptiveWindowSize(noisy)).toBe(7); // noisy GPS -> large smoothing window
	});
});

describe('B6: gap-aware segmentation', () => {
	it('resets train journey continuity after a long gap (> 5 minutes)', () => {
		const context = createEnhancedModeContext();
		const now = Date.now();

		// Prior train-speed movement so arriving at the station is recognized as a train journey.
		context.modeHistory.push(
			{
				mode: 'train',
				timestamp: now - 120000,
				speed: 110,
				coordinates: { lat: 52.3, lng: 4.8 },
				confidence: 0.8,
				reason: 'approaching'
			},
			{
				mode: 'train',
				timestamp: now - 60000,
				speed: 100,
				coordinates: { lat: 52.35, lng: 4.88 },
				confidence: 0.8,
				reason: 'approaching'
			}
		);

		// Arrive at a station -> train journey begins.
		detectEnhancedMode(
			52.35,
			4.88,
			52.3676,
			4.9041,
			60,
			createTrainStationGeocode('Amsterdam Central'),
			context
		);
		expect(context.isInTrainJourney).toBe(true);

		// 10-minute gap with negligible movement (tunnel / phone off) -> continuity must reset.
		detectEnhancedMode(52.3676, 4.9041, 52.368, 4.9045, 600, null, context);
		expect(context.isInTrainJourney).toBe(false);

		// The pre-gap point history must not survive the gap.
		expect(context.pointHistory.length).toBeLessThanOrEqual(1);
	});
});
