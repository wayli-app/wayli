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

    // Create admin client with service role key
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user preferences from user_preferences table
    const { data: preferences, error: prefError } = await supabaseAdmin
      .from('user_preferences')
      .select('*')
      .eq('id', user.id)
      .single();

    if (prefError && prefError.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error fetching preferences:', prefError);
      return errorResponse('Failed to fetch preferences', 500);
    }

    // If preferences don't exist, create them with defaults
    if (!preferences) {
      const { data: newPreferences, error: createError } = await supabaseAdmin
        .from('user_preferences')
        .insert({
          id: user.id,
          theme: 'light',
          language: 'en',
          notifications_enabled: true,
          timezone: 'UTC+00:00 (London, Dublin)'
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating preferences:', createError);
        return errorResponse('Failed to create preferences', 500);
      }

      return successResponse({
        preferences: newPreferences
      });
    }

    return successResponse({
      preferences
    });
  } catch (error) {
    console.error('Preferences fetch error:', error);
    return errorResponse('Failed to fetch preferences', 500);
  }
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  try {
    const { language, notifications_enabled, timezone, pexels_api_key } = await request.json();

    // Get current user from session
    const session = await locals.getSession();
    if (!session) {
      return errorResponse('User not authenticated', 401);
    }

    const user = session.user;

    // Create admin client with service role key
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if preferences exist
    const { data: existingPreferences } = await supabaseAdmin
      .from('user_preferences')
      .select('id')
      .eq('id', user.id)
      .single();

    if (existingPreferences) {
      // Update existing preferences
      const { data: updatedPreferences, error: updateError } = await supabaseAdmin
        .from('user_preferences')
        .update({
        language,
        notifications_enabled,
          timezone,
          pexels_api_key,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select()
        .single();

    if (updateError) {
        console.error('Error updating preferences:', updateError);
        return errorResponse('Failed to update preferences', 500);
    }

    return successResponse({
      message: 'Preferences updated successfully',
        preferences: updatedPreferences
      });
    } else {
      // Create new preferences
      const { data: newPreferences, error: createError } = await supabaseAdmin
        .from('user_preferences')
        .insert({
        id: user.id,
        language,
        notifications_enabled,
        timezone,
          pexels_api_key,
          theme: 'light'
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating preferences:', createError);
        return errorResponse('Failed to create preferences', 500);
      }

      return successResponse({
        message: 'Preferences created successfully',
        preferences: newPreferences
    });
    }
  } catch (error) {
    console.error('Preferences update error:', error);
    return errorResponse(error);
  }
};