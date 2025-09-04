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
			expect(result!.reason).toContain('Both start and end train stations detected');
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
			expect(result!.reason).toContain('Final train station detected');
		});

		it('should not apply when speed is too low', () => {
			const rule = new FinalStationOnlyRule();
			const context = createMockContext({
				atTrainStation: true,
				stationName: 'Utrecht Central',
				currentSpeed: 20 // Too low for train
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
			expect(result!.confidence).toBe(0.8);
			expect(result!.reason).toContain('Continuing train journey');
		});

		it('should detect slowdown after train journey', () => {
			const rule = new StartingStationOnlyRule();
			const context = createMockContext({
				currentJourney: {
					type: 'train',
					startStation: 'Amsterdam Central',
					startTime: Date.now() - 3600000, // 1 hour ago
					totalDistance: 50000,
					averageSpeed: 75
				},
				currentSpeed: 15, // Low speed
				modeHistory: [
					{ mode: 'train', timestamp: Date.now() - 300000, speed: 80, coordinates: { lat: 0, lng: 0 }, confidence: 0.8, reason: 'test' },
					{ mode: 'train', timestamp: Date.now() - 240000, speed: 20, coordinates: { lat: 0, lng: 0 }, confidence: 0.8, reason: 'test' },
					{ mode: 'train', timestamp: Date.now() - 180000, speed: 15, coordinates: { lat: 0, lng: 0 }, confidence: 0.8, reason: 'test' }
				]
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('car'); // Should switch to car after slowdown
			expect(result!.reason).toContain('Significant slowdown detected');
		});
	});

	describe('TrainSpeedWithoutStationRule', () => {
		it('should detect train speed without station context', () => {
			const rule = new TrainSpeedWithoutStationRule();
			const context = createMockContext({
				atTrainStation: false,
				onHighway: false,
				currentSpeed: 100,
				modeHistory: [
					{ mode: 'train', timestamp: Date.now() - 600000, speed: 80, coordinates: { lat: 0, lng: 0 }, confidence: 0.8, reason: 'test' }
				]
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('train');
			expect(result!.confidence).toBe(0.7);
		});

		it('should not apply when on highway', () => {
			const rule = new TrainSpeedWithoutStationRule();
			const context = createMockContext({
				onHighway: true,
				currentSpeed: 100
			});

			const canApply = rule.canApply(context);
			expect(canApply).toBe(false);
		});
	});

	describe('TrainJourneyEndRule', () => {
		it('should end train journey at station', () => {
			const rule = new TrainJourneyEndRule();
			const context = createMockContext({
				currentJourney: {
					type: 'train',
					startStation: 'Amsterdam Central',
					startTime: Date.now() - 3600000,
					totalDistance: 50000,
					averageSpeed: 75
				},
				atTrainStation: true,
				currentSpeed: 5
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('stationary');
			expect(result!.reason).toContain('Train journey ended');
		});

		it('should end train journey after maximum time', () => {
			const rule = new TrainJourneyEndRule();
			const context = createMockContext({
				currentJourney: {
					type: 'train',
					startStation: 'Amsterdam Central',
					startTime: Date.now() - (3 * 60 * 60 * 1000), // 3 hours ago
					totalDistance: 100000,
					averageSpeed: 75
				},
				currentSpeed: 10
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('stationary');
			expect(result!.reason).toContain('Train journey ended');
		});
	});
});

function createMockContext(overrides: Partial<DetectionContext> = {}): DetectionContext {
	return {
		current: { lat: 52.3676, lng: 4.9041, timestamp: Date.now() },
		previous: { lat: 52.3675, lng: 4.9040, timestamp: Date.now() - 1000 },
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
