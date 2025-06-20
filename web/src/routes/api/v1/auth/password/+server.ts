import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return json({ success: false, message: 'Current password and new password are required' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return json({ success: false, message: 'New password must be at least 6 characters long' }, { status: 400 });
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ success: false, message: 'User not authenticated' }, { status: 401 });
    }

    // Verify current password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword
    });

    if (signInError) {
      return json({ success: false, message: 'Current password is incorrect' }, { status: 401 });
    }

    // Update the password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      return json({ success: false, message: updateError.message }, { status: 500 });
    }

    return json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password update error:', error);
    return json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
};