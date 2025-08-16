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

    // Check if user is admin by querying user_profiles table
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || userProfile?.role !== 'admin') {
      logError(profileError || 'User is not admin', 'ADMIN-SERVER-SETTINGS');
      return errorResponse('Forbidden', 403);
    }

    if (req.method === 'GET') {
      // Get server settings
      const { data: settings, error: settingsError } = await supabase
        .from('server_settings')
        .select('*')
        .single();

      if (settingsError && settingsError.code !== 'PGRST116') { // PGRST116 = no rows returned
        logError(settingsError, 'ADMIN-SERVER-SETTINGS');
        return errorResponse('Failed to fetch server settings', 500);
      }

      return successResponse(settings || {});
    }

    if (req.method === 'POST') {
      logInfo('Updating server settings', 'ADMIN-SERVER-SETTINGS', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);

      // Validate required fields
      const requiredFields = ['server_name', 'admin_email'];
      const missingFields = validateRequiredFields(body, requiredFields);

      if (missingFields.length > 0) {
        return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      // Extract boolean fields with defaults
      const allowRegistration = body.allow_registration === true;
      const requireEmailVerification = body.require_email_verification === true;

      logInfo('Received settings update', 'ADMIN_SERVER_SETTINGS', {
        server_name: body.server_name,
        admin_email: body.admin_email,
        allow_registration: body.allow_registration,
        require_email_verification: body.require_email_verification,
        processed_allow_registration: allowRegistration,
        processed_require_email_verification: requireEmailVerification
      });

      // Check if settings already exist
      const { data: existingSettings, error: fetchError } = await supabase
        .from('server_settings')
        .select('id')
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        logError(fetchError, 'ADMIN-SERVER-SETTINGS');
        return errorResponse('Failed to check existing settings', 500);
      }

      let result;
      if (existingSettings) {
        // Update existing settings
        const { data: updatedSettings, error: updateError } = await supabase
          .from('server_settings')
          .update({
            server_name: body.server_name,
            admin_email: body.admin_email,
            allow_registration: allowRegistration,
            require_email_verification: requireEmailVerification,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSettings.id)
          .select()
          .single();

        if (updateError) {
          logError(updateError, 'ADMIN-SERVER-SETTINGS');
          return errorResponse('Failed to update server settings', 500);
        }

        result = updatedSettings;
      } else {
        // Create new settings
        const { data: newSettings, error: insertError } = await supabase
          .from('server_settings')
          .insert({
            server_name: body.server_name,
            admin_email: body.admin_email,
            allow_registration: allowRegistration,
            require_email_verification: requireEmailVerification
          })
          .select()
          .single();

        if (insertError) {
          logError(insertError, 'ADMIN-SERVER-SETTINGS');
          return errorResponse('Failed to create server settings', 500);
        }

        result = newSettings;
      }

      logSuccess('Server settings updated successfully', 'ADMIN-SERVER-SETTINGS', {
        userId: user.id,
        serverName: body.server_name
      });
      return successResponse(result);
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'ADMIN-SERVER-SETTINGS');
    return errorResponse('Internal server error', 500);
  }
});