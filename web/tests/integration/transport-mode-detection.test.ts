// /Users/bart/Dev/wayli/web/tests/integration/transport-mode-detection.test.ts

import { describe, it, expect } from 'vitest';
import { detectEnhancedMode, createEnhancedModeContext } from '../../src/lib/utils/enhanced-transport-mode';
import type { EnhancedModeContext } from '../../src/lib/types/transport-detection.types';

describe('Enhanced Transport Mode Detection Integration', () => {
	let context: EnhancedModeContext;

	beforeEach(() => {
		context = createEnhancedModeContext();
	});

	describe('Train Journey Scenarios', () => {
		it('should detect complete train journey with both stations', () => {
			// Start at train station
			const result1 = detectEnhancedMode(
				52.3676, 4.9041, // Amsterdam Central
				52.3676, 4.9041,
				1,
				createTrainStationGeocode('Amsterdam Central'),
				context
			);

			expect(result1.mode).toBe('train');
			expect(result1.reason).toContain('train station');

			// Travel at train speed
			const result2 = detectEnhancedMode(
				52.3676, 4.9041,
				52.1000, 5.1000, // Moving towards Utrecht
				60,
				null,
				context
			);

			expect(result2.mode).toBe('train');
			expect(result2.reason).toContain('Continuing train journey');

			// Arrive at destination station
			const result3 = detectEnhancedMode(
				52.1000, 5.1000,
				52.0893, 5.1106, // Utrecht Central
				1,
				createTrainStationGeocode('Utrecht Central'),
				context
			);

			expect(result3.mode).toBe('train');
			expect(result3.reason).toContain('Both start and end train stations detected');
		});

		it('should handle final station only scenario', () => {
			// Travel at train speed without starting station
			const result1 = detectEnhancedMode(
				52.2000, 5.0000,
				52.1000, 5.1000,
				60,
				null,
				context
			);

			// Should be car initially (no train context)
			expect(result1.mode).toBe('car');

			// Arrive at final station
			const result2 = detectEnhancedMode(
				52.1000, 5.1000,
				52.0893, 5.1106, // Utrecht Central
				1,
				createTrainStationGeocode('Utrecht Central'),
				context
			);

			expect(result2.mode).toBe('train');
			expect(result2.reason).toContain('Final train station detected');
		});

		it('should handle starting station only scenario', () => {
			// Start at train station
			const result1 = detectEnhancedMode(
				52.3676, 4.9041, // Amsterdam Central
				52.3676, 4.9041,
				1,
				createTrainStationGeocode('Amsterdam Central'),
				context
			);

			expect(result1.mode).toBe('train');

			// Continue at train speed
			const result2 = detectEnhancedMode(
				52.3676, 4.9041,
				52.2000, 5.0000,
				60,
				null,
				context
			);

			expect(result2.mode).toBe('train');
			expect(result2.reason).toContain('Continuing train journey');

			// Slow down significantly (end of journey)
			const result3 = detectEnhancedMode(
				52.2000, 5.0000,
				52.1900, 5.0100,
				300, // 5 minutes
				null,
				context
			);

			// Should switch to car after significant slowdown
			expect(result3.mode).toBe('car');
		});
	});

	describe('Highway Override Scenarios', () => {
		it('should override train detection on highway', () => {
			// Start train journey
			context.isInTrainJourney = true;
			context.trainJourneyStartTime = Date.now();
			context.trainJourneyStartStation = 'Amsterdam Central';

			// Travel on highway at train speed
			const result = detectEnhancedMode(
				52.3676, 4.9041,
				52.2000, 5.0000,
				60,
				createHighwayGeocode(),
				context
			);

			expect(result.mode).toBe('car');
			expect(result.reason).toContain('highway');
		});
	});

	describe('Speed Continuity Scenarios', () => {
		it('should maintain mode at high speeds', () => {
			// Start with car mode
			context.currentMode = 'car';
			context.speedHistory = [80, 85, 90];

			const result = detectEnhancedMode(
				52.3676, 4.9041,
				52.2000, 5.0000,
				60,
				null,
				context
			);

			expect(result.mode).toBe('car');
			expect(result.reason).toContain('high speed');
		});

		it('should maintain mode with similar speeds', () => {
			// Start with train mode
			context.currentMode = 'train';
			context.speedHistory = [100, 105, 95];

			const result = detectEnhancedMode(
				52.3676, 4.9041,
				52.2000, 5.0000,
				60,
				null,
				context
			);

			expect(result.mode).toBe('train');
			expect(result.reason).toContain('similar');
		});
	});

	describe('Multi-Point Speed Calculation', () => {
		it('should use stable speed from multiple points', () => {
			// Add some point history for multi-point calculation
			context.pointHistory = [
				{ lat: 52.3676, lng: 4.9041, timestamp: Date.now() - 5000 },
				{ lat: 52.3600, lng: 4.9100, timestamp: Date.now() - 4000 },
				{ lat: 52.3500, lng: 4.9200, timestamp: Date.now() - 3000 },
				{ lat: 52.3400, lng: 4.9300, timestamp: Date.now() - 2000 },
				{ lat: 52.3300, lng: 4.9400, timestamp: Date.now() - 1000 }
			];

			const result = detectEnhancedMode(
				52.3300, 4.9400,
				52.3200, 4.9500,
				60,
				null,
				context
			);

			// Should use stable speed calculation
			expect(result.mode).toBeDefined();
			expect(result.reason).toContain('stable speed');
		});
	});
});

// Helper functions to create mock geocode data
function createTrainStationGeocode(stationName: string) {
	return {
		type: 'Feature',
		properties: {
			type: 'railway_station',
			class: 'railway',
			address: {
				name: stationName,
				city: 'Amsterdam'
			}
		},
		geometry: {
			type: 'Point',
			coordinates: [4.9041, 52.3676]
		}
	};
}

function createHighwayGeocode() {
	return {
		type: 'Feature',
		properties: {
			type: 'motorway',
			class: 'highway'
		},
		geometry: {
			type: 'Point',
			coordinates: [5.0000, 52.2000]
		}
	};
}
