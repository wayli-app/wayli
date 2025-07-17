import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/utils/api/response';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { password } = await request.json();

		if (!password) {
			return validationErrorResponse('Password is required');
		}

		// Get current user from session
		const session = await locals.getSession();
		if (!session) {
			return errorResponse('User not authenticated', 401);
		}
		const user = session.user;

		// Verify password
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
		const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
			email: user.email!,
			password: password
		});

		if (signInError) {
			return errorResponse('Password is incorrect', 401);
		}

		// Disable 2FA
		const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
			user_metadata: {
				...user.user_metadata,
				totp_enabled: false,
				two_factor_enabled: false,
				totp_secret: undefined,
				recovery_codes: undefined
			}
		});

		if (updateError) {
			return errorResponse(updateError.message, 500);
		}

		return successResponse({
			message: 'Two-factor authentication disabled successfully'
		});
	} catch (error) {
		console.error('2FA disable error:', error);
		return errorResponse(error);
	}
};
