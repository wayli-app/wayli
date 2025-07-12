import type { RequestHandler } from './$types';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { GeocodedLocation } from '$lib/types/geocoding.types';

interface TripExclusion {
  id: string;
  name: string;
  location: GeocodedLocation;
  created_at: string;
  updated_at: string;
}

export const GET: RequestHandler = async ({ locals }) => {
  try {
    // Get current user from session
    const session = await locals.getSession();
    if (!session) {
      return errorResponse('User not authenticated', 401);
    }

    const user = session.user;
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user's user_metadata from auth.users
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(user.id);
    if (error || !data.user) {
      console.error('Error fetching user profile:', error);
      return errorResponse('Failed to fetch user profile', 500);
    }

    // Extract trip exclusions from user_metadata
    const exclusions: TripExclusion[] = data.user.user_metadata?.trip_exclusions || [];

    return successResponse({
      exclusions: exclusions
    });
  } catch (error) {
    console.error('Error in trip exclusions GET:', error);
    return errorResponse(error);
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // Get current user from session
    const session = await locals.getSession();
    if (!session) {
      return errorResponse('User not authenticated', 401);
    }

    const user = session.user;
    const body = await request.json();
    const { name, location } = body;

    // Validate required fields
    if (!name || !location) {
      return errorResponse('Name and location are required', 400);
    }

    // Validate location has required fields
    if (!location.display_name || !location.coordinates) {
      return errorResponse('Location must have display_name and coordinates', 400);
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get current user_metadata
    const { data, error: profileError } = await supabaseAdmin.auth.admin.getUserById(user.id);
    if (profileError || !data.user) {
      console.error('Error fetching user profile:', profileError);
      return errorResponse('Failed to fetch user profile', 500);
    }
    const currentMetadata = data.user.user_metadata || {};
    const currentExclusions: TripExclusion[] = currentMetadata.trip_exclusions || [];

    // Check if user already has 10 exclusions (maximum limit)
    if (currentExclusions.length >= 10) {
      return errorResponse('Maximum of 10 trip exclusions allowed', 400);
    }

    // Check if name already exists
    const existingExclusion = currentExclusions.find(ex => ex.name === name);
    if (existingExclusion) {
      return errorResponse('An exclusion with this name already exists', 400);
    }

    // Create new exclusion
    const newExclusion: TripExclusion = {
      id: crypto.randomUUID(),
      name,
      location,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Add to exclusions array
    const updatedExclusions = [...currentExclusions, newExclusion];

    // Update user_metadata
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...currentMetadata,
        trip_exclusions: updatedExclusions
      }
    });

    if (updateError) {
      console.error('Error updating user metadata:', updateError);
      return errorResponse('Failed to save trip exclusion', 500);
    }

    return successResponse({
      exclusion: newExclusion
    });
  } catch (error) {
    console.error('Error in trip exclusions POST:', error);
    return errorResponse(error);
  }
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  try {
    // Get current user from session
    const session = await locals.getSession();
    if (!session) {
      return errorResponse('User not authenticated', 401);
    }

    const user = session.user;
    const body = await request.json();
    const { id, name, location } = body;

    // Validate required fields
    if (!id || !name || !location) {
      return errorResponse('ID, name, and location are required', 400);
    }

    // Validate location has required fields
    if (!location.display_name || !location.coordinates) {
      return errorResponse('Location must have display_name and coordinates', 400);
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get current user_metadata
    const { data, error: profileError } = await supabaseAdmin.auth.admin.getUserById(user.id);
    if (profileError || !data.user) {
      console.error('Error fetching user profile:', profileError);
      return errorResponse('Failed to fetch user profile', 500);
    }
    const currentMetadata = data.user.user_metadata || {};
    const currentExclusions: TripExclusion[] = currentMetadata.trip_exclusions || [];

    // Find the exclusion to update
    const exclusionIndex = currentExclusions.findIndex(ex => ex.id === id);
    if (exclusionIndex === -1) {
      return errorResponse('Trip exclusion not found', 404);
    }

    // Check if name already exists (excluding current exclusion)
    const nameConflict = currentExclusions.find(ex => ex.name === name && ex.id !== id);
    if (nameConflict) {
      return errorResponse('An exclusion with this name already exists', 400);
    }

    // Update the exclusion
    const updatedExclusion: TripExclusion = {
      ...currentExclusions[exclusionIndex],
      name,
      location,
      updated_at: new Date().toISOString()
    };

    currentExclusions[exclusionIndex] = updatedExclusion;

    // Update user_metadata
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...currentMetadata,
        trip_exclusions: currentExclusions
      }
    });

    if (updateError) {
      console.error('Error updating user metadata:', updateError);
      return errorResponse('Failed to update trip exclusion', 500);
    }

    return successResponse({
      exclusion: updatedExclusion
    });
  } catch (error) {
    console.error('Error in trip exclusions PUT:', error);
    return errorResponse(error);
  }
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
  try {
    // Get current user from session
    const session = await locals.getSession();
    if (!session) {
      return errorResponse('User not authenticated', 401);
    }

    const user = session.user;
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return errorResponse('Exclusion ID is required', 400);
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get current user_metadata
    const { data, error: profileError } = await supabaseAdmin.auth.admin.getUserById(user.id);
    if (profileError || !data.user) {
      console.error('Error fetching user profile:', profileError);
      return errorResponse('Failed to fetch user profile', 500);
    }
    const currentMetadata = data.user.user_metadata || {};
    const currentExclusions: TripExclusion[] = currentMetadata.trip_exclusions || [];

    // Find and remove the exclusion
    const updatedExclusions = currentExclusions.filter(ex => ex.id !== id);

    if (updatedExclusions.length === currentExclusions.length) {
      return errorResponse('Trip exclusion not found', 404);
    }

    // Update user_metadata
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...currentMetadata,
        trip_exclusions: updatedExclusions
      }
    });

    if (updateError) {
      console.error('Error updating user metadata:', updateError);
      return errorResponse('Failed to delete trip exclusion', 500);
    }

    return successResponse({
      message: 'Trip exclusion deleted successfully'
    });
  } catch (error) {
    console.error('Error in trip exclusions DELETE:', error);
    return errorResponse(error);
  }
};