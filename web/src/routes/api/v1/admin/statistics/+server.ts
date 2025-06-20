import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

export const GET: RequestHandler = async () => {
  try {
    // Create Supabase admin client
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all users
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Calculate statistics
    const totalUsers = users.length;
    const activeUsers = users.filter(user => {
      const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at) : null;
      return lastSignIn && lastSignIn > new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
    }).length;
    const newUsersThisMonth = users.filter(user => {
      const createdAt = new Date(user.created_at);
      return createdAt >= startOfMonth;
    }).length;
    const usersWith2FA = users.filter(user => user.user_metadata?.totp_enabled).length;

    return json({
      totalUsers,
      activeUsers,
      newUsersThisMonth,
      usersWith2FA
    });
  } catch (error) {
    console.error('Admin statistics error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};