import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const { user_id } = params;

    if (!user_id) {
      return json({ success: false, message: 'User ID is required' }, { status: 400 });
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Delete the user
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (error) {
      return json({ success: false, message: error.message }, { status: 500 });
    }

    return json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Admin user delete error:', error);
    return json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
};