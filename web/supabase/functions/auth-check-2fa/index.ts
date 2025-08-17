import { corsHeaders } from '../_shared/cors.ts';
import {
	setupRequest,
	authenticateRequest,
	successResponse,
	errorResponse,
	logError,
	logSuccess
} from '../_shared/utils.ts';

Deno.serve(async (req) => {
	// Handle CORS preflight
	const corsResponse = setupRequest(req);
	if (corsResponse) return corsResponse;

	try {
		const { user, supabase } = await authenticateRequest(req);

		if (req.method === 'GET') {
			// Get user's 2FA status from profile
			const { data: profile, error: profileError } = await supabase
				.from('user_profiles')
				.select('*')
				.eq('id', user.id)
				.single();

			if (profileError) {
				logError(profileError, 'AUTH-CHECK-2FA');
				return errorResponse('Failed to fetch 2FA status', 500);
			}

			// Check if 2FA columns exist, if not return disabled status
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

		// Ensure CORS headers are applied even for authentication errors
		const errorMessage = error instanceof Error ? error.message : 'Internal server error';
		const status =
			errorMessage.includes('authorization') ||
			errorMessage.includes('token') ||
			errorMessage.includes('No authorization header')
				? 401
				: 500;

		// Create error response with explicit CORS headers
		const response = {
			success: false,
			error: errorMessage
		};

		return new Response(JSON.stringify(response), {
			status,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	}
});
