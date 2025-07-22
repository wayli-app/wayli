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

    if (req.method === 'POST') {
      logInfo('Updating user password', 'AUTH-PASSWORD', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);

      // Validate required fields
      const requiredFields = ['password'];
      const missingFields = validateRequiredFields(body, requiredFields);

      if (missingFields.length > 0) {
        return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      // Update user password using Supabase Auth admin API
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        { password: String(body.password) }
      );

      if (updateError) {
        logError(updateError, 'AUTH-PASSWORD');
        return errorResponse('Failed to update password', 500);
      }

      logSuccess('Password updated successfully', 'AUTH-PASSWORD', { userId: user.id });
      return successResponse({ message: 'Password updated successfully' });
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'AUTH-PASSWORD');
    return errorResponse('Internal server error', 500);
  }
});