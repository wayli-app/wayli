// tests/unit/rules/speed-rules.test.ts

import { describe, it, expect } from 'vitest';
import { FinalSanityCheckRule, SpeedBracketRule } from '../../../src/lib/rules/speed-rules';
import type { DetectionContext } from '../../../src/lib/types/transport-detection.types';

describe('Speed Rules', () => {
	describe('FinalSanityCheckRule', () => {
		const rule = new FinalSanityCheckRule();

		it('should have priority 95', () => {
			expect(rule.priority).toBe(95);
		});

		it('should force train when at train station with impossible walking speed', () => {
			const context = createMockContext({
				atTrainStation: true,
				stationName: 'Amsterdam Central',
				currentSpeed: 30.8, // Walking at 30.8 km/h is impossible (limits: 0-12)
				modeHistory: [
					{ mode: 'walking', timestamp: Date.now() - 1000, speed: 30.8, coordinates: { lat: 52.0, lng: 4.0 }, confidence: 0.7, reason: 'test' }
				]
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('train');
			expect(result!.confidence).toBe(1.0);
			expect(result!.reason).toContain('SANITY CHECK');
			expect(result!.reason).toContain('at train station/platform');
			expect(result!.metadata?.geographicContext).toBe('train_station');
		});

		it('should force car when on highway with impossible walking speed', () => {
			const context = createMockContext({
				onHighway: true,
				currentSpeed: 100,
				modeHistory: [
					{ mode: 'walking', timestamp: Date.now() - 1000, speed: 100, coordinates: { lat: 52.0, lng: 4.0 }, confidence: 0.7, reason: 'test' }
				]
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('car');
			expect(result!.reason).toContain('on highway/motorway');
			expect(result!.metadata?.geographicContext).toBe('highway');
		});

		it('should force airplane when at airport with impossible car speed', () => {
			const context = createMockContext({
				atAirport: true,
				airportName: 'Schiphol',
				currentSpeed: 250,
				modeHistory: [
					{ mode: 'car', timestamp: Date.now() - 1000, speed: 250, coordinates: { lat: 52.0, lng: 4.0 }, confidence: 0.7, reason: 'test' }
				]
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('airplane');
			expect(result!.reason).toContain('at airport');
			expect(result!.metadata?.geographicContext).toBe('airport');
		});

		it('should use speed bracket when no geographic context available', () => {
			const context = createMockContext({
				atTrainStation: false,
				onHighway: false,
				atAirport: false,
				currentSpeed: 30.8, // Cycling speed
				modeHistory: [
					{ mode: 'walking', timestamp: Date.now() - 1000, speed: 30.8, coordinates: { lat: 52.0, lng: 4.0 }, confidence: 0.7, reason: 'test' }
				]
			});

			const result = rule.detect(context);

			expect(result).not.toBeNull();
			expect(result!.mode).toBe('cycling'); // 30.8 km/h falls in cycling bracket (10-35)
			expect(result!.reason).toContain('speed bracket');
			expect(result!.metadata?.geographicContext).toBe('none');
		});

		it('should return null when speed is within physical limits', () => {
			const context = createMockContext({
				currentSpeed: 8, // Valid walking speed
				modeHistory: [
					{ mode: 'walking', timestamp: Date.now() - 1000, speed: 8, coordinates: { lat: 52.0, lng: 4.0 }, confidence: 0.8, reason: 'test' }
				]
			});

			const result = rule.detect(context);

			expect(result).toBeNull();
		});

		it('should not apply when mode history is empty', () => {
			const context = createMockContext({
				modeHistory: []
			});

			expect(rule.canApply(context)).toBe(false);
		});
	});

	describe('SpeedBracketRule', () => {
		const rule = new SpeedBracketRule();

		it('should have priority 50', () => {
			expect(rule.priority).toBe(50);
		});

		it('should detect walking for low speeds (2-10 km/h)', () => {
			const context = createMockContext({ currentSpeed: 5 });
			const result = rule.detect(context);

			expect(result.mode).toBe('walking');
		});

		it('should detect cycling for medium speeds (10-35 km/h)', () => {
			const context = createMockContext({ currentSpeed: 25 });
			const result = rule.detect(context);

			expect(result.mode).toBe('cycling');
		});

		it('should detect car for higher speeds (35-110 km/h)', () => {
			const context = createMockContext({ currentSpeed: 80 });
			const result = rule.detect(context);

			expect(result.mode).toBe('car');
		});

		it('should always apply as fallback', () => {
			const context = createMockContext({});
			expect(rule.canApply(context)).toBe(true);
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
