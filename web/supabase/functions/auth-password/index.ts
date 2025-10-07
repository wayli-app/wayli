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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

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

			// Get the user's JWT token from the Authorization header
			const authHeader = req.headers.get('Authorization');
			const userToken = authHeader?.replace('Bearer ', '');

			if (!userToken) {
				return errorResponse('Authorization token is required', 401);
			}

			// Create a user client with the user's own JWT token
			// This ensures the user can only update their own password
			const userClient = createClient(
				Deno.env.get('SUPABASE_URL')!,
				Deno.env.get('SUPABASE_ANON_KEY')!,
				{
					auth: {
						autoRefreshToken: false,
						persistSession: false
					}
				}
			);

			// Set the session using the user's JWT token
			// This creates a proper session that updateUser() can use
			const { data: sessionData, error: sessionError } = await userClient.auth.setSession({
				access_token: userToken,
				refresh_token: userToken // For edge functions, we can use the same token
			});

			if (sessionError) {
				logError(sessionError, 'AUTH-PASSWORD-SESSION');
				return errorResponse(`Failed to establish session: ${sessionError.message}`, 401);
			}

			if (!sessionData.session) {
				return errorResponse('Failed to establish user session', 401);
			}

			// Update password using the user's own authenticated session
			const { error: updateError } = await userClient.auth.updateUser({
				password: String(body.password)
			});

			if (updateError) {
				logError(updateError, 'AUTH-PASSWORD');
				logInfo('Password update error details', 'AUTH-PASSWORD', {
					errorCode: updateError.code,
					errorMessage: updateError.message,
					errorStatus: updateError.status,
					userId: user.id
				});
				return errorResponse(`Failed to update password: ${updateError.message}`, 500);
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
