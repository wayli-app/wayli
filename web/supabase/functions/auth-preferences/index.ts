import {
	setupRequest,
	authenticateRequest,
	successResponse,
	errorResponse,
	parseJsonBody,
	validateRequiredFields,
	logError,
	logInfo,
	logSuccess
} from '../_shared/utils.ts';

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = setupRequest(req);
	if (corsResponse) return corsResponse;

	try {
		const { user, supabase } = await authenticateRequest(req);

		if (req.method === 'GET') {
			// Get user preferences from user_preferences table
			const { data: preferences, error: preferencesError } = await supabase
				.from('user_preferences')
				.select('*')
				.eq('id', user.id)
				.single();

			if (preferencesError) {
				logError(preferencesError, 'AUTH-PREFERENCES');
				return errorResponse('Failed to fetch preferences', 500);
			}

			// Check if server-side Pexels API key is available
			// For now, hardcode to true since PEXELS_API_KEY is set in .env.local
			const preferencesWithServerKey = {
				...preferences,
				server_pexels_api_key_available: true
			};

			return successResponse(preferencesWithServerKey);
		}

		if (req.method === 'PUT') {
			logInfo('Updating user preferences', 'AUTH-PREFERENCES', { userId: user.id });

			const body = await parseJsonBody<{ preferences: Record<string, unknown> }>(req);

			// Validate required fields
			const requiredFields = ['preferences'];
			const missingFields = validateRequiredFields(body, requiredFields);

			if (missingFields.length > 0) {
				return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
			}

			// Update preferences
			const { data: updatedPreferences, error: updateError } = await supabase
				.from('user_preferences')
				.update({
					theme: body.preferences.theme as string,
					language: body.preferences.language as string,
					notifications_enabled: body.preferences.notifications_enabled as boolean,
					timezone: body.preferences.timezone as string,
					pexels_api_key: body.preferences.pexels_api_key as string,
					trip_exclusions: body.preferences.trip_exclusions as unknown,
					updated_at: new Date().toISOString()
				})
				.eq('id', user.id)
				.select('*')
				.single();

			if (updateError) {
				logError(updateError, 'AUTH-PREFERENCES');
				return errorResponse('Failed to update preferences', 500);
			}

			// Check if server-side Pexels API key is available
			// For now, hardcode to true since PEXELS_API_KEY is set in .env.local
			const preferencesWithServerKey = {
				...updatedPreferences,
				server_pexels_api_key_available: true
			};

			logSuccess('Preferences updated successfully', 'AUTH-PREFERENCES', { userId: user.id });
			return successResponse(preferencesWithServerKey);
		}

		return errorResponse('Method not allowed', 405);
	} catch (error) {
		logError(error, 'AUTH-PREFERENCES');
		return errorResponse('Internal server error', 500);
	}
});
