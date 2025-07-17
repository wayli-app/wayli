import type { RequestHandler } from './$types';
import {
	successResponse,
	errorResponse,
	validationErrorResponse,
	notFoundResponse
} from '$lib/utils/api/response';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { TOTPService } from '$lib/services/totp.service';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email, code } = await request.json();

		if (!email || !code) {
			return validationErrorResponse('Email and verification code are required');
		}

		// Validate token format
		const tokenValidation = TOTPService.validateToken(code);
		if (!tokenValidation.isValid) {
			return validationErrorResponse(tokenValidation.error || 'Invalid token format');
		}

		// Create Supabase admin client
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Get user data to check if 2FA is enabled and get the secret
		const {
			data: { users },
			error: userError
		} = await supabaseAdmin.auth.admin.listUsers();

		if (userError) {
			return errorResponse('Failed to retrieve user data', 500);
		}

		// Find the user by email
		const user = users.find((u) => u.email === email);

		if (!user) {
			return notFoundResponse('User not found');
		}

		// Check if 2FA is enabled
		const totpEnabled = user.user_metadata?.totp_enabled;
		const totpSecret = user.user_metadata?.totp_secret;

		if (!totpEnabled || !totpSecret) {
			return validationErrorResponse('Two-factor authentication is not enabled for this account');
		}

		// Verify the TOTP code using the service
		const isValid = TOTPService.verifyCode(code, totpSecret);

		if (!isValid) {
			return errorResponse('Invalid verification code', 401);
		}

		// If verification is successful, return success
		return successResponse({
			message: 'Two-factor authentication verified successfully'
		});
	} catch (error) {
		console.error('Error verifying 2FA:', error);
		return errorResponse(error);
	}
};
