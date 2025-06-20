import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { authenticator } from 'otplib';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email, code } = await request.json();

		if (!email || !code) {
			return json({ error: 'Email and verification code are required' }, { status: 400 });
		}

		// Create Supabase admin client
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Get user data to check if 2FA is enabled and get the secret
		const { data: { users }, error: userError } = await supabaseAdmin.auth.admin.listUsers();

		if (userError) {
			return json({ error: 'Failed to retrieve user data' }, { status: 500 });
		}

		// Find the user by email
		const user = users.find(u => u.email === email);

		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// Check if 2FA is enabled
		const totpEnabled = user.user_metadata?.totp_enabled;
		const totpSecret = user.user_metadata?.totp_secret;

		if (!totpEnabled || !totpSecret) {
			return json({ error: 'Two-factor authentication is not enabled for this account' }, { status: 400 });
		}

		// For now, we'll do a simple verification
		// In a production environment, you should use a proper TOTP library
		// This is a placeholder implementation
		const isValid = verifyTOTP(code, totpSecret);

		if (!isValid) {
			return json({ error: 'Invalid verification code' }, { status: 401 });
		}

		// If verification is successful, return success
		return json({
			success: true,
			message: 'Two-factor authentication verified successfully'
		});

	} catch (error) {
		console.error('Error verifying 2FA:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// Proper TOTP verification using otplib
function verifyTOTP(code: string, secret: string): boolean {
	try {
		// Verify the TOTP code with a window of ±1 time step (30 seconds)
		return authenticator.verify({ token: code, secret });
	} catch (error) {
		console.error('TOTP verification error:', error);
		return false;
	}
}