import type { RequestHandler } from '@sveltejs/kit';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { UserProfileService } from '$lib/services/user-profile.service';
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

    // Get user profile
    const profile = await UserProfileService.getUserProfile(user.id);
    if (!profile) {
      return errorResponse('User profile not found', 404);
    }

    // Check if user is admin
    const isAdmin = await UserProfileService.isUserAdmin(user.id);

    return successResponse({
      profile,
      isAdmin,
      user: {
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at,
        created_at: user.created_at
      }
    });

  } catch (error) {
    console.error('Error fetching user profile:', error);
    return errorResponse('Failed to fetch user profile', 500);
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const { full_name, avatar_url } = body;

    // Get current user from session
    const session = await locals.getSession();
    if (!session) {
      return errorResponse('User not authenticated', 401);
    }

    const user = session.user;

    // Update user metadata in auth.users
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        full_name,
        avatar_url
      }
    });

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return errorResponse('Failed to update profile', 500);
    }

    // Get updated profile
    const updatedProfile = await UserProfileService.getUserProfile(user.id);

    return successResponse({
      message: 'Profile updated successfully',
      profile: updatedProfile
    });

  } catch (error) {
    console.error('Profile update error:', error);
    return errorResponse('Failed to update profile', 500);
  }
};