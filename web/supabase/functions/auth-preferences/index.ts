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
      logInfo('Fetching user preferences', 'AUTH-PREFERENCES', { userId: user.id });

      // Get user preferences from user_profiles table
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('preferences')
        .eq('id', user.id)
        .single();

      if (profileError) {
        logError(profileError, 'AUTH-PREFERENCES');
        return errorResponse('Failed to fetch preferences', 500);
      }

      const preferences = profile?.preferences || {};
      logSuccess('Preferences fetched successfully', 'AUTH-PREFERENCES', { userId: user.id });
      return successResponse(preferences);
    }

    if (req.method === 'PUT') {
      logInfo('Updating user preferences', 'AUTH-PREFERENCES', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);

      // Validate required fields
      const requiredFields = ['preferences'];
      const missingFields = validateRequiredFields(body, requiredFields);

      if (missingFields.length > 0) {
        return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      // Update preferences
      const { data: updatedProfile, error: updateError } = await supabase
        .from('user_profiles')
        .update({
          preferences: body.preferences,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select('preferences')
        .single();

      if (updateError) {
        logError(updateError, 'AUTH-PREFERENCES');
        return errorResponse('Failed to update preferences', 500);
      }

      logSuccess('Preferences updated successfully', 'AUTH-PREFERENCES', { userId: user.id });
      return successResponse(updatedProfile.preferences);
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'AUTH-PREFERENCES');
    return errorResponse('Internal server error', 500);
  }
});