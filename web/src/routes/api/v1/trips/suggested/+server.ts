import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/utils/api/response';
import { requireAuth } from '$lib/middleware/auth.middleware';
import { getTripDetectionService } from '$lib/services/server/server-service-adapter';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const GET: RequestHandler = async (event) => {
	try {
		// Authenticate user
		const { user } = await requireAuth(event);

		// Get query parameters
		const url = new URL(event.request.url);
		const status = url.searchParams.get('status') || 'pending';
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const offset = parseInt(url.searchParams.get('offset') || '0');

		// Validate status parameter
		const validStatuses = ['pending', 'approved', 'rejected', 'created', 'all'];
		if (!validStatuses.includes(status)) {
			return validationErrorResponse('Invalid status parameter');
		}

		// Fetch suggested trips from database
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
		let query = supabaseAdmin.from('suggested_trips').select('*').eq('user_id', user.id);

		// Only filter by status if not requesting 'all'
		if (status !== 'all') {
			query = query.eq('status', status);
		}

		const { data: suggestedTrips, error } = await query
			.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1);

		if (error) {
			console.error('Database error fetching suggested trips:', error);
			throw error;
		}

		// Get total count for pagination
		let countQuery = supabaseAdmin
			.from('suggested_trips')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', user.id);

		// Only filter by status if not requesting 'all'
		if (status !== 'all') {
			countQuery = countQuery.eq('status', status);
		}

		const { count: totalCount, error: countError } = await countQuery;

		if (countError) {
			console.error('Database error counting suggested trips:', countError);
			throw countError;
		}

		return successResponse({
			suggestedTrips: suggestedTrips || [],
			total: totalCount || 0,
			count: suggestedTrips?.length || 0,
			hasMore: offset + limit < (totalCount || 0)
		});
	} catch (error) {
		console.error('Error fetching suggested trips:', error);
		return errorResponse(error);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		// Authenticate user
		const { user } = await requireAuth(event);

		// Parse request body
		const body = await event.request.json();
		const { action, tripIds } = body;

		// Validate required parameters
		if (!action || !tripIds || !Array.isArray(tripIds)) {
			return validationErrorResponse('Action and tripIds array are required');
		}

		if (!['approve', 'reject'].includes(action)) {
			return validationErrorResponse('Action must be either "approve" or "reject"');
		}

		if (tripIds.length === 0) {
			return validationErrorResponse('At least one trip ID is required');
		}

		// Use enhanced trip detection service
		const enhancedTripService = getTripDetectionService();

		let result;
		if (action === 'approve') {
			// Approve trips and create actual trips
			const approvedTripIds = await enhancedTripService.approveSuggestedTrips(tripIds, user.id);

			result = {
				action: 'approved',
				approvedTripIds,
				message: `Successfully approved ${approvedTripIds.length} trips`
			};
		} else {
			// Reject trips
			await enhancedTripService.rejectSuggestedTrips(tripIds, user.id);

			result = {
				action: 'rejected',
				rejectedTripIds: tripIds,
				message: `Successfully rejected ${tripIds.length} trips`
			};
		}

		return successResponse(result);
	} catch (error) {
		console.error('Error processing suggested trips:', error);
		return errorResponse(error);
	}
};
