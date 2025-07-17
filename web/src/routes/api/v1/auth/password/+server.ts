import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/utils/api/response';
import { supabase } from '$lib/supabase';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { currentPassword, newPassword } = await request.json();

		if (!currentPassword || !newPassword) {
			return validationErrorResponse('Current password and new password are required');
		}

		if (newPassword.length < 6) {
			return validationErrorResponse('New password must be at least 6 characters long');
		}

		// Get current user
		const {
			data: { user },
			error: userError
		} = await supabase.auth.getUser();
		if (userError || !user) {
			return errorResponse('User not authenticated', 401);
		}

		// Verify current password by attempting to sign in
		const { error: signInError } = await supabase.auth.signInWithPassword({
			email: user.email!,
			password: currentPassword
		});

		if (signInError) {
			return errorResponse('Current password is incorrect', 401);
		}

		// Update the password
		const { error: updateError } = await supabase.auth.updateUser({
			password: newPassword
		});

		if (updateError) {
			return errorResponse(updateError.message, 500);
		}

		return successResponse({
			message: 'Password updated successfully'
		});
	} catch (error) {
		console.error('Password update error:', error);
		return errorResponse(error);
	}
};
