import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { password } = await request.json();

    if (!password) {
      return json({ success: false, message: 'Password is required' }, { status: 400 });
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ success: false, message: 'User not authenticated' }, { status: 401 });
    }

    // Verify password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: password
    });

    if (signInError) {
      return json({ success: false, message: 'Password is incorrect' }, { status: 401 });
    }

    // Check if 2FA is currently enabled
    const isEnabled = user.user_metadata?.totp_enabled;
    if (!isEnabled) {
      return json({ success: false, message: 'Two-factor authentication is not enabled' }, { status: 400 });
    }

    // Disable 2FA by removing the secret and setting enabled to false
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        totp_secret: null,
        totp_enabled: false
      }
    });

    if (updateError) {
      return json({ success: false, message: updateError.message }, { status: 500 });
    }

    return json({
      success: true,
      message: 'Two-factor authentication disabled successfully'
    });
  } catch (error) {
    console.error('2FA disable error:', error);
    return json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
};