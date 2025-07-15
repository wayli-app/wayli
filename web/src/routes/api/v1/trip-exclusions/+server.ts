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

    // Get trip exclusions from user preferences
    const { data: userPreferences, error: userPreferencesError } = await supabaseAdmin
      .from('user_preferences')
      .select('trip_exclusions')
      .eq('id', user.id)
      .maybeSingle();

    let exclusions: TripExclusion[] = [];
    if (userPreferencesError) {
      console.error('Error fetching user preferences for trip exclusions:', userPreferencesError);
      // Fallback to empty array if preferences not found
    } else {
      exclusions = userPreferences?.trip_exclusions || [];
    }

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

    // Get current trip exclusions from user preferences
    const { data: userPreferences, error: preferencesError } = await supabaseAdmin
      .from('user_preferences')
      .select('trip_exclusions')
      .eq('id', user.id)
      .maybeSingle();

    if (preferencesError) {
      console.error('Error fetching user preferences:', preferencesError);
      return errorResponse('Failed to fetch user preferences', 500);
    }

    const currentExclusions: TripExclusion[] = userPreferences?.trip_exclusions || [];

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

    // Upsert user preferences with new exclusions
    const { error: upsertError } = await supabaseAdmin
      .from('user_preferences')
      .upsert({
        id: user.id,
        trip_exclusions: updatedExclusions,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });

    if (upsertError) {
      console.error('Error upserting user preferences:', upsertError);
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

    // Get current trip exclusions from user preferences
    const { data: userPreferences, error: preferencesError } = await supabaseAdmin
      .from('user_preferences')
      .select('trip_exclusions')
      .eq('id', user.id)
      .maybeSingle();

    if (preferencesError) {
      console.error('Error fetching user preferences:', preferencesError);
      return errorResponse('Failed to fetch user preferences', 500);
    }

    const currentExclusions: TripExclusion[] = userPreferences?.trip_exclusions || [];

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

    // Upsert user preferences with updated exclusions
    const { error: upsertError } = await supabaseAdmin
      .from('user_preferences')
      .upsert({
        id: user.id,
        trip_exclusions: currentExclusions,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });

    if (upsertError) {
      console.error('Error upserting user preferences:', upsertError);
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

    // Get current trip exclusions from user preferences
    const { data: userPreferences, error: preferencesError } = await supabaseAdmin
      .from('user_preferences')
      .select('trip_exclusions')
      .eq('id', user.id)
      .maybeSingle();

    if (preferencesError) {
      console.error('Error fetching user preferences:', preferencesError);
      return errorResponse('Failed to fetch user preferences', 500);
    }

    const currentExclusions: TripExclusion[] = userPreferences?.trip_exclusions || [];

    // Find and remove the exclusion
    const updatedExclusions = currentExclusions.filter(ex => ex.id !== id);

    if (updatedExclusions.length === currentExclusions.length) {
      return errorResponse('Trip exclusion not found', 404);
    }

    // Upsert user preferences with updated exclusions
    const { error: upsertError } = await supabaseAdmin
      .from('user_preferences')
      .upsert({
        id: user.id,
        trip_exclusions: updatedExclusions,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });

    if (upsertError) {
      console.error('Error upserting user preferences:', upsertError);
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