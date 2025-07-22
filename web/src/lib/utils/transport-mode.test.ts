import { describe, it, expect, beforeEach } from 'vitest';
import {
	detectMode,
	detectTrainMode,
	detectEnhancedMode,
	haversine,
	getSpeedBracket,
	isAtTrainStation
} from './transport-mode';
import type { ModeContext, EnhancedModeContext } from './transport-mode';

describe('Transport Mode Detection', () => {
	describe('detectMode', () => {
		it('should detect stationary for very slow speeds', () => {
			// Stationary speed: ~1 km/h (0-2 km/h)
			const result = detectMode(0, 0, 0.0001, 0.0001, 60);
			expect(result).toBe('stationary');
		});

		it('should detect walking for slow speeds', () => {
			// Walking speed: ~5 km/h (between 2-8 km/h)
			const result = detectMode(0, 0, 0.0003, 0.0003, 60);
			expect(result).toBe('walking');
		});

		it('should detect cycling for moderate speeds', () => {
			// Cycling speed: ~15 km/h (between 8-25 km/h)
			const result = detectMode(0, 0, 0.001, 0.001, 60);
			expect(result).toBe('cycling');
		});

		it('should detect car for higher speeds', () => {
			// Car speed: ~60 km/h (between 25-120 km/h)
			const result = detectMode(0, 0, 0.003, 0.003, 60);
			expect(result).toBe('car');
		});
	});

	describe('detectTrainMode', () => {
		let context: ModeContext;

		beforeEach(() => {
			context = {
				isInTrainJourney: false,
				trainVelocityHistory: []
			};
		});

		it('should start train journey when at railway location with train speed', () => {
			// Train speed: ~60 km/h (30-300 km/h)
			const result = detectTrainMode(0, 0, 0.003, 0.003, 60, true, context);

			expect(result.mode).toBe('train');
			expect(result.confidence).toBeGreaterThan(0.5);
			expect(context.isInTrainJourney).toBe(true);
		});

		it('should continue train journey with similar velocity', () => {
			// Start train journey
			context.isInTrainJourney = true;
			context.trainJourneyStartTime = Date.now();

			const result = detectTrainMode(0.003, 0.003, 0.006, 0.006, 60, false, context); // ~60 km/h, not at railway

			expect(result.mode).toBe('train');
			expect(context.isInTrainJourney).toBe(true);
		});

		it('should end train journey when velocity changes significantly', () => {
			// Start train journey
			context.isInTrainJourney = true;
			context.trainJourneyStartTime = Date.now();

			const result = detectTrainMode(0.003, 0.003, 0.012, 0.012, 60, false, context); // ~240 km/h, not at railway

			expect(result.mode).toBe('airplane'); // Should detect as airplane due to high speed
			expect(context.isInTrainJourney).toBe(false);
		});

		it('should increase confidence with journey duration', () => {
			// Start train journey
			const startResult = detectTrainMode(0, 0, 0.003, 0.003, 60, true, context);
			expect(startResult.confidence).toBeGreaterThan(0.5); // Base + railway location

			// Continue for 5 minutes with consistent velocity
			context.isInTrainJourney = true;
			context.trainJourneyStartTime = Date.now() - 5 * 60 * 1000; // 5 minutes ago

			const continueResult = detectTrainMode(0.003, 0.003, 0.006, 0.006, 60, false, context);
			expect(continueResult.confidence).toBeGreaterThan(startResult.confidence);
		});

		it('should increase confidence with velocity consistency', () => {
			// Start train journey
			context.isInTrainJourney = true;
			context.trainJourneyStartTime = Date.now();

			// Add consistent velocity history
			context.trainVelocityHistory = [60, 62, 58, 61, 59, 60, 61, 58, 62, 60];

			const result = detectTrainMode(0.06, 0.06, 0.07, 0.07, 60, false, context);
			expect(result.confidence).toBeGreaterThan(0.6); // Should have good confidence due to consistent velocity
		});

		it('should not start train journey without railway location', () => {
			const result = detectTrainMode(0, 0, 0.003, 0.003, 60, false, context); // ~60 km/h, not at railway

			expect(result.mode).toBe('car'); // Should detect as car
			expect(context.isInTrainJourney).toBe(false);
		});

		it('should not start train journey with non-train speed', () => {
			const result = detectTrainMode(0, 0, 0.0001, 0.0001, 60, true, context); // ~6 km/h at railway

			expect(result.mode).toBe('stationary'); // Should detect as stationary
			expect(context.isInTrainJourney).toBe(false);
		});

		it('should handle velocity history correctly', () => {
			// Add more than 10 velocities
			context.trainVelocityHistory = Array.from({ length: 15 }, (_, i) => 60 + i);

			detectTrainMode(0, 0, 0.003, 0.003, 60, true, context);

			// Should only keep last 10 velocities
			expect(context.trainVelocityHistory?.length).toBe(10);
		});
	});

	describe('Enhanced Transport Mode Detection', () => {
		describe('Enhanced Mode Detection', () => {
			let context: EnhancedModeContext;

			beforeEach(() => {
				context = {
					currentMode: 'unknown',
					modeStartTime: Date.now(),
					lastSpeed: 0,
					trainStations: [],
					averageSpeed: 0,
					speedHistory: [],
					isInTrainJourney: false
				};
			});

			it('should detect train journey with station visits', () => {
				const trainStationGeocode = {
					type: 'railway_station',
					address: { name: 'Central Station', city: 'Amsterdam' }
				};

				const result = detectEnhancedMode(0, 0, 0.003, 0.003, 60, trainStationGeocode, context);
				expect(result.mode).toBe('train');
				expect(context.isInTrainJourney).toBe(true);
			});

			it('should maintain mode continuity', () => {
				// Start with car mode
				context.currentMode = 'car';
				context.modeStartTime = Date.now() - 1000; // 1 second ago

				const result = detectEnhancedMode(0.003, 0.003, 0.006, 0.006, 60, null, context);
				expect(result.mode).toBe('car');
				expect(result.reason).toContain('Mode continuity');
			});
		});
	});

	describe('Utility Functions', () => {
		describe('haversine', () => {
			it('should calculate distance between two points', () => {
				const distance = haversine(0, 0, 0, 1);
				expect(distance).toBeGreaterThan(0);
			});

			it('should return 0 for same point', () => {
				const distance = haversine(0, 0, 0, 0);
				expect(distance).toBe(0);
			});
		});

		describe('getSpeedBracket', () => {
			it('should return correct mode for speed brackets', () => {
				expect(getSpeedBracket(1)).toBe('stationary');
				expect(getSpeedBracket(5)).toBe('walking');
				expect(getSpeedBracket(15)).toBe('cycling');
				expect(getSpeedBracket(60)).toBe('car');
				expect(getSpeedBracket(100)).toBe('train');
				expect(getSpeedBracket(500)).toBe('airplane');
			});
		});

		describe('isAtTrainStation', () => {
			it('should detect railway station geocode', () => {
				const geocode = { type: 'railway_station' };
				expect(isAtTrainStation(geocode)).toBe(true);
			});

			it('should detect railway class', () => {
				const geocode = { class: 'railway' };
				expect(isAtTrainStation(geocode)).toBe(true);
			});

			it('should detect platform type', () => {
				const geocode = { type: 'platform' };
				expect(isAtTrainStation(geocode)).toBe(true);
			});

			it('should return false for non-railway geocode', () => {
				const geocode = { type: 'restaurant' };
				expect(isAtTrainStation(geocode)).toBe(false);
			});
		});
	});
});

