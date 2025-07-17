import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/utils/api/response';
import { requireAuth } from '$lib/middleware/auth.middleware';
import { getTripDetectionService } from '$lib/services/server/server-service-adapter';

export const POST: RequestHandler = async (event) => {
	try {
		// Authenticate user
		const { user } = await requireAuth(event);

		// Parse request body
		const body = await event.request.json();
		const { tripIds } = body;

		// Validate required parameters
		if (!tripIds || !Array.isArray(tripIds)) {
			return validationErrorResponse('Trip IDs array is required');
		}

		if (tripIds.length === 0) {
			return validationErrorResponse('At least one trip ID is required');
		}

		// Use enhanced trip detection service to queue image generation
		const enhancedTripService = getTripDetectionService();
		await enhancedTripService.queueImageGeneration(tripIds, user.id);

		return successResponse({
			message: `Image generation queued for ${tripIds.length} trips`,
			tripIds
		});
	} catch (error) {
		console.error('Error queuing image generation:', error);
		return errorResponse(error);
	}
};
