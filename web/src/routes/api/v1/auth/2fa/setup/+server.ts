import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

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

    // Store the secret in user metadata (but don't enable 2FA yet)
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
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