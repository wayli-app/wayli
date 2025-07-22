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
      logInfo('Setting up 2FA', 'AUTH-2FA-SETUP', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);

      // Validate required fields
      const requiredFields = ['secret', 'token'];
      const missingFields = validateRequiredFields(body, requiredFields);

      if (missingFields.length > 0) {
        return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      // Verify the TOTP token
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        phone: user.phone || '',
        token: String(body.token),
        type: 'totp'
      });

      if (verifyError || !verifyData.user) {
        logError(verifyError, 'AUTH-2FA-SETUP');
        return errorResponse('Invalid verification token', 400);
      }

      // Update user profile to enable 2FA
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          two_factor_enabled: true,
          two_factor_secret: body.secret,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        logError(updateError, 'AUTH-2FA-SETUP');
        return errorResponse('Failed to enable 2FA', 500);
      }

      logSuccess('2FA setup completed successfully', 'AUTH-2FA-SETUP', { userId: user.id });
      return successResponse({
        message: '2FA setup completed successfully',
        enabled: true
      });
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'AUTH-2FA-SETUP');
    return errorResponse('Internal server error', 500);
  }
});