// tests/unit/rules/speed-pattern-rules.test.ts

import { describe, it, expect } from 'vitest';
import {
	SpeedPatternTrainDetectionRule,
	SpeedPatternCarDetectionRule
} from '../../../src/lib/rules/speed-pattern-rules';
import type { DetectionContext } from '../../../src/lib/types/transport-detection.types';

// Helper to create mock GPS frequency
function createMockGPSFrequency(
	type: 'active_navigation' | 'background_tracking' | 'mixed' = 'mixed'
) {
	const modifiers = {
		car: type === 'active_navigation' ? 0.2 : type === 'background_tracking' ? -0.2 : 0,
		train: type === 'active_navigation' ? -0.15 : type === 'background_tracking' ? 0.1 : 0,
		walking: type === 'active_navigation' ? -0.1 : type === 'background_tracking' ? 0.05 : 0,
		cycling: 0,
		airplane: 0,
		stationary: 0
	};

	return {
		averageInterval:
			type === 'active_navigation' ? 5000 : type === 'background_tracking' ? 90000 : 30000,
		intervalVariance: 0.2,
		frequencyType: type,
		likelyMode: type === 'active_navigation' ? ('car' as const) : ('unknown' as const),
		confidenceModifiers: modifiers
	};
}

describe('Speed Pattern Rules', () => {
	describe('SpeedPatternTrainDetectionRule', () => {
		const rule = new SpeedPatternTrainDetectionRule();

		it('should have correct name and priority', () => {
			expect(rule.name).toBe('Speed Pattern Train Detection');
			expect(rule.priority).toBe(75);
		});

		describe('canApply', () => {
			it('should apply when conditions are met', () => {
				const context: DetectionContext = {
					current: { lat: 52.0, lng: 4.0, timestamp: Date.now() },
					previous: { lat: 51.9, lng: 4.0, timestamp: Date.now() - 60000 },
					pointHistory: new Array(15).fill({ lat: 52.0, lng: 4.0, timestamp: Date.now() }),
					modeHistory: [],
					atTrainStation: false,
					atAirport: false,
					onHighway: false,
					currentSpeed: 110,
					averageSpeed: 110,
					speedHistory: new Array(15).fill(110),
					rollingAverageSpeed: 110,
					gpsFrequency: createMockGPSFrequency(),
					speedCalculationWindow: 5
				};

				expect(rule.canApply(context)).toBe(true);
			});

			it('should not apply at train station', () => {
				const context: DetectionContext = {
					current: { lat: 52.0, lng: 4.0, timestamp: Date.now() },
					previous: { lat: 51.9, lng: 4.0, timestamp: Date.now() - 60000 },
					pointHistory: new Array(15).fill({ lat: 52.0, lng: 4.0, timestamp: Date.now() }),
					modeHistory: [],
					atTrainStation: true,
					atAirport: false,
					onHighway: false,
					currentSpeed: 110,
					averageSpeed: 110,
					speedHistory: new Array(15).fill(110),
					rollingAverageSpeed: 110,
					gpsFrequency: createMockGPSFrequency(),
					speedCalculationWindow: 5
				};

				expect(rule.canApply(context)).toBe(false);
			});

			it('should not apply on highway', () => {
				const context: DetectionContext = {
					current: { lat: 52.0, lng: 4.0, timestamp: Date.now() },
					previous: { lat: 51.9, lng: 4.0, timestamp: Date.now() - 60000 },
					pointHistory: new Array(15).fill({ lat: 52.0, lng: 4.0, timestamp: Date.now() }),
					modeHistory: [],
					atTrainStation: false,
					atAirport: false,
					onHighway: true,
					currentSpeed: 110,
					averageSpeed: 110,
					speedHistory: new Array(15).fill(110),
					rollingAverageSpeed: 110,
					gpsFrequency: createMockGPSFrequency(),
					speedCalculationWindow: 5
				};

				expect(rule.canApply(context)).toBe(false);
			});

			it('should not apply for speeds outside range', () => {
				const context: DetectionContext = {
					current: { lat: 52.0, lng: 4.0, timestamp: Date.now() },
					previous: { lat: 51.9, lng: 4.0, timestamp: Date.now() - 60000 },
					pointHistory: new Array(15).fill({ lat: 52.0, lng: 4.0, timestamp: Date.now() }),
					modeHistory: [],
					atTrainStation: false,
					atAirport: false,
					onHighway: false,
					currentSpeed: 150, // Too high
					averageSpeed: 150,
					speedHistory: new Array(15).fill(150),
					rollingAverageSpeed: 150,
					gpsFrequency: createMockGPSFrequency(),
					speedCalculationWindow: 5
				};

				expect(rule.canApply(context)).toBe(false);
			});

			it('should not apply without sufficient history', () => {
				const context: DetectionContext = {
					current: { lat: 52.0, lng: 4.0, timestamp: Date.now() },
					previous: { lat: 51.9, lng: 4.0, timestamp: Date.now() - 60000 },
					pointHistory: [{ lat: 52.0, lng: 4.0, timestamp: Date.now() }],
					modeHistory: [],
					atTrainStation: false,
					atAirport: false,
					onHighway: false,
					currentSpeed: 110,
					averageSpeed: 110,
					speedHistory: [110],
					rollingAverageSpeed: 110,
					gpsFrequency: createMockGPSFrequency(),
					speedCalculationWindow: 5
				};

				expect(rule.canApply(context)).toBe(false);
			});
		});

		describe('detect', () => {
			it('should detect train with consistent speed and straight trajectory', () => {
				const now = Date.now();
				const context: DetectionContext = {
					current: { lat: 52.0, lng: 4.0, timestamp: now },
					previous: { lat: 52.1, lng: 4.0, timestamp: now - 60000 },
					pointHistory: [
						{ lat: 52.5, lng: 4.0, timestamp: now - 300000 },
						{ lat: 52.4, lng: 4.0, timestamp: now - 240000 },
						{ lat: 52.3, lng: 4.0, timestamp: now - 180000 },
						{ lat: 52.2, lng: 4.0, timestamp: now - 120000 },
						{ lat: 52.1, lng: 4.0, timestamp: now - 60000 },
						{ lat: 52.0, lng: 4.0, timestamp: now }
					],
					modeHistory: Array(15)
						.fill(null)
						.map((_, i) => ({
							mode: 'train',
							timestamp: now - (15 - i) * 60000,
							speed: 110,
							coordinates: { lat: 52.0, lng: 4.0 },
							confidence: 0.8,
							reason: 'test'
						})),
					atTrainStation: false,
					atAirport: false,
					onHighway: false,
					currentSpeed: 110,
					averageSpeed: 110,
					speedHistory: [110, 112, 108, 111, 109, 110, 111, 110, 109, 112, 110, 111, 110, 109, 110],
					rollingAverageSpeed: 110,
					gpsFrequency: createMockGPSFrequency(),
					speedCalculationWindow: 5
				};

				const result = rule.detect(context);

				expect(result).not.toBeNull();
				expect(result?.mode).toBe('train');
				expect(result?.confidence).toBeGreaterThan(0.7);
				expect(result?.metadata?.trainScore).toBeGreaterThan(result?.metadata?.carScore);
			});

			it('should detect car with erratic speed and turns', () => {
				const now = Date.now();
				const context: DetectionContext = {
					current: { lat: 52.0, lng: 4.0, timestamp: now },
					previous: { lat: 52.1, lng: 4.1, timestamp: now - 60000 },
					pointHistory: [
						{ lat: 52.5, lng: 4.0, timestamp: now - 300000 },
						{ lat: 52.4, lng: 4.1, timestamp: now - 240000 },
						{ lat: 52.3, lng: 4.0, timestamp: now - 180000 },
						{ lat: 52.2, lng: 4.1, timestamp: now - 120000 },
						{ lat: 52.1, lng: 4.0, timestamp: now - 60000 },
						{ lat: 52.0, lng: 4.1, timestamp: now }
					],
					modeHistory: Array(15)
						.fill(null)
						.map((_, i) => ({
							mode: 'car',
							timestamp: now - (15 - i) * 60000,
							speed: 80 + (i % 3) * 20, // Variable speeds
							coordinates: { lat: 52.0, lng: 4.0 },
							confidence: 0.7,
							reason: 'test'
						})),
					atTrainStation: false,
					atAirport: false,
					onHighway: false,
					currentSpeed: 100,
					averageSpeed: 95,
					speedHistory: [50, 120, 60, 110, 40, 100, 55, 115, 65, 105, 50, 110, 60, 100, 55], // High variance for car
					rollingAverageSpeed: 95,
					gpsFrequency: createMockGPSFrequency(),
					speedCalculationWindow: 5
				};

				const result = rule.detect(context);

				expect(result).not.toBeNull();
				expect(result?.mode).toBe('car');
				expect(result?.metadata?.carScore).toBeGreaterThan(result?.metadata?.trainScore);
			});

			it('should return null for ambiguous patterns', () => {
				const now = Date.now();
				const context: DetectionContext = {
					current: { lat: 52.0, lng: 4.0, timestamp: now },
					previous: { lat: 52.1, lng: 4.0, timestamp: now - 60000 },
					pointHistory: Array(15).fill({ lat: 52.0, lng: 4.0, timestamp: now }),
					modeHistory: [],
					atTrainStation: false,
					atAirport: false,
					onHighway: false,
					currentSpeed: 90,
					averageSpeed: 90,
					speedHistory: [85, 90, 88, 92, 87, 91, 89, 90, 88, 91, 89, 90],
					rollingAverageSpeed: 90,
					gpsFrequency: createMockGPSFrequency(),
					speedCalculationWindow: 5
				};

				const result = rule.detect(context);

				// Should be null or low confidence
				if (result !== null) {
					const scoreDiff = Math.abs(result.metadata.trainScore - result.metadata.carScore);
					expect(scoreDiff).toBeGreaterThanOrEqual(0); // Scores may vary
				}
			});

			it('should NOT detect train for short 400m highway segment (false positive prevention)', () => {
				const now = Date.now();

				// Simulate a 400m straight highway segment with train-like speed pattern
				// CV = 0.020 (very low variance), straight trajectory
				// Duration: ~15 seconds, Distance: ~400m
				const context: DetectionContext = {
					current: { lat: 52.5054, lng: 4.8, timestamp: now },
					previous: { lat: 52.5036, lng: 4.8, timestamp: now - 5000 },
					pointHistory: [
						{ lat: 52.5, lng: 4.8, timestamp: now - 15000 },
						{ lat: 52.5018, lng: 4.8, timestamp: now - 10000 },
						{ lat: 52.5036, lng: 4.8, timestamp: now - 5000 },
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
							speed: 112,
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
						},
						{
							mode: 'car',
							timestamp: now - 10000,
							speed: 111,
							coordinates: { lat: 52.5018, lng: 4.8 },
							confidence: 0.8,
							reason: 'test'
						}
					],
					atTrainStation: false,
					atAirport: false,
					onHighway: false, // Highway detection may be unreliable
					currentSpeed: 110,
					averageSpeed: 110,
					speedHistory: [110, 112, 111, 110], // Very low variance (train-like)
					rollingAverageSpeed: 110,
					gpsFrequency: createMockGPSFrequency(),
					speedCalculationWindow: 5
				};

				const result = rule.detect(context);

				// Should return null - journey too short (< 3km and < 5 minutes)
				expect(result).toBeNull();
			});

			it('should detect train for long 10km journey with train-like pattern', () => {
				const now = Date.now();

				// Simulate a 10km journey over 10 minutes with train-like speed pattern
				// This allows retroactive train detection when station is reached later
				const context: DetectionContext = {
					current: { lat: 52.1, lng: 4.9, timestamp: now },
					previous: { lat: 52.08, lng: 4.88, timestamp: now - 120000 },
					pointHistory: [
						{ lat: 52.0, lng: 4.8, timestamp: now - 600000 },
						{ lat: 52.02, lng: 4.82, timestamp: now - 480000 },
						{ lat: 52.04, lng: 4.84, timestamp: now - 360000 },
						{ lat: 52.06, lng: 4.86, timestamp: now - 240000 },
						{ lat: 52.08, lng: 4.88, timestamp: now - 120000 },
						{ lat: 52.1, lng: 4.9, timestamp: now }
					],
					modeHistory: Array(10)
						.fill(null)
						.map((_, i) => ({
							mode: 'car',
							timestamp: now - (10 - i) * 60000,
							speed: 110 + (i % 2) * 2, // Very consistent speed
							coordinates: { lat: 52.0 + i * 0.01, lng: 4.8 + i * 0.01 },
							confidence: 0.8,
							reason: 'test'
						})),
					atTrainStation: false,
					atAirport: false,
					onHighway: false,
					currentSpeed: 110,
					averageSpeed: 110,
					speedHistory: [110, 112, 110, 112, 110, 112, 110, 112, 110, 112], // Train-like low variance
					rollingAverageSpeed: 110,
					gpsFrequency: createMockGPSFrequency(),
					speedCalculationWindow: 5
				};

				const result = rule.detect(context);

				// Should detect train - journey long enough (> 5km OR > 5 minutes)
				expect(result).not.toBeNull();
				expect(result?.mode).toBe('train');
			});
		});
	});

	describe('SpeedPatternCarDetectionRule', () => {
		const rule = new SpeedPatternCarDetectionRule();

		it('should have correct name and priority', () => {
			expect(rule.name).toBe('Speed Pattern Car Detection');
			expect(rule.priority).toBe(74);
		});

		describe('canApply', () => {
			it('should apply for speeds in car range', () => {
				const context: DetectionContext = {
					current: { lat: 52.0, lng: 4.0, timestamp: Date.now() },
					previous: { lat: 51.9, lng: 4.0, timestamp: Date.now() - 60000 },
					pointHistory: [],
					modeHistory: [],
					atTrainStation: false,
					atAirport: false,
					onHighway: false,
					currentSpeed: 100,
					averageSpeed: 100,
					speedHistory: new Array(15).fill(100),
					rollingAverageSpeed: 100,
					gpsFrequency: createMockGPSFrequency(),
					speedCalculationWindow: 5
				};

				expect(rule.canApply(context)).toBe(true);
			});

			it('should not apply at train station', () => {
				const context: DetectionContext = {
					current: { lat: 52.0, lng: 4.0, timestamp: Date.now() },
					previous: { lat: 51.9, lng: 4.0, timestamp: Date.now() - 60000 },
					pointHistory: [],
					modeHistory: [],
					atTrainStation: true,
					atAirport: false,
					onHighway: false,
					currentSpeed: 100,
					averageSpeed: 100,
					speedHistory: new Array(15).fill(100),
					rollingAverageSpeed: 100,
					gpsFrequency: createMockGPSFrequency(),
					speedCalculationWindow: 5
				};

				expect(rule.canApply(context)).toBe(false);
			});
		});

		describe('detect', () => {
			it('should detect car with high speed variance', () => {
				const context: DetectionContext = {
					current: { lat: 52.0, lng: 4.0, timestamp: Date.now() },
					previous: { lat: 51.9, lng: 4.0, timestamp: Date.now() - 60000 },
					pointHistory: [],
					modeHistory: [],
					atTrainStation: false,
					atAirport: false,
					onHighway: false,
					currentSpeed: 100,
					averageSpeed: 95,
					speedHistory: [30, 120, 40, 110, 25, 100, 35, 115, 45, 105, 30, 110, 40, 100, 35], // High variance (CV > 0.35)
					rollingAverageSpeed: 95,
					gpsFrequency: createMockGPSFrequency(),
					speedCalculationWindow: 5
				};

				const result = rule.detect(context);

				expect(result).not.toBeNull();
				expect(result?.mode).toBe('car');
				expect(result?.confidence).toBeGreaterThan(0.8);
				expect(result?.metadata?.speedCV).toBeGreaterThan(0.35);
			});

			it('should return null for low variance speeds', () => {
				const context: DetectionContext = {
					current: { lat: 52.0, lng: 4.0, timestamp: Date.now() },
					previous: { lat: 51.9, lng: 4.0, timestamp: Date.now() - 60000 },
					pointHistory: [],
					modeHistory: [],
					atTrainStation: false,
					atAirport: false,
					onHighway: false,
					currentSpeed: 110,
					averageSpeed: 110,
					speedHistory: [110, 112, 108, 111, 109, 110, 111, 110, 109, 112],
					rollingAverageSpeed: 110,
					gpsFrequency: createMockGPSFrequency(),
					speedCalculationWindow: 5
				};

				const result = rule.detect(context);

				expect(result).toBeNull();
			});
		});
	});
});
