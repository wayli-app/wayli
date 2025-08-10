import { describe, it, expect, beforeEach } from 'vitest';
import { detectEnhancedMode, haversine, getSpeedBracket, isAtTrainStation, isModeSwitchPossible } from './transport-mode';
import type { EnhancedModeContext } from './transport-mode';

describe('Transport Mode Detection', () => {
    // detectMode removed; basic detection covered via detectEnhancedMode
    describe('detectMode (via enhanced)', () => {
        it('should detect stationary for very slow speeds', () => {
            const ctx = { currentMode: 'unknown', lastSpeed: 0, trainStations: [], averageSpeed: 0, speedHistory: [], isInTrainJourney: false };
            const result = detectEnhancedMode(0, 0, 0.0001, 0.0001, 60, null, ctx);
            expect(result.mode).toBe('stationary');
        });
        it('should detect walking for slow speeds', () => {
            const ctx = { currentMode: 'unknown', lastSpeed: 0, trainStations: [], averageSpeed: 0, speedHistory: [], isInTrainJourney: false };
            const result = detectEnhancedMode(0, 0, 0.0003, 0.0003, 60, null, ctx);
            expect(result.mode).toBe('walking');
        });
        it('should detect cycling for moderate speeds', () => {
            const ctx = { currentMode: 'unknown', lastSpeed: 0, trainStations: [], averageSpeed: 0, speedHistory: [], isInTrainJourney: false };
            const result = detectEnhancedMode(0, 0, 0.001, 0.001, 60, null, ctx);
            expect(result.mode).toBe('cycling');
        });
        it('should detect car for higher speeds', () => {
            const ctx = { currentMode: 'unknown', lastSpeed: 0, trainStations: [], averageSpeed: 0, speedHistory: [], isInTrainJourney: false };
            const result = detectEnhancedMode(0, 0, 0.003, 0.003, 60, null, ctx);
            expect(result.mode).toBe('car');
        });
    });

    // detectTrainMode was removed; Enhanced mode covers train logic now

	describe('Enhanced Transport Mode Detection', () => {
		describe('Enhanced Mode Detection', () => {
			let context: EnhancedModeContext;

			beforeEach(() => {
                context = {
                    currentMode: 'unknown',
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

// Train detection scenarios now covered by enhanced mode tests

describe('isModeSwitchPossible', () => {
	it('should prevent cycling to train switch', () => {
		expect(isModeSwitchPossible('cycling', 'train', false)).toBe(false);
		expect(isModeSwitchPossible('cycling', 'train', true)).toBe(false); // Even at train station
	});

	it('should prevent train to cycling switch', () => {
		expect(isModeSwitchPossible('train', 'cycling', false)).toBe(false);
		expect(isModeSwitchPossible('train', 'cycling', true)).toBe(false); // Even at train station
	});

	it('should allow cycling to other modes', () => {
		expect(isModeSwitchPossible('cycling', 'walking', false)).toBe(true);
		expect(isModeSwitchPossible('cycling', 'car', false)).toBe(true);
		expect(isModeSwitchPossible('cycling', 'stationary', false)).toBe(true);
	});

	it('should allow train to car at station', () => {
		expect(isModeSwitchPossible('train', 'car', true)).toBe(true);
		expect(isModeSwitchPossible('train', 'car', false)).toBe(false);
	});

	it('should allow car to train at station', () => {
		expect(isModeSwitchPossible('car', 'train', true)).toBe(true);
		expect(isModeSwitchPossible('car', 'train', false)).toBe(false);
	});
});
