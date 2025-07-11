import type { RequestHandler } from './$types';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { forwardGeocode } from '$lib/services/external/nominatim.service';
import type { GeocodedLocation } from '$lib/types/geocoding.types';
import { fromNominatimResponse } from '$lib/types/geocoding.types';

interface TripExclusion {
  id: string;
  name: string;
  value: string;
  exclusion_type: 'city' | 'address' | 'region';
  location?: GeocodedLocation;
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

    // Get user's profile to access metadata
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('metadata')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return errorResponse('Failed to fetch user profile', 500);
    }

    // Extract trip exclusions from metadata
    const exclusions: TripExclusion[] = profile?.metadata?.trip_exclusions || [];

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
    const { name, value, exclusion_type, location } = body;

    // Validate required fields
    if (!name || !value || !exclusion_type) {
      return errorResponse('Name, value, and exclusion_type are required', 400);
    }

    // Validate exclusion_type
    if (!['city', 'address', 'region'].includes(exclusion_type)) {
      return errorResponse('Invalid exclusion_type. Must be city, address, or region', 400);
    }

    // Geocode the value if coordinates are not provided
    let geocodedLocation = location;
    if (!location || !location.coordinates) {
      try {
        const geocodeResult = await forwardGeocode(value);
        if (geocodeResult) {
          geocodedLocation = fromNominatimResponse(geocodeResult);
        }
      } catch (error) {
        console.warn('Failed to geocode exclusion value:', error);
        // Continue without geocoding if it fails
      }
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get current user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('metadata')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      return errorResponse('Failed to fetch user profile', 500);
    }

    const currentMetadata = profile?.metadata || {};
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
      value,
      exclusion_type,
      location: geocodedLocation,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Add to exclusions array
    const updatedExclusions = [...currentExclusions, newExclusion];

    // Update user metadata
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        metadata: {
          ...currentMetadata,
          trip_exclusions: updatedExclusions
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

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
    const { id, name, value, exclusion_type, location } = body;

    // Validate required fields
    if (!id || !name || !value || !exclusion_type) {
      return errorResponse('ID, name, value, and exclusion_type are required', 400);
    }

    // Validate exclusion_type
    if (!['city', 'address', 'region'].includes(exclusion_type)) {
      return errorResponse('Invalid exclusion_type. Must be city, address, or region', 400);
    }

    // Geocode the value if coordinates are not provided
    let geocodedLocation = location;
    if (!location || !location.coordinates) {
      try {
        const geocodeResult = await forwardGeocode(value);
        if (geocodeResult) {
          geocodedLocation = fromNominatimResponse(geocodeResult);
        }
      } catch (error) {
        console.warn('Failed to geocode exclusion value:', error);
        // Continue without geocoding if it fails
      }
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get current user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('metadata')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      return errorResponse('Failed to fetch user profile', 500);
    }

    const currentMetadata = profile?.metadata || {};
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
      value,
      exclusion_type,
      location: geocodedLocation,
      updated_at: new Date().toISOString()
    };

    currentExclusions[exclusionIndex] = updatedExclusion;

    // Update user metadata
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        metadata: {
          ...currentMetadata,
          trip_exclusions: currentExclusions
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

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

    // Get current user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('metadata')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      return errorResponse('Failed to fetch user profile', 500);
    }

    const currentMetadata = profile?.metadata || {};
    const currentExclusions: TripExclusion[] = currentMetadata.trip_exclusions || [];

    // Find and remove the exclusion
    const updatedExclusions = currentExclusions.filter(ex => ex.id !== id);

    if (updatedExclusions.length === currentExclusions.length) {
      return errorResponse('Trip exclusion not found', 404);
    }

    // Update user metadata
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        metadata: {
          ...currentMetadata,
          trip_exclusions: updatedExclusions
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

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