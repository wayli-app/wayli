import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/utils/api/response';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { TOTPService } from '$lib/services/totp.service';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { code } = await request.json();

		// Validate token format
		const tokenValidation = TOTPService.validateToken(code);
		if (!tokenValidation.isValid) {
			return validationErrorResponse(tokenValidation.error || 'Invalid token format');
		}

		// Get current user from session
		const session = await locals.getSession();
		if (!session) {
			return errorResponse('User not authenticated', 401);
		}

		const user = session.user;

		// Get the stored TOTP secret
		const secret = user.user_metadata?.totp_secret;
		if (!secret) {
			return validationErrorResponse('2FA setup not found. Please set up 2FA first.');
		}

		// Verify the TOTP code using the service
		const isValid = TOTPService.verifyCode(code, secret);
		if (!isValid) {
			return errorResponse('Invalid verification code', 401);
		}

		// Generate recovery codes
		const recoveryCodes = TOTPService.generateRecoveryCodes();
		const hashedCodes = recoveryCodes.map((rc) => rc.hashed);

		// Create admin client with service role key
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Enable 2FA by updating user metadata using admin API
		const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
			user_metadata: {
				...user.user_metadata,
				totp_enabled: true,
				two_factor_enabled: true,
				totp_setup_completed: true,
				recovery_codes: hashedCodes
			}
		});

		if (updateError) {
			return errorResponse(updateError.message, 500);
		}

		return successResponse({
			message: 'Two-factor authentication enabled successfully',
			recoveryCodes: recoveryCodes.map((rc) => rc.code)
		});
	} catch (error) {
		console.error('2FA verification error:', error);
		return errorResponse(error);
	}
};
