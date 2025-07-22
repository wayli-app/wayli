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

    // Check if user is admin
    if (user.user_metadata?.role !== 'admin') {
      return errorResponse('Forbidden', 403);
    }

    if (req.method === 'GET') {
      logInfo('Fetching server settings', 'ADMIN-SERVER-SETTINGS', { userId: user.id });

      // Get server settings
      const { data: settings, error: settingsError } = await supabase
        .from('server_settings')
        .select('*')
        .single();

      if (settingsError && settingsError.code !== 'PGRST116') { // PGRST116 = no rows returned
        logError(settingsError, 'ADMIN-SERVER-SETTINGS');
        return errorResponse('Failed to fetch server settings', 500);
      }

      logSuccess('Server settings fetched successfully', 'ADMIN-SERVER-SETTINGS', { userId: user.id });
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
            admin_email: body.admin_email
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