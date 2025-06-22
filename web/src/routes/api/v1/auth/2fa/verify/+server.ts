import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { authenticator } from 'otplib';
import { randomBytes, createHash } from 'crypto';

function generateRecoveryCodes(count = 10, length = 10) {
	const codes = [];
	for (let i = 0; i < count; i++) {
		const code = randomBytes(length)
			.toString('base64')
			.replace(/[/+=]/g, '')
			.substring(0, length);
		codes.push(code);
	}
	return codes;
}

function hashRecoveryCode(code: string) {
	return createHash('sha256').update(code).digest('hex');
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { code } = await request.json();

		if (!code) {
			return json({ success: false, message: 'Verification code is required' }, { status: 400 });
		}

		// Get current user from session
		const session = await locals.getSession();
		if (!session) {
			return json({ success: false, message: 'User not authenticated' }, { status: 401 });
		}

		const user = session.user;

		// Get the stored TOTP secret
		const secret = user.user_metadata?.totp_secret;
		if (!secret) {
			return json(
				{ success: false, message: '2FA setup not found. Please set up 2FA first.' },
				{ status: 400 }
			);
		}

		// Verify the TOTP code
		const isValid = authenticator.verify({ token: code, secret });
		if (!isValid) {
			return json({ success: false, message: 'Invalid verification code' }, { status: 401 });
		}

		// Generate and hash recovery codes
		const recoveryCodes = generateRecoveryCodes();
		const hashedCodes = recoveryCodes.map(hashRecoveryCode);

		// Create admin client with service role key
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Enable 2FA by updating user metadata using admin API
		const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
			user_metadata: {
				...user.user_metadata,
				totp_enabled: true,
				two_factor_enabled: true,
				recovery_codes: hashedCodes
			}
		});

		if (updateError) {
			return json({ success: false, message: updateError.message }, { status: 500 });
		}

		return json({
			success: true,
			message: 'Two-factor authentication enabled successfully',
			recoveryCodes
		});
	} catch (error) {
		console.error('2FA verification error:', error);
		return json({ success: false, message: 'Internal server error' }, { status: 500 });
	}
};