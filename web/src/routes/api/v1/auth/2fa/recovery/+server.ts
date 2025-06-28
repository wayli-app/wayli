import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse, notFoundResponse } from '$lib/utils/api/response';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { TOTPService } from '$lib/services/totp.service';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email, recoveryCode } = await request.json();

		if (!email || !recoveryCode) {
			return validationErrorResponse('Email and recovery code are required');
		}

		// Validate recovery code format
		const codeValidation = TOTPService.validateRecoveryCode(recoveryCode);
		if (!codeValidation.isValid) {
			return validationErrorResponse(codeValidation.error || 'Invalid recovery code format');
		}

		// Create admin client with service role key
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Get user by email
		const { data: { users }, error: userError } = await supabaseAdmin.auth.admin.listUsers();

		if (userError) {
			return errorResponse('Failed to retrieve user', 500);
		}

		const user = users.find(u => u.email === email);
		if (!user) {
			return notFoundResponse('User not found');
		}

		// Check if user has 2FA enabled
		const has2FA = user.user_metadata?.two_factor_enabled === true;
		if (!has2FA) {
			return validationErrorResponse('Two-factor authentication is not enabled for this account');
		}

		// Get stored recovery codes
		const storedRecoveryCodes = user.user_metadata?.recovery_codes || [];
		if (!storedRecoveryCodes.length) {
			return validationErrorResponse('No recovery codes found for this account');
		}

		// Verify the recovery code using the service
		const { isValid, remainingCodes } = TOTPService.verifyRecoveryCode(recoveryCode, storedRecoveryCodes);

		if (!isValid) {
			return validationErrorResponse('Invalid recovery code');
		}

		// Update user metadata to remove the used recovery code
		const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
			user_metadata: {
				...user.user_metadata,
				recovery_codes: remainingCodes
			}
		});

		if (updateError) {
			return errorResponse('Failed to update recovery codes', 500);
		}

		return successResponse({
			message: 'Recovery code verified successfully',
			remainingCodes: remainingCodes.length
		});
	} catch (error) {
		console.error('Recovery code verification error:', error);
		return errorResponse(error);
	}
};