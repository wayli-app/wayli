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
      logInfo('Verifying 2FA token', 'AUTH-2FA-VERIFY', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);

      // Validate required fields
      const requiredFields = ['token'];
      const missingFields = validateRequiredFields(body, requiredFields);

      if (missingFields.length > 0) {
        return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      // Get user's 2FA secret from profile
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('two_factor_secret, two_factor_enabled')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        logError(profileError, 'AUTH-2FA-VERIFY');
        return errorResponse('User profile not found', 404);
      }

      if (!profile.two_factor_enabled) {
        return errorResponse('2FA is not enabled for this user', 400);
      }

      // Verify the TOTP token
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        phone: user.phone || '',
        token: String(body.token),
        type: 'totp'
      });

      if (verifyError || !verifyData.user) {
        logError(verifyError, 'AUTH-2FA-VERIFY');
        return errorResponse('Invalid verification token', 400);
      }

      logSuccess('2FA token verified successfully', 'AUTH-2FA-VERIFY', { userId: user.id });
      return successResponse({
        message: '2FA token verified successfully',
        verified: true
      });
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'AUTH-2FA-VERIFY');
    return errorResponse('Internal server error', 500);
  }
});