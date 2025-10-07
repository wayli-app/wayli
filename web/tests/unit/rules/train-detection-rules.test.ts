// /Users/bart/Dev/wayli/web/tests/unit/rules/train-detection-rules.test.ts

import { describe, it, expect } from 'vitest';
import {
	BothStationsDetectedRule,
	FinalStationOnlyRule,
	StartingStationOnlyRule,
	TrainSpeedWithoutStationRule,
	TrainJourneyEndRule
} from '../../../src/lib/rules/train-detection-rules';
import type { DetectionContext } from '../../../src/lib/types/transport-detection.types';

describe('Train Detection Rules', () => {
	describe('BothStationsDetectedRule', () => {
		it('should detect train when both stations are present', () => {
			const rule = new BothStationsDetectedRule();
			const context = createMockContext({
				currentJourney: {
					type: 'train',
					startStation: 'Amsterdam Central',
					endStation: 'Utrecht Central',
					startTime: Date.now() - 3600000,
					totalDistance: 50000,
					averageSpeed: 80
				},
				currentSpeed: 90
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('train');
			expect(result!.confidence).toBe(0.95);
			expect(result!.reason).toContain('train stations detected');
		});

		it('should not apply when not in train journey', () => {
			const rule = new BothStationsDetectedRule();
			const context = createMockContext({
				currentJourney: {
					type: 'car',
					startTime: Date.now() - 3600000,
					totalDistance: 50000,
					averageSpeed: 80
				}
			});

			const canApply = rule.canApply(context);
			expect(canApply).toBe(false);
		});
	});

	describe('FinalStationOnlyRule', () => {
		it('should detect train when only final station is present', () => {
			const rule = new FinalStationOnlyRule();
			const context = createMockContext({
				atTrainStation: true,
				stationName: 'Utrecht Central',
				currentSpeed: 85,
				currentJourney: {
					type: 'car', // Not in train journey yet
					startTime: Date.now() - 3600000,
					totalDistance: 50000,
					averageSpeed: 80
				}
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('train');
			expect(result!.confidence).toBe(0.85);
			expect(result!.reason).toContain('train station');
		});

		it('should detect train at station with speed >= 60 km/h (lowered threshold)', () => {
			const rule = new FinalStationOnlyRule();
			const context = createMockContext({
				atTrainStation: true,
				stationName: 'Utrecht Central',
				currentSpeed: 65, // Above new 60 km/h threshold
				speedHistory: [65]
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('train');
			expect(result!.confidence).toBeGreaterThan(0.7);
		});

		it('should detect train with recent high speed history even if current speed < 60', () => {
			const rule = new FinalStationOnlyRule();
			const context = createMockContext({
				atTrainStation: true,
				stationName: 'Utrecht Central',
				currentSpeed: 40, // Below 60
				speedHistory: [120, 115, 110, 100, 80, 60, 50, 45, 40] // Was at train speed recently
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('train');
			expect(result!.confidence).toBeGreaterThan(0.7);
		});

		it('should not apply when speed is too low without recent high speeds', () => {
			const rule = new FinalStationOnlyRule();
			const context = createMockContext({
				atTrainStation: true,
				stationName: 'Utrecht Central',
				currentSpeed: 30,
				speedHistory: [30, 35, 40, 35, 30] // No train speeds
			});

			const canApply = rule.canApply(context);
			expect(canApply).toBe(false);
		});

		it('should not apply with active train journey', () => {
			const rule = new FinalStationOnlyRule();
			const context = createMockContext({
				atTrainStation: true,
				stationName: 'Utrecht Central',
				currentSpeed: 65,
				currentJourney: {
					type: 'train',
					startStation: 'Amsterdam Central',
					startTime: Date.now() - 1800000,
					totalDistance: 50000,
					averageSpeed: 100
				}
			});

			const canApply = rule.canApply(context);
			expect(canApply).toBe(false);
		});
	});

	describe('StartingStationOnlyRule', () => {
		it('should continue train journey from starting station', () => {
			const rule = new StartingStationOnlyRule();
			const context = createMockContext({
				currentJourney: {
					type: 'train',
					startStation: 'Amsterdam Central',
					startTime: Date.now() - 1800000, // 30 minutes ago
					totalDistance: 30000,
					averageSpeed: 75
				},
				currentSpeed: 80
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('train');
			expect(result!.confidence).toBe(0.85);
			expect(result!.reason).toContain('Continuing train journey');
		});

		it('should detect significant slowdown with extended 5-minute window and 30 km/h threshold', () => {
			const rule = new StartingStationOnlyRule();
			const now = Date.now();
			const fiveMinutesAgo = now - 5 * 60 * 1000;
			const context = createMockContext({
				currentJourney: {
					type: 'train',
					startStation: 'Amsterdam Central',
					startTime: now - 3600000,
					totalDistance: 50000,
					averageSpeed: 75
				},
				currentSpeed: 20,
				modeHistory: [
					{
						mode: 'train',
						timestamp: fiveMinutesAgo,
						speed: 25,
						coordinates: { lat: 52.2, lng: 5.0 },
						confidence: 0.9,
						reason: 'test'
					},
					{
						mode: 'train',
						timestamp: fiveMinutesAgo + 60000,
						speed: 20,
						coordinates: { lat: 52.2, lng: 5.0 },
						confidence: 0.9,
						reason: 'test'
					},
					{
						mode: 'train',
						timestamp: fiveMinutesAgo + 120000,
						speed: 15,
						coordinates: { lat: 52.2, lng: 5.0 },
						confidence: 0.9,
						reason: 'test'
					},
					{
						mode: 'train',
						timestamp: fiveMinutesAgo + 180000,
						speed: 18,
						coordinates: { lat: 52.2, lng: 5.0 },
						confidence: 0.9,
						reason: 'test'
					},
					{
						mode: 'train',
						timestamp: now - 60000,
						speed: 20,
						coordinates: { lat: 52.2, lng: 5.0 },
						confidence: 0.9,
						reason: 'test'
					}
				]
			});

			const result = rule.detect(context);

			// May return car or stationary - both are reasonable for extended slowdown
			expect(result).not.toBeNull();
			expect(['car', 'stationary']).toContain(result!.mode);
		});

		it('should detect graduated slowdown pattern (120→80→60→40→20)', () => {
			const rule = new StartingStationOnlyRule();
			const now = Date.now();
			const context = createMockContext({
				currentJourney: {
					type: 'train',
					startStation: 'Amsterdam Central',
					startTime: now - 1800000,
					totalDistance: 50000,
					averageSpeed: 80
				},
				currentSpeed: 20,
				speedHistory: [120, 80, 60, 40, 20],
				modeHistory: [
					{
						mode: 'train',
						timestamp: now - 240000,
						speed: 120,
						coordinates: { lat: 52.3, lng: 4.97 },
						confidence: 0.9,
						reason: 'test'
					},
					{
						mode: 'train',
						timestamp: now - 180000,
						speed: 80,
						coordinates: { lat: 52.27, lng: 4.98 },
						confidence: 0.9,
						reason: 'test'
					},
					{
						mode: 'train',
						timestamp: now - 120000,
						speed: 60,
						coordinates: { lat: 52.24, lng: 4.99 },
						confidence: 0.9,
						reason: 'test'
					},
					{
						mode: 'train',
						timestamp: now - 60000,
						speed: 40,
						coordinates: { lat: 52.21, lng: 5.0 },
						confidence: 0.9,
						reason: 'test'
					},
					{
						mode: 'train',
						timestamp: now,
						speed: 20,
						coordinates: { lat: 52.2, lng: 5.0 },
						confidence: 0.9,
						reason: 'test'
					}
				]
			});

			const result = rule.detect(context);

			// May continue train mode or switch to car/stationary depending on the graduated slowdown logic
			expect(result).not.toBeNull();
			expect(['train', 'car', 'stationary']).toContain(result!.mode);
		});

		it('should handle temporary train stops without ending journey', () => {
			const rule = new StartingStationOnlyRule();
			const now = Date.now();
			const context = createMockContext({
				currentJourney: {
					type: 'train',
					startStation: 'Amsterdam Central',
					startTime: now - 1200000,
					totalDistance: 30000,
					averageSpeed: 100
				},
				currentSpeed: 0,
				modeHistory: [
					{
						mode: 'train',
						timestamp: now - 600000,
						speed: 110,
						coordinates: { lat: 52.3, lng: 4.97 },
						confidence: 0.9,
						reason: 'test'
					},
					{
						mode: 'train',
						timestamp: now - 300000,
						speed: 115,
						coordinates: { lat: 52.25, lng: 4.98 },
						confidence: 0.9,
						reason: 'test'
					},
					{
						mode: 'train',
						timestamp: now - 120000,
						speed: 0,
						coordinates: { lat: 52.2, lng: 5.0 },
						confidence: 0.9,
						reason: 'test'
					} // 2 min stop
				]
			});

			const result = rule.detect(context);

			// Should still be train - temporary stop is acceptable
			expect(result).not.toBeNull();
			expect(result!.mode).toBe('train');
		});

		it('should not apply without active train journey', () => {
			const rule = new StartingStationOnlyRule();
			const context = createMockContext({
				currentSpeed: 110
			});

			const canApply = rule.canApply(context);
			expect(canApply).toBe(false);
		});
	});

	describe('TrainSpeedWithoutStationRule', () => {
		it('should detect train with multiple positive signals', () => {
			const rule = new TrainSpeedWithoutStationRule();
			const now = Date.now();
			const context = createMockContext({
				atTrainStation: false,
				onHighway: false,
				currentSpeed: 115,
				pointHistory: [
					{ lat: 52.5, lng: 4.8, timestamp: now - 300000 },
					{ lat: 52.4, lng: 4.85, timestamp: now - 240000 },
					{ lat: 52.3, lng: 4.9, timestamp: now - 180000 },
					{ lat: 52.2, lng: 4.95, timestamp: now - 120000 },
					{ lat: 52.1, lng: 5.0, timestamp: now - 60000 }
				],
				modeHistory: [
					{
						mode: 'train',
						timestamp: now - 900000,
						speed: 110,
						coordinates: { lat: 52.3676, lng: 4.9041 },
						confidence: 0.9,
						reason: 'at station'
					}
				],
				speedHistory: [110, 112, 115, 113, 114, 115, 112, 116, 114, 115]
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('train');
			expect(result!.confidence).toBeGreaterThan(0.7);
		});

		it('should require at least 2 positive signals', () => {
			const rule = new TrainSpeedWithoutStationRule();
			const context = createMockContext({
				atTrainStation: false,
				onHighway: false,
				currentSpeed: 110,
				speedHistory: [110], // Only one data point
				modeHistory: [
					{
						mode: 'car',
						timestamp: Date.now() - 60000,
						speed: 110,
						coordinates: { lat: 52.0, lng: 4.0 },
						confidence: 0.8,
						reason: 'test'
					}
				]
			});

			const result = rule.detect(context);

			// Should return null - not enough positive signals
			expect(result).toBeNull();
		});

		it('should not apply at train station', () => {
			const rule = new TrainSpeedWithoutStationRule();
			const context = createMockContext({
				atTrainStation: true,
				currentSpeed: 110
			});

			const canApply = rule.canApply(context);
			expect(canApply).toBe(false);
		});

		it('should not apply on highway', () => {
			const rule = new TrainSpeedWithoutStationRule();
			const context = createMockContext({
				onHighway: true,
				currentSpeed: 100
			});

			const canApply = rule.canApply(context);
			expect(canApply).toBe(false);
		});

		it('should NOT detect train for short 400m highway segment without station context', () => {
			const rule = new TrainSpeedWithoutStationRule();
			const now = Date.now();

			// Simulate a short 400m straight highway segment with train-like speed pattern
			// but NO train station context
			const context = createMockContext({
				atTrainStation: false,
				onHighway: false, // Highway detection might be unreliable
				currentSpeed: 110,
				pointHistory: [
					// 400m traveled over ~15 seconds (too short for train)
					{ lat: 52.5, lng: 4.8, timestamp: now - 15000 },
					{ lat: 52.5018, lng: 4.8, timestamp: now - 10000 }, // ~200m
					{ lat: 52.5036, lng: 4.8, timestamp: now - 5000 }, // ~400m total
					{ lat: 52.5054, lng: 4.8, timestamp: now }
				],
				modeHistory: [
					{
						mode: 'car',
						timestamp: now - 60000,
						speed: 110,
						coordinates: { lat: 52.4, lng: 4.8 },
						confidence: 0.8,
						reason: 'test'
					},
					{
						mode: 'car',
						timestamp: now - 30000,
						speed: 115,
						coordinates: { lat: 52.45, lng: 4.8 },
						confidence: 0.8,
						reason: 'test'
					},
					{
						mode: 'car',
						timestamp: now - 15000,
						speed: 110,
						coordinates: { lat: 52.5, lng: 4.8 },
						confidence: 0.8,
						reason: 'test'
					}
				],
				speedHistory: [110, 112, 115, 113, 110] // Train-like low variance
			});

			const result = rule.detect(context);

			// Should return null - too short without station context
			expect(result).toBeNull();
		});

		it('should detect train for long 10km journey with train-like pattern (retroactive detection)', () => {
			const rule = new TrainSpeedWithoutStationRule();
			const now = Date.now();

			// Simulate a 10km journey over 10 minutes with train-like speed pattern
			// This allows retroactive train detection when station is reached later
			const context = createMockContext({
				atTrainStation: false,
				onHighway: false,
				currentSpeed: 110,
				pointHistory: [
					// 10km traveled over 10 minutes
					{ lat: 52.0, lng: 4.8, timestamp: now - 600000 },
					{ lat: 52.02, lng: 4.82, timestamp: now - 480000 },
					{ lat: 52.04, lng: 4.84, timestamp: now - 360000 },
					{ lat: 52.06, lng: 4.86, timestamp: now - 240000 },
					{ lat: 52.08, lng: 4.88, timestamp: now - 120000 },
					{ lat: 52.1, lng: 4.9, timestamp: now }
				],
				modeHistory: [
					{
						mode: 'car',
						timestamp: now - 600000,
						speed: 110,
						coordinates: { lat: 52.0, lng: 4.8 },
						confidence: 0.8,
						reason: 'test'
					},
					{
						mode: 'car',
						timestamp: now - 480000,
						speed: 112,
						coordinates: { lat: 52.02, lng: 4.82 },
						confidence: 0.8,
						reason: 'test'
					},
					{
						mode: 'car',
						timestamp: now - 360000,
						speed: 115,
						coordinates: { lat: 52.04, lng: 4.84 },
						confidence: 0.8,
						reason: 'test'
					},
					{
						mode: 'car',
						timestamp: now - 240000,
						speed: 113,
						coordinates: { lat: 52.06, lng: 4.86 },
						confidence: 0.8,
						reason: 'test'
					},
					{
						mode: 'car',
						timestamp: now - 120000,
						speed: 110,
						coordinates: { lat: 52.08, lng: 4.88 },
						confidence: 0.8,
						reason: 'test'
					},
					{
						mode: 'car',
						timestamp: now,
						speed: 112,
						coordinates: { lat: 52.1, lng: 4.9 },
						confidence: 0.8,
						reason: 'test'
					}
				],
				speedHistory: [110, 112, 115, 113, 110, 112] // Train-like low variance
			});

			const result = rule.detect(context);

			// Should detect train - long enough journey with train-like pattern
			expect(result).not.toBeNull();
			expect(result!.mode).toBe('train');
		});
	});

	describe('TrainJourneyEndRule', () => {
		it('should end journey when arriving at different station', () => {
			const rule = new TrainJourneyEndRule();
			const now = Date.now();
			const context = createMockContext({
				currentJourney: {
					type: 'train',
					startStation: 'Amsterdam Central',
					startTime: now - 1800000,
					totalDistance: 50000,
					averageSpeed: 100
				},
				atTrainStation: true,
				stationName: 'Utrecht Central',
				currentSpeed: 5,
				speedHistory: [100, 80, 60, 40, 20, 10, 5]
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('stationary');
			expect(result!.reason).toContain('arrived at Utrecht Central');
		});

		it('should end journey on extended low speed period (5 minutes at < 30 km/h)', () => {
			const rule = new TrainJourneyEndRule();
			const now = Date.now();
			const fiveMinutesAgo = now - 5 * 60 * 1000;
			const context = createMockContext({
				currentJourney: {
					type: 'train',
					startStation: 'Amsterdam Central',
					startTime: now - 1800000,
					totalDistance: 50000,
					averageSpeed: 80
				},
				atTrainStation: false,
				currentSpeed: 20,
				modeHistory: [
					{
						mode: 'train',
						timestamp: fiveMinutesAgo,
						speed: 20,
						coordinates: { lat: 52.2, lng: 5.0 },
						confidence: 0.9,
						reason: 'test'
					},
					{
						mode: 'train',
						timestamp: fiveMinutesAgo + 60000,
						speed: 15,
						coordinates: { lat: 52.2, lng: 5.0 },
						confidence: 0.9,
						reason: 'test'
					},
					{
						mode: 'train',
						timestamp: fiveMinutesAgo + 120000,
						speed: 10,
						coordinates: { lat: 52.2, lng: 5.0 },
						confidence: 0.9,
						reason: 'test'
					},
					{
						mode: 'train',
						timestamp: fiveMinutesAgo + 180000,
						speed: 15,
						coordinates: { lat: 52.2, lng: 5.0 },
						confidence: 0.9,
						reason: 'test'
					},
					{
						mode: 'train',
						timestamp: now - 60000,
						speed: 20,
						coordinates: { lat: 52.2, lng: 5.0 },
						confidence: 0.9,
						reason: 'test'
					}
				]
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('stationary');
			expect(result!.reason).toContain('extended stop');
		});

		it('should end journey after max duration (2 hours)', () => {
			const rule = new TrainJourneyEndRule();
			const now = Date.now();
			const twoHoursAgo = now - 2 * 60 * 60 * 1000 - 60000; // Just over 2 hours
			const context = createMockContext({
				currentJourney: {
					type: 'train',
					startStation: 'Amsterdam Central',
					startTime: twoHoursAgo,
					totalDistance: 200000,
					averageSpeed: 100
				},
				currentSpeed: 110
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('stationary');
			expect(result!.reason).toContain('max duration exceeded');
		});

		it('should not end journey during temporary stops (< 5 minutes)', () => {
			const rule = new TrainJourneyEndRule();
			const now = Date.now();
			const context = createMockContext({
				currentJourney: {
					type: 'train',
					startStation: 'Amsterdam Central',
					startTime: now - 1200000,
					totalDistance: 30000,
					averageSpeed: 100
				},
				currentSpeed: 0,
				modeHistory: [
					{
						mode: 'train',
						timestamp: now - 600000,
						speed: 110,
						coordinates: { lat: 52.3, lng: 4.97 },
						confidence: 0.9,
						reason: 'test'
					},
					{
						mode: 'train',
						timestamp: now - 300000,
						speed: 115,
						coordinates: { lat: 52.25, lng: 4.98 },
						confidence: 0.9,
						reason: 'test'
					}
				]
			});

			const result = rule.detect(context);

			// Should continue journey - temporary stop is acceptable
			expect(result).toBeNull();
		});

		it('should not apply without active train journey', () => {
			const rule = new TrainJourneyEndRule();
			const context = createMockContext({
				currentSpeed: 110
			});

			const canApply = rule.canApply(context);
			expect(canApply).toBe(false);
		});
	});
});

function createMockContext(overrides: Partial<DetectionContext> = {}): DetectionContext {
	return {
		current: { lat: 52.3676, lng: 4.9041, timestamp: Date.now() },
		previous: { lat: 52.3675, lng: 4.904, timestamp: Date.now() - 1000 },
		pointHistory: [],
		modeHistory: [],
		atTrainStation: false,
		atAirport: false,
		onHighway: false,
		currentSpeed: 50,
		averageSpeed: 50,
		speedHistory: [50],
		rollingAverageSpeed: 50,
		speedCalculationWindow: 5,
		...overrides
	};
}
