import type { RequestHandler } from './$types';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { requireAuth } from '$lib/middleware/auth.middleware';

export const GET: RequestHandler = async (event) => {
	try {
		// Authenticate user
		await requireAuth(event);

		// For now, return sample trip data
		// In the future, this would query the database for actual trips
		const sampleTrips = [
			{
				id: '1',
				title: 'Weekend in Amsterdam',
				description: 'A wonderful weekend exploring the canals and museums',
				start_date: '2024-06-15T10:00:00Z',
				end_date: '2024-06-17T18:00:00Z',
				total_distance: 15420,
				point_count: 156,
				image_url: null,
				created_at: '2024-06-15T10:00:00Z',
				updated_at: '2024-06-17T18:00:00Z'
			},
			{
				id: '2',
				title: 'Hiking in the Alps',
				description: 'Challenging mountain trails with breathtaking views',
				start_date: '2024-05-20T08:00:00Z',
				end_date: '2024-05-25T16:00:00Z',
				total_distance: 45230,
				point_count: 324,
				image_url: null,
				created_at: '2024-05-20T08:00:00Z',
				updated_at: '2024-05-25T16:00:00Z'
			},
			{
				id: '3',
				title: 'City Walk in Paris',
				description: 'Exploring the beautiful streets and landmarks',
				start_date: '2024-06-10T14:00:00Z',
				end_date: '2024-06-10T20:00:00Z',
				total_distance: 8200,
				point_count: 89,
				image_url: null,
				created_at: '2024-06-10T14:00:00Z',
				updated_at: '2024-06-10T20:00:00Z'
			},
			{
				id: '4',
				title: 'Beach Vacation in Bali',
				description: 'Relaxing days by the ocean and exploring local culture',
				start_date: '2024-04-15T12:00:00Z',
				end_date: '2024-04-22T10:00:00Z',
				total_distance: 28750,
				point_count: 201,
				image_url: null,
				created_at: '2024-04-15T12:00:00Z',
				updated_at: '2024-04-22T10:00:00Z'
			},
			{
				id: '5',
				title: 'Business Trip to Tokyo',
				description: 'Work meetings and exploring the city after hours',
				start_date: '2024-03-10T09:00:00Z',
				end_date: '2024-03-15T17:00:00Z',
				total_distance: 18340,
				point_count: 145,
				image_url: null,
				created_at: '2024-03-10T09:00:00Z',
				updated_at: '2024-03-15T17:00:00Z'
			},
			{
				id: '6',
				title: 'Weekend Getaway to Barcelona',
				description: 'Quick escape to enjoy tapas and architecture',
				start_date: '2024-02-28T12:00:00Z',
				end_date: '2024-03-02T14:00:00Z',
				total_distance: 12350,
				point_count: 98,
				image_url: null,
				created_at: '2024-02-28T12:00:00Z',
				updated_at: '2024-03-02T14:00:00Z'
			}
		];

		return successResponse({
			trips: sampleTrips,
			total: sampleTrips.length
		});
	} catch (error) {
		console.error('Error fetching trips:', error);
		return errorResponse(error);
	}
};