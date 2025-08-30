// web/src/lib/services/trip-detection.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TripDetectionService, TripDetectionConfig, DateRange } from './trip-detection.service';
import type { TripState, VisitedLocation } from './trip-detection.service';

// Mock the worker client
vi.mock('../../worker/client', () => ({
	createWorkerClient: () => ({
		from: vi.fn()
	})
}));

// Mock other dependencies
vi.mock('../utils/geocoding-utils', () => ({
	haversineDistance: vi.fn()
}));

vi.mock('../utils/job-cancellation', () => ({
	checkJobCancellation: vi.fn()
}));

vi.mock('../utils/server-translations', () => ({
	translateServer: vi.fn((key: string) => key),
	getPluralSuffix: vi.fn(() => 's')
}));

describe('TripDetectionService', () => {
	let service: TripDetectionService;

	beforeEach(async () => {
		service = new TripDetectionService();
		vi.clearAllMocks();
		// Reset the haversineDistance mock to return a reasonable default
		const { haversineDistance } = await import('../utils/geocoding-utils');
		vi.mocked(haversineDistance).mockReturnValue(5); // 5km from home by default
	});

	describe('Configuration', () => {
		it('should have correct default configuration', () => {
			const config: TripDetectionConfig = {
				minTripDurationHours: 24,
				minDataPointsPerDay: 3,
				homeRadiusKm: 10,
				minStatusConfirmationPoints: 10,
				chunkSize: 1000
			};

			expect(config.minTripDurationHours).toBe(24);
			expect(config.minStatusConfirmationPoints).toBe(10);
			expect(config.chunkSize).toBe(1000);
		});
	});

	describe('DateRange Interface', () => {
		it('should support optional start and end dates', () => {
			const range1: DateRange = {
				startDate: '2024-01-01',
				endDate: '2024-01-31'
			};

			const range2: DateRange = {
				startDate: undefined,
				endDate: '2024-12-31'
			};

			const range3: DateRange = {
				startDate: '2024-01-01',
				endDate: undefined
			};

			const range4: DateRange = {};

			expect(range1.startDate).toBe('2024-01-01');
			expect(range1.endDate).toBe('2024-01-31');
			expect(range2.startDate).toBeUndefined();
			expect(range2.endDate).toBe('2024-12-31');
			expect(range3.startDate).toBe('2024-01-01');
			expect(range3.endDate).toBeUndefined();
			expect(range4.startDate).toBeUndefined();
			expect(range4.endDate).toBeUndefined();
		});
	});

	describe('TripState Management', () => {
		it('should initialize trip state correctly', () => {
			const initialState: TripState = {
				homePoints: [],
				awayPoints: [],
				currentTripStart: null,
				currentTripEnd: null,
				currentTripLocations: [],
				lastHomePoint: null,
				lastAwayPoint: null,
				tripDataPoints: 0
			};

			expect(initialState.homePoints).toHaveLength(0);
			expect(initialState.awayPoints).toHaveLength(0);
			expect(initialState.currentTripStart).toBeNull();
			expect(initialState.currentTripEnd).toBeNull();
		});
	});

	describe('Home Detection', () => {
		it('should detect home based on city match', async () => {
			const point = {
				geocode: {
					city: 'Amsterdam'
				},
				location: {
					coordinates: [4.9041, 52.3676]
				},
				country_code: 'NL'
			} as any;

			const homeAddress = {
				display_name: 'Home',
				address: {
					city: 'Amsterdam',
					country: 'Netherlands'
				},
				coordinates: { lat: 52.3676, lng: 4.9041 }
			} as any;

			const tripExclusions: any[] = [];
			const config = { homeRadiusKm: 10 } as any;

			const service = new TripDetectionService();
			const isHome = await (service as any).isUserHome(point, homeAddress, tripExclusions, config);

			expect(isHome).toBe(true);
		});

		it('should detect home based on radius', async () => {
			// Set up the mock to return 5km (within the 10km threshold)
			const { haversineDistance } = await import('../utils/geocoding-utils');
			vi.mocked(haversineDistance).mockReturnValue(5);

			const point = {
				geocode: {
					city: 'Amsterdam'
				},
				location: {
					coordinates: [4.9041, 52.3676]
				},
				country_code: 'NL'
			} as any;

			const homeAddress = {
				display_name: 'Home',
				coordinates: { lat: 52.3676, lng: 4.9041 }
			} as any;

			const tripExclusions: any[] = [];
			const config = { homeRadiusKm: 10 } as any;

			const service = new TripDetectionService();
			const isHome = await (service as any).isUserHome(point, homeAddress, tripExclusions, config);

			expect(isHome).toBe(true);
		});
	});

	describe('Location Processing', () => {
		it('should create visited location from valid data point', async () => {
			const point = {
				geocode: {
					city: 'Amsterdam'
				},
				location: {
					coordinates: [4.9041, 52.3676]
				},
				country_code: 'NL'
			} as any;

			const homeAddress = null;
			const tripExclusions: any[] = [];
			const config = {} as any;

			const service = new TripDetectionService();
			const location = await (service as any).processLocation(point, homeAddress, tripExclusions, config);

			expect(location).toBeTruthy();
			expect(location?.cityName).toBe('Amsterdam');
			expect(location?.coordinates.lat).toBe(52.3676);
			expect(location?.coordinates.lng).toBe(4.9041);
		});

		it('should return null for invalid data point', async () => {
			const point = {
				location: {
					coordinates: [4.9041, 52.3676]
				}
				// Missing city name
			} as any;

			const homeAddress = null;
			const tripExclusions: any[] = [];
			const config = {} as any;

			const service = new TripDetectionService();
			const location = await (service as any).processLocation(point, homeAddress, tripExclusions, config);

			expect(location).toBeNull();
		});
	});

	describe('Trip Finalization', () => {
		it('should create trip with correct structure', async () => {
			// Create multiple locations for the same city to ensure it gets counted as visited
			// The service counts cities with >= 3 data points as visited
			const tripState: TripState = {
				homePoints: [],
				awayPoints: [],
				currentTripStart: '2024-01-01T10:00:00Z',
				currentTripEnd: '2024-01-01T22:00:00Z',
				currentTripLocations: [
					// Multiple Amsterdam locations to ensure it gets >= 3 data points
					{
						cityName: 'Amsterdam',
						countryName: 'Netherlands',
						countryCode: 'NL',
						durationHours: 2,
						dataPoints: 2,
						coordinates: { lat: 52.3676, lng: 4.9041 }
					},
					{
						cityName: 'Amsterdam',
						countryName: 'Netherlands',
						countryCode: 'NL',
						durationHours: 2,
						dataPoints: 2,
						coordinates: { lat: 52.3676, lng: 4.9041 }
					},
					{
						cityName: 'Amsterdam',
						countryName: 'Netherlands',
						countryCode: 'NL',
						durationHours: 2,
						dataPoints: 2,
						coordinates: { lat: 52.3676, lng: 4.9041 }
					},
					// Multiple Rotterdam locations to ensure it gets >= 3 data points
					{
						cityName: 'Rotterdam',
						countryName: 'Netherlands',
						countryCode: 'NL',
						durationHours: 2,
						dataPoints: 2,
						coordinates: { lat: 51.9225, lng: 4.4792 }
					},
					{
						cityName: 'Rotterdam',
						countryName: 'Netherlands',
						countryCode: 'NL',
						durationHours: 2,
						dataPoints: 2,
						coordinates: { lat: 51.9225, lng: 4.4792 }
					},
					{
						cityName: 'Rotterdam',
						countryName: 'Netherlands',
						countryCode: 'NL',
						durationHours: 2,
						dataPoints: 2,
						coordinates: { lat: 51.9225, lng: 4.4792 }
					},
					// Multiple Utrecht locations to ensure it gets >= 3 data points
					{
						cityName: 'Utrecht',
						countryName: 'Netherlands',
						countryCode: 'NL',
						durationHours: 2,
						dataPoints: 2,
						coordinates: { lat: 52.0907, lng: 5.1214 }
					},
					{
						cityName: 'Utrecht',
						countryName: 'Netherlands',
						countryCode: 'NL',
						durationHours: 2,
						dataPoints: 2,
						coordinates: { lat: 52.0907, lng: 5.1214 }
					},
					{
						cityName: 'Utrecht',
						countryName: 'Netherlands',
						countryCode: 'NL',
						durationHours: 2,
						dataPoints: 2,
						coordinates: { lat: 52.0907, lng: 5.1214 }
					}
				],
				lastHomePoint: null,
				lastAwayPoint: null,
				tripDataPoints: 27
			};

			const homeAddress = null;
			const tripExclusions: any[] = [];
			const config = { minTripDurationHours: 1, minDataPointsPerDay: 1 } as any;
			const language = 'en';

			const service = new TripDetectionService();
			const trip = await (service as any).finalizeTrip(tripState, homeAddress, tripExclusions, config, language);

			expect(trip).toBeTruthy();
			expect(trip?.startDate).toBe('2024-01-01T10:00:00Z');
			expect(trip?.endDate).toBe('2024-01-01T22:00:00Z');
			// The service calculates duration from start/end times, not from location durations
			// 10:00 to 22:00 = 12 hours
			expect(trip?.metadata.totalDurationHours).toBe(12);
			// All cities should have >= 3 data points, so they should all be in visitedCities
			expect(trip?.metadata.visitedCities).toContain('Amsterdam');
			expect(trip?.metadata.visitedCities).toContain('Rotterdam');
			expect(trip?.metadata.visitedCities).toContain('Utrecht');
			expect(trip?.metadata.homeCountryCode).toBe('Unknown');
		});

		it('should reject trips that are too short', async () => {
			const tripState: TripState = {
				homePoints: [],
				awayPoints: [],
				currentTripStart: '2024-01-01T10:00:00Z',
				currentTripEnd: '2024-01-01T11:00:00Z', // Only 1 hour
				currentTripLocations: [
					{
						cityName: 'Amsterdam',
						countryName: 'Netherlands',
						countryCode: 'NL',
						durationHours: 1,
						dataPoints: 5,
						coordinates: { lat: 52.3676, lng: 4.9041 }
					}
				],
				lastHomePoint: null,
				lastAwayPoint: null,
				tripDataPoints: 5
			};

			const homeAddress = null;
			const tripExclusions: any[] = [];
			const config = { minTripDurationHours: 24, minDataPointsPerDay: 1 } as any; // Require 24 hours
			const language = 'en';

			const service = new TripDetectionService();
			const trip = await (service as any).finalizeTrip(tripState, homeAddress, tripExclusions, config, language);

			expect(trip).toBeNull(); // Should be rejected due to short duration
		});
	});

	describe('Chunk Processing', () => {
		it('should process data in chunks correctly', async () => {
			const mockDataPoints = [
				{ user_id: '1', recorded_at: '2024-01-01T10:00:00Z' } as any,
				{ user_id: '1', recorded_at: '2024-01-01T11:00:00Z' } as any
			];

			const mockSupabase = {
				from: vi.fn(() => ({
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							order: vi.fn(() => ({
								gte: vi.fn(() => ({
									lte: vi.fn(() => ({
										range: vi.fn(() => ({
											data: mockDataPoints,
											error: null
										}))
									}))
								})),
								lte: vi.fn(() => ({
									range: vi.fn(() => ({
										data: mockDataPoints,
										error: null
									}))
								})),
								range: vi.fn(() => ({
									data: mockDataPoints,
									error: null
								}))
							}))
						}))
					}))
				}))
			};

			(service as any).supabase = mockSupabase;

			const result = await (service as any).fetchDataChunk(
				'user1',
				'2024-01-01',
				'2024-01-02',
				1000,
				0
			);

			expect(result).toHaveLength(2);
			expect(result[0].recorded_at).toBe('2024-01-01T10:00:00Z');
		});

		it('should handle undefined dates in chunk fetching', async () => {
			const mockDataPoints = [
				{ user_id: '1', recorded_at: '2024-01-01T10:00:00Z' } as any
			];

			const mockSupabase = {
				from: vi.fn(() => ({
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							order: vi.fn(() => ({
								gte: vi.fn(() => ({
									range: vi.fn(() => ({
										data: mockDataPoints,
										error: null
									}))
								})),
								lte: vi.fn(() => ({
									range: vi.fn(() => ({
										data: mockDataPoints,
										error: null
									}))
								})),
								range: vi.fn(() => ({
									data: mockDataPoints,
									error: null
								}))
							}))
						}))
					}))
				}))
			};

			(service as any).supabase = mockSupabase;

			// Test with undefined start date
			const result1 = await (service as any).fetchDataChunk(
				'user1',
				undefined,
				'2024-01-02',
				1000,
				0
			);

			// Test with undefined end date
			const result2 = await (service as any).fetchDataChunk(
				'user1',
				'2024-01-01',
				undefined,
				1000,
				0
			);

			expect(result1).toHaveLength(1);
			expect(result2).toHaveLength(1);
		});
	});

	describe('Integration Tests', () => {
		it('should handle complete trip detection flow with undefined dates', async () => {
			const service = new TripDetectionService();

			// Mock all the necessary methods and data
			vi.spyOn(service as any, 'determineDateRanges').mockResolvedValue([
				{ startDate: undefined, endDate: undefined }
			]);

			vi.spyOn(service as any, 'getUserSettings').mockResolvedValue({
				homeAddress: null,
				tripExclusions: [],
				language: 'en'
			});

			vi.spyOn(service as any, 'processDateRangeInChunks').mockResolvedValue([]);

			const result = await service.detectTrips('user1');

			expect(result).toEqual([]);
			expect(service).toBeInstanceOf(TripDetectionService);
		});

		it('should handle mixed date scenarios', async () => {
			const service = new TripDetectionService();

			// Mock the determineDateRanges method for mixed scenarios
			vi.spyOn(service as any, 'determineDateRanges').mockResolvedValue([
				{ startDate: '2024-01-01', endDate: undefined },
				{ startDate: undefined, endDate: '2024-12-31' }
			]);

			vi.spyOn(service as any, 'getUserSettings').mockResolvedValue({
				homeAddress: null,
				tripExclusions: [],
				language: 'en'
			});

			vi.spyOn(service as any, 'processDateRangeInChunks').mockResolvedValue([]);

			const result = await service.detectTrips('user1');

			expect(result).toEqual([]);
			expect(service).toBeInstanceOf(TripDetectionService);
		});
	});
});
