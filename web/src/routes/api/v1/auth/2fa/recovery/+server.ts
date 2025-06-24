import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import crypto from 'crypto';

function hashRecoveryCode(code: string) {
	return crypto.createHash('sha256').update(code).digest('hex');
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email, recoveryCode } = await request.json();

		if (!email || !recoveryCode) {
			return json({ success: false, message: 'Email and recovery code are required' }, { status: 400 });
		}

		// Create admin client with service role key
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Get user by email
		const { data: { users }, error: userError } = await supabaseAdmin.auth.admin.listUsers();

		if (userError) {
			return json({ success: false, message: 'Failed to retrieve user' }, { status: 500 });
		}

		const user = users.find(u => u.email === email);
		if (!user) {
			return json({ success: false, message: 'User not found' }, { status: 404 });
		}

		// Check if user has 2FA enabled
		const has2FA = user.user_metadata?.two_factor_enabled === true;
		if (!has2FA) {
			return json({ success: false, message: 'Two-factor authentication is not enabled for this account' }, { status: 400 });
		}

		// Get stored recovery codes
		const storedRecoveryCodes = user.user_metadata?.recovery_codes || [];
		if (!storedRecoveryCodes.length) {
			return json({ success: false, message: 'No recovery codes found for this account' }, { status: 400 });
		}

		// Hash the provided recovery code
		const hashedRecoveryCode = hashRecoveryCode(recoveryCode);

		// Check if the recovery code matches any stored code
		const codeIndex = storedRecoveryCodes.indexOf(hashedRecoveryCode);
		if (codeIndex === -1) {
			return json({ success: false, message: 'Invalid recovery code' }, { status: 400 });
		}

		// Remove the used recovery code
		const updatedRecoveryCodes = [...storedRecoveryCodes];
		updatedRecoveryCodes.splice(codeIndex, 1);

		// Update user metadata to remove the used recovery code
		const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
			user_metadata: {
				...user.user_metadata,
				recovery_codes: updatedRecoveryCodes
			}
		});

		if (updateError) {
			return json({ success: false, message: 'Failed to update recovery codes' }, { status: 500 });
		}

		return json({
			success: true,
			message: 'Recovery code verified successfully',
			remainingCodes: updatedRecoveryCodes.length
		});
	} catch (error) {
		console.error('Recovery code verification error:', error);
		return json({ success: false, message: 'Internal server error' }, { status: 500 });
	}
};