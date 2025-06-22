import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const PUT: RequestHandler = async ({ request, locals }) => {
  try {
    const { first_name, last_name } = await request.json();

    // Get current user from session
    const session = await locals.getSession();
    if (!session) {
      return json({ success: false, message: 'User not authenticated' }, { status: 401 });
    }

    const user = session.user;

    // Create admin client with service role key
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Update user metadata using admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        first_name,
        last_name,
        full_name: `${first_name} ${last_name}`.trim()
      }
    });

    if (updateError) {
      return json({ success: false, message: updateError.message }, { status: 500 });
    }

    return json({
      success: true,
      message: 'Profile updated successfully',
      profile: {
        id: user.id,
        email: user.email,
        first_name,
        last_name,
        full_name: `${first_name} ${last_name}`.trim()
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
};