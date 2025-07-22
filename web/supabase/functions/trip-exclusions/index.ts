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

		// Handle different HTTP methods
		if (req.method === 'GET') {
			logInfo('Fetching trip exclusions', 'TRIP-EXCLUSIONS', { userId: user.id });

			// Get user's trip exclusions from user preferences
			const { data: userPreferences, error: userPreferencesError } = await supabase
				.from('user_preferences')
				.select('trip_exclusions')
				.eq('id', user.id)
				.maybeSingle();

			if (userPreferencesError) {
				logError(userPreferencesError, 'TRIP-EXCLUSIONS');
				// Return empty array if preferences not found
				return successResponse({ exclusions: [] });
			}

			logSuccess('Trip exclusions fetched successfully', 'TRIP-EXCLUSIONS', {
				userId: user.id,
				count: userPreferences?.trip_exclusions?.length || 0
			});
			return successResponse({ exclusions: userPreferences?.trip_exclusions || [] });
		}

		if (req.method === 'POST') {
			logInfo('Creating trip exclusion', 'TRIP-EXCLUSIONS', { userId: user.id });

			const body = await parseJsonBody<Record<string, unknown>>(req);
			const { name, location } = body;

			if (!name || !location) {
				return errorResponse('Name and location are required', 400);
			}

			// Get current exclusions
			const { data: userPreferences, error: userPreferencesError } = await supabase
				.from('user_preferences')
				.select('trip_exclusions')
				.eq('id', user.id)
				.maybeSingle();

			if (userPreferencesError) {
				logError(userPreferencesError, 'TRIP-EXCLUSIONS');
				return errorResponse('Failed to fetch current exclusions', 500);
			}

			const currentExclusions = userPreferences?.trip_exclusions || [];
			const newExclusion = {
				id: crypto.randomUUID(),
				name: name as string,
				location: location,
				created_at: new Date().toISOString()
			};

			const updatedExclusions = [...currentExclusions, newExclusion];

			// Upsert user preferences with new exclusions
			const { error: upsertError } = await supabase.from('user_preferences').upsert(
				{
					id: user.id,
					trip_exclusions: updatedExclusions,
					updated_at: new Date().toISOString()
				},
				{
					onConflict: 'id'
				}
			);

			if (upsertError) {
				logError(upsertError, 'TRIP-EXCLUSIONS');
				return errorResponse('Failed to save exclusion', 500);
			}

			logSuccess('Trip exclusion created successfully', 'TRIP-EXCLUSIONS', {
				userId: user.id,
				exclusionName: name
			});
			return successResponse({ exclusion: newExclusion });
		}

		if (req.method === 'PUT') {
			logInfo('Updating trip exclusion', 'TRIP-EXCLUSIONS', { userId: user.id });

			const body = await parseJsonBody<Record<string, unknown>>(req);
			const { id, name, location } = body;

			if (!id || !name || !location) {
				return errorResponse('ID, name and location are required', 400);
			}

			// Get current exclusions
			const { data: userPreferences, error: userPreferencesError } = await supabase
				.from('user_preferences')
				.select('trip_exclusions')
				.eq('id', user.id)
				.maybeSingle();

			if (userPreferencesError) {
				logError(userPreferencesError, 'TRIP-EXCLUSIONS');
				return errorResponse('Failed to fetch current exclusions', 500);
			}

			const currentExclusions = userPreferences?.trip_exclusions || [];
			const updatedExclusions = currentExclusions.map((exclusion: any) =>
				exclusion.id === id
					? { ...exclusion, name: name as string, location, updated_at: new Date().toISOString() }
					: exclusion
			);

			// Update user preferences with modified exclusions
			const { error: upsertError } = await supabase.from('user_preferences').upsert(
				{
					id: user.id,
					trip_exclusions: updatedExclusions,
					updated_at: new Date().toISOString()
				},
				{
					onConflict: 'id'
				}
			);

			if (upsertError) {
				logError(upsertError, 'TRIP-EXCLUSIONS');
				return errorResponse('Failed to update exclusion', 500);
			}

			logSuccess('Trip exclusion updated successfully', 'TRIP-EXCLUSIONS', {
				userId: user.id,
				exclusionId: id
			});
			return successResponse({ exclusion: updatedExclusions.find((e: any) => e.id === id) });
		}

		if (req.method === 'DELETE') {
			logInfo('Deleting trip exclusion', 'TRIP-EXCLUSIONS', { userId: user.id });

			const body = await parseJsonBody<Record<string, unknown>>(req);
			const { id } = body;

			if (!id) {
				return errorResponse('Exclusion ID is required', 400);
			}

			// Get current exclusions
			const { data: userPreferences, error: userPreferencesError } = await supabase
				.from('user_preferences')
				.select('trip_exclusions')
				.eq('id', user.id)
				.maybeSingle();

			if (userPreferencesError) {
				logError(userPreferencesError, 'TRIP-EXCLUSIONS');
				return errorResponse('Failed to fetch current exclusions', 500);
			}

			const currentExclusions = userPreferences?.trip_exclusions || [];
			const updatedExclusions = currentExclusions.filter((exclusion: any) => exclusion.id !== id);

			// Update user preferences with filtered exclusions
			const { error: upsertError } = await supabase.from('user_preferences').upsert(
				{
					id: user.id,
					trip_exclusions: updatedExclusions,
					updated_at: new Date().toISOString()
				},
				{
					onConflict: 'id'
				}
			);

			if (upsertError) {
				logError(upsertError, 'TRIP-EXCLUSIONS');
				return errorResponse('Failed to delete exclusion', 500);
			}

			logSuccess('Trip exclusion deleted successfully', 'TRIP-EXCLUSIONS', {
				userId: user.id,
				exclusionId: id
			});
			return successResponse({ message: 'Exclusion deleted successfully' });
		}

		return errorResponse('Method not allowed', 405);
	} catch (error) {
		logError(error, 'TRIP-EXCLUSIONS');
		return errorResponse('Internal server error', 500);
	}
});
