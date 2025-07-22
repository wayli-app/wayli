import {
  setupRequest,
  authenticateRequest,
  successResponse,
  errorResponse,
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
      logInfo('Checking 2FA status', 'AUTH-CHECK-2FA', { userId: user.id });

      // Get user's 2FA status from profile
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('two_factor_enabled, two_factor_secret')
        .eq('id', user.id)
        .single();

      if (profileError) {
        logError(profileError, 'AUTH-CHECK-2FA');
        return errorResponse('Failed to fetch 2FA status', 500);
      }

      const isEnabled = profile?.two_factor_enabled || false;
      const hasSecret = !!profile?.two_factor_secret;

      logSuccess('2FA status checked successfully', 'AUTH-CHECK-2FA', {
        userId: user.id,
        enabled: isEnabled,
        hasSecret
      });

      return successResponse({
        enabled: isEnabled,
        hasSecret,
        setupComplete: isEnabled && hasSecret
      });
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'AUTH-CHECK-2FA');
    return errorResponse('Internal server error', 500);
  }
});