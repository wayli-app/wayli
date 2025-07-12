import type { RequestHandler } from './$types';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const GET: RequestHandler = async ({ locals }) => {
  try {
    // Get current user from session
    const session = await locals.getSession();
    if (!session) {
      return errorResponse('User not authenticated', 401);
    }

    const user = session.user;
    const metadata = user.user_metadata || {};

    return successResponse({
      preferences: {
        id: user.id,
        language: metadata.language || 'en',
        notifications_enabled: metadata.notifications_enabled ?? true,
        timezone: metadata.timezone || 'UTC+00:00 (London, Dublin)',
        theme: metadata.theme || 'light'
      }
    });
  } catch (error) {
    console.error('Preferences fetch error:', error);
    return errorResponse('Failed to fetch preferences', 500);
  }
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  try {
    const { language, notifications_enabled, timezone } = await request.json();

    // Get current user from session
    const session = await locals.getSession();
    if (!session) {
      return errorResponse('User not authenticated', 401);
    }

    const user = session.user;

    // Create admin client with service role key
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Update user metadata using admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        language,
        notifications_enabled,
        timezone
      }
    });

    if (updateError) {
      return errorResponse(updateError.message, 500);
    }

    return successResponse({
      message: 'Preferences updated successfully',
      preferences: {
        id: user.id,
        language,
        notifications_enabled,
        timezone,
        theme: user.user_metadata?.theme || 'light'
      }
    });
  } catch (error) {
    console.error('Preferences update error:', error);
    return errorResponse(error);
  }
};