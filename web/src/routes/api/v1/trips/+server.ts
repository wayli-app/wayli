import type { RequestHandler } from './$types';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { requireAuth } from '$lib/middleware/auth.middleware';
import { supabase } from '$lib/core/supabase/server';

export const GET: RequestHandler = async (event) => {
	try {
		// Authenticate user
		const { user } = await requireAuth(event);

		// Get query parameters
		const url = new URL(event.request.url);
		const status = url.searchParams.get('status') || 'active';

		// Build query
		let query = supabase
			.from('trips')
			.select(`
				id,
				title,
				description,
				start_date,
				end_date,
				status,
				image_url,
				labels,
				metadata,
				created_at,
				updated_at
			`)
			.eq('user_id', user.id);

		// Filter by status if specified
		if (status !== 'all') {
			query = query.eq('status', status);
		}

		const { data: trips, error } = await query.order('start_date', { ascending: false });

		if (error) {
			console.error('Database error fetching trips:', error);
			throw new Error('Failed to fetch trips from database');
		}

		// Transform the data to include computed fields
		const transformedTrips = trips?.map(trip => ({
			...trip,
			// Add placeholder values for fields that might not exist in the current schema
			total_distance: 0, // This would be calculated from tracker data
			point_count: 0, // This would be calculated from tracker data
		})) || [];

		return successResponse({
			trips: transformedTrips,
			total: transformedTrips.length
		});
	} catch (error) {
		console.error('Error fetching trips:', error);
		return errorResponse(error);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		// Authenticate user
		const { user } = await requireAuth(event);

		// Parse request body
		const body = await event.request.json();
		const { title, description, start_date, end_date, labels, metadata, image_url } = body;

		// Validate required fields
		if (!title || !start_date || !end_date) {
			return errorResponse(new Error('Title, start date, and end date are required'));
		}

		// Validate dates
		const startDate = new Date(start_date);
		const endDate = new Date(end_date);

		if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
			return errorResponse(new Error('Invalid date format'));
		}

		if (endDate < startDate) {
			return errorResponse(new Error('End date must be after start date'));
		}

		// Insert new trip
		const { data: newTrip, error } = await supabase
			.from('trips')
			.insert({
				user_id: user.id,
				title: title.trim(),
				description: description?.trim() || null,
				start_date: start_date,
				end_date: end_date,
				labels: labels || [],
				metadata: metadata || {},
				image_url: image_url || null,
				status: 'approved'
			})
			.select()
			.single();

		if (error) {
			console.error('Database error creating trip:', error);
			throw new Error('Failed to create trip');
		}

		return successResponse({
			trip: newTrip
		});
	} catch (error) {
		console.error('Error creating trip:', error);
		return errorResponse(error);
	}
};

export const PUT: RequestHandler = async (event) => {
	try {
		// Authenticate user
		const { user } = await requireAuth(event);

		// Parse request body
		const body = await event.request.json();
		const { id, title, description, start_date, end_date, labels, metadata, image_url } = body;

		// Validate required fields
		if (!id || !title || !start_date || !end_date) {
			return errorResponse(new Error('Trip ID, title, start date, and end date are required'));
		}

		// Validate dates
		const startDate = new Date(start_date);
		const endDate = new Date(end_date);

		if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
			return errorResponse(new Error('Invalid date format'));
		}

		if (endDate < startDate) {
			return errorResponse(new Error('End date must be after start date'));
		}

		// Update trip
		const { data: updatedTrip, error } = await supabase
			.from('trips')
			.update({
				title: title.trim(),
				description: description?.trim() || null,
				start_date: start_date,
				end_date: end_date,
				labels: labels || [],
				metadata: metadata || {},
				image_url: image_url || null,
				updated_at: new Date().toISOString()
			})
			.eq('id', id)
			.eq('user_id', user.id)
			.select()
			.single();

		if (error) {
			console.error('Database error updating trip:', error);
			throw new Error('Failed to update trip');
		}

		if (!updatedTrip) {
			return errorResponse(new Error('Trip not found or access denied'));
		}

		return successResponse({
			trip: updatedTrip
		});
	} catch (error) {
		console.error('Error updating trip:', error);
		return errorResponse(error);
	}
};