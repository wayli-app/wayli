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
      logInfo('Fetching user profile', 'AUTH-PROFILE', { userId: user.id });

      // Get user profile from user_profiles table
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) {
        logError(profileError, 'AUTH-PROFILE');
        return errorResponse('Failed to fetch profile', 500);
      }

      logSuccess('Profile fetched successfully', 'AUTH-PROFILE', { userId: user.id });
      return successResponse(profile);
    }

    if (req.method === 'POST') {
      logInfo('Updating user profile', 'AUTH-PROFILE', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);

      // Validate required fields
      const requiredFields = ['first_name', 'last_name', 'email'];
      const missingFields = validateRequiredFields(body, requiredFields);

      if (missingFields.length > 0) {
        return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      // Update profile
      const { data: updatedProfile, error: updateError } = await supabase
        .from('user_profiles')
        .update({
          first_name: body.first_name,
          last_name: body.last_name,
          email: body.email,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select()
        .single();

      if (updateError) {
        logError(updateError, 'AUTH-PROFILE');
        return errorResponse('Failed to update profile', 500);
      }

      logSuccess('Profile updated successfully', 'AUTH-PROFILE', { userId: user.id });
      return successResponse(updatedProfile);
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'AUTH-PROFILE');
    return errorResponse('Internal server error', 500);
  }
});