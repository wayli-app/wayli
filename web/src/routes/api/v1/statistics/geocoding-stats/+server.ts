import { successResponse, errorResponse } from '$lib/utils/api/response';
import { supabase } from '$lib/core/supabase/server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		// Get current user from session - this ensures authentication
		const session = await locals.getSession();
		if (!session) {
			return errorResponse('User not authenticated', 401);
		}

		const userId = session.user.id;

		// Get total count of tracker data points
		const { count: totalCount, error: totalError } = await supabase
			.from('tracker_data')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', userId)
			.not('location', 'is', null);

		if (totalError) {
			return errorResponse(`Failed to get total count: ${totalError.message}`, 500);
		}

		// Get count of points that have geocode data (not null and not empty object)
		const { count: geocodedCount, error: geocodedError } = await supabase
			.from('tracker_data')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', userId)
			.not('location', 'is', null)
			.not('geocode', 'is', null)
			.neq('geocode', '{}');

		if (geocodedError) {
			return errorResponse(`Failed to get geocoded count: ${geocodedError.message}`, 500);
		}

		const total = totalCount || 0;
		const geocoded = geocodedCount || 0;
		const percentage = total > 0 ? Math.round((geocoded / total) * 100) : 0;

		return successResponse({
			total,
			geocoded,
			percentage,
			missing: total - geocoded
		});
	} catch (error) {
		console.error('Error fetching geocoding stats:', error);
		return errorResponse('Failed to fetch geocoding statistics', 500);
	}
};