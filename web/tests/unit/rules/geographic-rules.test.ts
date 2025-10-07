// tests/unit/rules/geographic-rules.test.ts

import { describe, it, expect } from 'vitest';
import {
	TrainStationRule,
	AirportRule,
	HighwayOverrideRule
} from '../../../src/lib/rules/geographic-rules';
import type { DetectionContext } from '../../../src/lib/types/transport-detection.types';

describe('Geographic Rules', () => {
	describe('TrainStationRule', () => {
		const rule = new TrainStationRule();

		it('should have priority 97 (higher than FinalSanityCheckRule)', () => {
			expect(rule.priority).toBe(97);
		});

		it('should detect train at platform with 59.4 km/h speed', () => {
			const context = createMockContext({
				atTrainStation: true,
				stationName: 'Amsterdam Central',
				currentSpeed: 59.4
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('train');
			expect(result!.confidence).toBe(0.9);
			expect(result!.reason).toContain('train station');
			expect(result!.reason).toContain('Amsterdam Central');
		});

		it('should detect train at platform with 30 km/h speed (boarding)', () => {
			const context = createMockContext({
				atTrainStation: true,
				stationName: 'Utrecht Central',
				currentSpeed: 25
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('train');
			expect(result!.confidence).toBe(0.85);
			expect(result!.reason).toContain('boarding or alighting');
		});

		it('should detect train at platform with cycling-range speed (35 km/h)', () => {
			const context = createMockContext({
				atTrainStation: true,
				stationName: 'Rotterdam Central',
				currentSpeed: 35
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('train');
			expect(result!.confidence).toBeGreaterThan(0.8);
		});

		it('should apply when at train station regardless of speed', () => {
			const slowContext = createMockContext({
				atTrainStation: true,
				currentSpeed: 5
			});

			const fastContext = createMockContext({
				atTrainStation: true,
				currentSpeed: 120
			});

			expect(rule.canApply(slowContext)).toBe(true);
			expect(rule.canApply(fastContext)).toBe(true);
		});

		it('should not apply when not at train station', () => {
			const context = createMockContext({
				atTrainStation: false,
				currentSpeed: 100
			});

			expect(rule.canApply(context)).toBe(false);
		});
	});

	describe('AirportRule', () => {
		const rule = new AirportRule();

		it('should have priority 96 (higher than FinalSanityCheckRule)', () => {
			expect(rule.priority).toBe(96);
		});

		it('should detect airplane at airport with airplane speed', () => {
			const context = createMockContext({
				atAirport: true,
				airportName: 'Amsterdam Schiphol',
				currentSpeed: 250
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('airplane');
			expect(result!.confidence).toBe(0.9);
		});

		it('should not apply when speed is below airplane threshold', () => {
			const context = createMockContext({
				atAirport: true,
				currentSpeed: 150
			});

			expect(rule.canApply(context)).toBe(false);
		});
	});

	describe('HighwayOverrideRule', () => {
		const rule = new HighwayOverrideRule();

		it('should have highest priority (100)', () => {
			expect(rule.priority).toBe(100);
		});

		it('should override train detection on highway', () => {
			const context = createMockContext({
				onHighway: true,
				currentSpeed: 120
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('car');
			expect(result!.confidence).toBe(0.95);
			expect(result!.reason).toContain('highway');
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
