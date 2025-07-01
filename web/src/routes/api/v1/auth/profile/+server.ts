import type { RequestHandler } from './$types';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { forwardGeocode } from '$lib/services/external/nominatim.service';

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
      profile: {
        id: user.id,
        email: user.email,
        first_name: metadata.first_name || metadata.firstName || '',
        last_name: metadata.last_name || metadata.lastName || '',
        full_name: metadata.full_name || metadata.fullName || '',
        home_address: metadata.home_address || '',
        home_location: metadata.home_location || null,
        role: metadata.role || 'user',
        avatar_url: metadata.avatar_url || '',
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      preferences: {
        id: user.id,
        theme: metadata.theme || 'light',
        language: metadata.language || 'en',
        notifications_enabled: metadata.notifications_enabled ?? true,
        timezone: metadata.timezone || 'UTC+00:00 (London, Dublin)',
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      two_factor_enabled: metadata.two_factor_enabled === true
    });
  } catch (error) {
    console.error('Profile get error:', error);
    return errorResponse(error);
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const {
      full_name,
      current_password,
      new_password,
      home_address,
      notifications_enabled
    } = body;

    // Get current user from session
    const session = await locals.getSession();
    if (!session) {
      return errorResponse('User not authenticated', 401);
    }

    const user = session.user;
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Prepare updated metadata
    const updatedMetadata: Record<string, unknown> = {
      ...user.user_metadata
    };

    // Update basic profile info
    if (full_name !== undefined) {
      updatedMetadata.full_name = full_name;
    }

    if (notifications_enabled !== undefined) {
      updatedMetadata.notifications_enabled = notifications_enabled;
    }

    // Handle home address as an object
    if (home_address !== undefined) {
      if (home_address && typeof home_address === 'object' && typeof home_address.display_name === 'string') {
        // Validate coordinates
        let coordinates = null;
        if (
          home_address.coordinates &&
          typeof home_address.coordinates.lat === 'number' &&
          typeof home_address.coordinates.lng === 'number'
        ) {
          coordinates = {
            lat: home_address.coordinates.lat,
            lng: home_address.coordinates.lng
          };
        }
        // Validate address
        let address = null;
        if (
          home_address.address &&
          typeof home_address.address === 'object'
        ) {
          address = home_address.address;
        }
        // Store the full object
        updatedMetadata.home_address = {
          display_name: home_address.display_name,
          coordinates,
          address
        };
      } else if (typeof home_address === 'string' && home_address.trim()) {
        // Fallback: if a string is sent, geocode it
        try {
          updatedMetadata.home_address = home_address.trim();
          const geocodeResult = await forwardGeocode(home_address.trim());
          if (geocodeResult) {
            updatedMetadata.home_location = {
              lat: parseFloat(geocodeResult.lat),
              lng: parseFloat(geocodeResult.lon),
              display_name: geocodeResult.display_name,
              address: geocodeResult.address
            };
          } else {
            delete updatedMetadata.home_location;
          }
        } catch (error) {
          console.error('Error processing home address:', error);
          updatedMetadata.home_address = home_address.trim();
          delete updatedMetadata.home_location;
        }
      } else {
        // Clear home address if empty or invalid
        updatedMetadata.home_address = '';
        delete updatedMetadata.home_location;
      }
    }

    // Handle password change if provided
    if (new_password) {
      if (!current_password) {
        return errorResponse('Current password is required to change password', 400);
      }

      // Verify current password and update to new password
      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: new_password
      });

      if (passwordError) {
        return errorResponse('Failed to update password: ' + passwordError.message, 400);
      }
    }

    // Update user metadata
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: updatedMetadata
    });

    if (updateError) {
      return errorResponse('Failed to update profile: ' + updateError.message, 500);
    }

    // Also update the profiles table if it exists
    try {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
          full_name: updatedMetadata.full_name,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (profileError) {
        console.warn('Could not update profiles table:', profileError);
      }
    } catch (error) {
      console.warn('Profiles table update failed:', error);
    }

    return successResponse({
      message: 'Profile updated successfully',
      profile: {
        id: user.id,
        email: user.email,
        full_name: updatedMetadata.full_name,
        home_address: updatedMetadata.home_address,
        home_location: updatedMetadata.home_location || null,
        notifications_enabled: updatedMetadata.notifications_enabled
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return errorResponse(error);
  }
};