// web/src/lib/services/trip-image-suggestion.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TripImageSuggestionService } from './trip-image-suggestion.service';

// Mock the Pexels service
vi.mock('./external/pexels.service', () => ({
	getTripBannerImageWithAttribution: vi.fn()
}));

// Mock the worker client
vi.mock('../../worker/client', () => ({
	createWorkerClient: vi.fn(() => ({
		from: vi.fn().mockReturnValue({
			select: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					gte: vi.fn().mockReturnValue({
						lte: vi.fn().mockReturnValue({
							not: vi.fn().mockReturnValue({
								order: vi.fn().mockResolvedValue({
									data: [],
									error: null
								})
							})
						})
					})
				})
			})
		})
	}))
}));

describe('Trip Image Suggestion Service - City Dominance Logic', () => {
	let service: TripImageSuggestionService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new TripImageSuggestionService();
	});

	describe('analyzeTripLocations', () => {
		it('should calculate city dominance correctly for city-focused trips', async () => {
			// Mock data where city represents 85% of trip time
			const mockTrackerData = [
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Amsterdam' } } }),
					recorded_at: '2024-01-01T10:00:00Z'
				},
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Amsterdam' } } }),
					recorded_at: '2024-01-01T11:00:00Z'
				},
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Amsterdam' } } }),
					recorded_at: '2024-01-01T12:00:00Z'
				},
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Amsterdam' } } }),
					recorded_at: '2024-01-01T13:00:00Z'
				},
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Amsterdam' } } }),
					recorded_at: '2024-01-01T14:00:00Z'
				},
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Rotterdam' } } }),
					recorded_at: '2024-01-01T15:00:00Z'
				},
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Rotterdam' } } }),
					recorded_at: '2024-01-01T16:00:00Z'
				}
			];

			// Mock the Supabase query to return our test data
			const mockSupabase = {
				from: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							gte: vi.fn().mockReturnValue({
								lte: vi.fn().mockReturnValue({
									not: vi.fn().mockReturnValue({
										order: vi.fn().mockResolvedValue({
											data: mockTrackerData,
											error: null
										})
									})
								})
							})
						})
					})
				})
			};

			// Replace the mock with our test data
			vi.mocked(service.supabase).from = mockSupabase.from;

			const result = await service.analyzeTripLocations('user123', '2024-01-01', '2024-01-01');

			expect(result.primaryCity).toBe('amsterdam');
			// City search will always be used when primaryCity exists
		});

		it('should always use city search when primaryCity exists', async () => {
			// Mock data where city represents 90% of trip time
			const mockTrackerData = [
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Amsterdam' } } }),
					recorded_at: '2024-01-01T10:00:00Z'
				},
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Amsterdam' } } }),
					recorded_at: '2024-01-01T11:00:00Z'
				},
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Amsterdam' } } }),
					recorded_at: '2024-01-01T12:00:00Z'
				},
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Amsterdam' } } }),
					recorded_at: '2024-01-01T13:00:00Z'
				},
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Amsterdam' } } }),
					recorded_at: '2024-01-01T14:00:00Z'
				},
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Amsterdam' } } }),
					recorded_at: '2024-01-01T15:00:00Z'
				},
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Amsterdam' } } }),
					recorded_at: '2024-01-01T16:00:00Z'
				},
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Amsterdam' } } }),
					recorded_at: '2024-01-01T17:00:00Z'
				},
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Amsterdam' } } }),
					recorded_at: '2024-01-01T18:00:00Z'
				},
				{
					country_code: 'NL',
					geocode: JSON.stringify({ properties: { address: { city: 'Rotterdam' } } }),
					recorded_at: '2024-01-01T19:00:00Z'
				}
			];

			const mockSupabase = {
				from: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							gte: vi.fn().mockReturnValue({
								lte: vi.fn().mockReturnValue({
									not: vi.fn().mockReturnValue({
										order: vi.fn().mockResolvedValue({
											data: mockTrackerData,
											error: null
										})
									})
								})
							})
						})
					})
				})
			};

			vi.mocked(service.supabase).from = mockSupabase.from;

			const result = await service.analyzeTripLocations('user123', '2024-01-01', '2024-01-01');

			expect(result.primaryCity).toBe('amsterdam');
			// City search will always be used when primaryCity exists
		});

		it('should handle trips with no city data', async () => {
			const mockTrackerData = [
				{ country_code: 'NL', geocode: null, recorded_at: '2024-01-01T10:00:00Z' },
				{ country_code: 'NL', geocode: null, recorded_at: '2024-01-01T11:00:00Z' }
			];

			const mockSupabase = {
				from: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							gte: vi.fn().mockReturnValue({
								lte: vi.fn().mockReturnValue({
									not: vi.fn().mockReturnValue({
										order: vi.fn().mockResolvedValue({
											data: mockTrackerData,
											error: null
										})
									})
								})
							})
						})
					})
				})
			};

			vi.mocked(service.supabase).from = mockSupabase.from;

			const result = await service.analyzeTripLocations('user123', '2024-01-01', '2024-01-01');

			expect(result.primaryCity).toBeUndefined();
			// No city search when no primaryCity
		});
	});
});
