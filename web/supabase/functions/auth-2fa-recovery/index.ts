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
      logInfo('Processing 2FA recovery', 'AUTH-2FA-RECOVERY', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);

      // Validate required fields
      const requiredFields = ['recovery_code'];
      const missingFields = validateRequiredFields(body, requiredFields);

      if (missingFields.length > 0) {
        return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      // Get user's recovery codes from profile
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('two_factor_recovery_codes, two_factor_enabled')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        logError(profileError, 'AUTH-2FA-RECOVERY');
        return errorResponse('User profile not found', 404);
      }

      if (!profile.two_factor_enabled) {
        return errorResponse('2FA is not enabled for this user', 400);
      }

      const recoveryCodes = profile.two_factor_recovery_codes as string[] || [];
      const providedCode = String(body.recovery_code);

      // Check if the provided recovery code is valid
      if (!recoveryCodes.includes(providedCode)) {
        logError('Invalid recovery code provided', 'AUTH-2FA-RECOVERY');
        return errorResponse('Invalid recovery code', 400);
      }

      // Remove the used recovery code
      const updatedCodes = recoveryCodes.filter(code => code !== providedCode);

      // Update profile to remove the used recovery code
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          two_factor_recovery_codes: updatedCodes,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        logError(updateError, 'AUTH-2FA-RECOVERY');
        return errorResponse('Failed to update recovery codes', 500);
      }

      logSuccess('2FA recovery successful', 'AUTH-2FA-RECOVERY', {
        userId: user.id,
        remainingCodes: updatedCodes.length
      });

      return successResponse({
        message: '2FA recovery successful',
        recoverySuccessful: true,
        remainingCodes: updatedCodes.length
      });
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'AUTH-2FA-RECOVERY');
    return errorResponse('Internal server error', 500);
  }
});