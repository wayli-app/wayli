import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/utils/api/response';
import { requireAuth } from '$lib/middleware/auth.middleware';
import { getTripImageSuggestionService } from '$lib/services/server/server-service-adapter';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const POST: RequestHandler = async (event) => {
	try {
		// Authenticate user
		const { user } = await requireAuth(event);

		// Parse request body
		const body = await event.request.json();
		const { startDate, endDate } = body;

		// Validate required parameters
		if (!startDate || !endDate) {
			return validationErrorResponse('Start date and end date are required');
		}

		// Validate date format
		const startDateObj = new Date(startDate);
		const endDateObj = new Date(endDate);

		if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
			return validationErrorResponse('Invalid date format');
		}

		if (endDateObj < startDateObj) {
			return validationErrorResponse('End date must be after start date');
		}

		// Check if server has Pexels API key configured
		const { getPexelsConfig } = await import('$lib/core/config/node-environment');
		const serverApiKey = getPexelsConfig().apiKey;

		// Only get user's API key if server key is not available
		let userApiKey: string | undefined;
		if (!serverApiKey) {
			const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
			const { data: preferences } = await supabaseAdmin
				.from('user_preferences')
				.select('pexels_api_key')
				.eq('id', user.id)
				.single();

			userApiKey = preferences?.pexels_api_key;
		}

		// Create service instance
		const suggestionService = getTripImageSuggestionService();

		// Get trip analysis
		const analysis = await suggestionService.getTripAnalysis(user.id, startDate, endDate);

		// Suggest image
		const imageSuggestion = await suggestionService.suggestTripImage(
			user.id,
			startDate,
			endDate,
			userApiKey
		);

		return successResponse({
			suggestedImageUrl: imageSuggestion?.imageUrl || null,
			attribution: imageSuggestion?.attribution || null,
			analysis: {
				primaryCountry: analysis.primaryCountry,
				primaryCity: analysis.primaryCity,
				allCountries: analysis.allCountries,
				allCities: analysis.allCities,
				countryStats: analysis.countryStats,
				cityStats: analysis.cityStats
			}
		});
	} catch (error) {
		console.error('Error suggesting trip image:', error);
		return errorResponse(error);
	}
};
