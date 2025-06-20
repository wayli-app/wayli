import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import { authenticator } from 'otplib';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { code } = await request.json();

    if (!code) {
      return json({ success: false, message: 'Verification code is required' }, { status: 400 });
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ success: false, message: 'User not authenticated' }, { status: 401 });
    }

    // Get the stored TOTP secret
    const secret = user.user_metadata?.totp_secret;
    if (!secret) {
      return json({ success: false, message: '2FA setup not found. Please set up 2FA first.' }, { status: 400 });
    }

    // Verify the TOTP code
    const isValid = authenticator.verify({ token: code, secret });
    if (!isValid) {
      return json({ success: false, message: 'Invalid verification code' }, { status: 401 });
    }

    // Enable 2FA by updating user metadata
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        totp_enabled: true
      }
    });

    if (updateError) {
      return json({ success: false, message: updateError.message }, { status: 500 });
    }

    return json({
      success: true,
      message: 'Two-factor authentication enabled successfully'
    });
  } catch (error) {
    console.error('2FA verification error:', error);
    return json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
};