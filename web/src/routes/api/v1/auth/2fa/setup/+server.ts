import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/utils/api/response';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { TOTPService } from '$lib/services/totp.service';

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

		// Create admin client with service role key
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Verify password by attempting to sign in with admin client
		const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
			email: user.email!,
			password: password
		});

		if (signInError) {
			return errorResponse('Password is incorrect', 401);
		}

		// Generate TOTP setup using the service
		const totpConfig = {
			issuer: 'Wayli',
			label: user.email!,
			email: user.email!
		};

		const { secret, qrCodeUrl } = await TOTPService.createTOTPSetup(totpConfig);

		// Store the secret in user metadata using admin API
		const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
			user_metadata: {
				...user.user_metadata,
				totp_secret: secret,
				totp_setup_completed: false // Mark as not yet verified
			}
		});

		if (updateError) {
			return errorResponse(updateError.message, 500);
		}

		return successResponse({
			secret,
			qrCodeUrl,
			email: user.email,
			message: 'TOTP setup generated successfully. Please verify with your authenticator app.'
		});
	} catch (error) {
		console.error('2FA setup error:', error);
		return errorResponse(error);
	}
};
