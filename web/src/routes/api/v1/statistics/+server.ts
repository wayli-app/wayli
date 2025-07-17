import type { RequestHandler } from '@sveltejs/kit';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { getStatisticsService } from '$lib/services/server/server-service-adapter';

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		// Get current user from session - this ensures authentication
		const session = await locals.getSession();
		if (!session) {
			return errorResponse('User not authenticated', 401);
		}

		const searchParams = url.searchParams;

		// Parse date range parameters (no user ID parameter accepted for security)
		const startDate = searchParams.get('startDate') || undefined;
		const endDate = searchParams.get('endDate') || undefined;

		// Use the statistics service from the service layer
		// Security: Only use session.user.id - never accept user ID from request parameters
		const statisticsService = getStatisticsService();
		const statisticsData = await statisticsService.calculateStatistics(session.user.id, startDate, endDate);

		return successResponse(statisticsData);
	} catch (error) {
		console.error('Error calculating statistics:', error);
		return errorResponse('Failed to calculate statistics', 500);
	}
};