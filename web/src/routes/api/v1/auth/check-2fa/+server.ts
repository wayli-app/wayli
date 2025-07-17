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

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email } = await request.json();

		if (!email) {
			return validationErrorResponse('Email is required');
		}

		// Create Supabase admin client
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Get user data to check if 2FA is enabled
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

		return successResponse({
			has2FA: !!totpEnabled,
			message: totpEnabled
				? 'Two-factor authentication is enabled'
				: 'Two-factor authentication is not enabled'
		});
	} catch (error) {
		console.error('Error checking 2FA status:', error);
		return errorResponse(error);
	}
};