describe('Train Detection Scenarios', () => {
	it('should handle continuous train journey with velocity similarity', () => {
		const context: ModeContext = {
			isInTrainJourney: false,
			trainVelocityHistory: []
		};

		// Start at railway station
		let result = detectTrainMode(0, 0, 0.003, 0.003, 60, true, context);
		expect(result.mode).toBe('train');

		// Continue journey with similar velocity (not at railway locations)
		for (let i = 0; i < 5; i++) {
			const prevLat = i * 0.003;
			const prevLng = i * 0.003;
			const currLat = (i + 1) * 0.003;
			const currLng = (i + 1) * 0.003;

			result = detectTrainMode(prevLat, prevLng, currLat, currLng, 60, false, context);
			expect(result.mode).toBe('train');
		}
	});

	it('should handle train journey with velocity variations', () => {
		const context: ModeContext = {
			isInTrainJourney: true,
			trainJourneyStartTime: Date.now(),
			trainVelocityHistory: [60, 62, 58, 61, 59]
		};

		// Simulate velocity variations within train speed range
		for (let i = 0; i < 5; i++) {
			const prevLat = i * 0.003;
			const prevLng = i * 0.003;
			const currLat = (i + 1) * 0.003;
			const currLng = (i + 1) * 0.003;

			const result = detectTrainMode(prevLat, prevLng, currLat, currLng, 60, false, context);
			expect(result.mode).toBe('train'); // Should continue as train due to velocity similarity
		}
	});

	it('should end train journey when velocity changes dramatically', () => {
		const context: ModeContext = {
			isInTrainJourney: true,
			trainJourneyStartTime: Date.now()
		};

		// Sudden velocity change (much faster)
		const result = detectTrainMode(0.006, 0.006, 0.018, 0.018, 60, false, context);
		expect(result.mode).toBe('airplane'); // Should detect as airplane due to high speed
		expect(context.isInTrainJourney).toBe(false);
	});

	it('should handle car crossing railway bridge scenario', () => {
		const context: ModeContext = {
			isInTrainJourney: false,
			trainVelocityHistory: []
		};

		// Car traveling at car speed (not at railway locations)
		for (let i = 0; i < 4; i++) {
			const result = detectTrainMode(0, 0, 0.003, 0.003, 60, false, context);
			expect(result.mode).toBe('car'); // Should detect as car
		}

		// Should not start train journey
		expect(context.isInTrainJourney).toBe(false);
	});
});
