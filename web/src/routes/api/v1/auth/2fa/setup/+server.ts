import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const { password } = await request.json();

    if (!password) {
      return json({ success: false, message: 'Password is required' }, { status: 400 });
    }

    // Get current user from session
    const session = await locals.getSession();
    if (!session) {
      return json({ success: false, message: 'User not authenticated' }, { status: 401 });
    }

    const user = session.user;

    // Create admin client with service role key
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify password by attempting to sign in with admin client
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email!,
      password: password
    });

    if (signInError) {
      return json({ success: false, message: 'Password is incorrect' }, { status: 401 });
    }

    // Generate TOTP secret
    const secret = authenticator.generateSecret();
    const email = user.email!;

    // Create otpauth URL for QR code
    const otpauthUrl = `otpauth://totp/Wayli:${email}?secret=${secret}&issuer=Wayli`;

    // Generate QR code
    let qrCodeUrl = '';
    try {
      qrCodeUrl = await QRCode.toDataURL(otpauthUrl);
    } catch (qrError) {
      console.error('QR code generation failed:', qrError);
      // Continue without QR code, user can enter secret manually
    }

    // Store the secret in user metadata using admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        totp_secret: secret
      }
    });

    if (updateError) {
      return json({ success: false, message: updateError.message }, { status: 500 });
    }

    return json({
      success: true,
      qrCodeUrl,
      secret,
      message: '2FA setup initiated successfully'
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    return json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
};