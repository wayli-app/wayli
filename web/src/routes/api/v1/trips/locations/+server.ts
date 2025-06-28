import type { RequestHandler } from '@sveltejs/kit';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/utils/api/response';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { detectMode, haversine } from '$lib/utils/transport-mode';
import type { ModeContext } from '$lib/utils/transport-mode';

interface LocationData {
  id: string;
  name?: string;
  description?: string;
  location: string;
  address?: string;
  created_at: string;
  updated_at?: string;
  type: 'location' | 'poi' | 'tracker';
  coordinates: { lat: number; lng: number } | null;
  category?: string;
  rating?: number;
  tracker_type?: string;
  device_id?: string;
  recorded_at?: string;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  battery_level?: number;
  is_charging?: boolean;
  activity_type?: string;
  transport_mode?: string;
}

export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    // Get current user from session
    const session = await locals.getSession();
    if (!session) {
      console.log('API: Unauthorized request - no session');
      return errorResponse('User not authenticated', 401);
    }

    const user = session.user;
    const searchParams = url.searchParams;

    // Parse query parameters
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '5000');
    const offset = parseInt(searchParams.get('offset') || '0');
    const includeTrackerData = searchParams.get('includeTrackerData') === 'true';
    const includeLocations = searchParams.get('includeLocations') !== 'false';
    const includePOIs = searchParams.get('includePOIs') !== 'false';

    // Log the incoming request
    console.log('=== API REQUEST LOG ===');
    console.log('User ID:', user.id);
    console.log('User Email:', user.email);
    console.log('Request URL:', url.toString());
    console.log('Query Parameters:');
    console.log('  - startDate:', startDate);
    console.log('  - endDate:', endDate);
    console.log('  - limit:', limit);
    console.log('  - offset:', offset);
    console.log('  - includeTrackerData:', includeTrackerData);
    console.log('  - includeLocations:', includeLocations);
    console.log('  - includePOIs:', includePOIs);
    console.log('======================');

    // Validate parameters
    if (limit > 10000) {
      console.log('API: Validation error - limit too high');
      return validationErrorResponse('Limit cannot exceed 10000');
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const results: LocationData[] = [];
    let totalCount = 0;

    // Fetch locations if requested
    if (includeLocations) {
      console.log('API: Fetching locations...');
      let query = supabaseAdmin
        .from('locations')
        .select('id, name, description, location, address, created_at, updated_at')
        .eq('user_id', user.id);

      if (startDate) {
        console.log('API: Adding startDate filter for locations:', startDate);
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        console.log('API: Adding endDate filter for locations:', endDate);
        query = query.lte('created_at', `${endDate} 23:59:59`);
      }

      const { data: locations, error: locationsError } = await query
        .order('created_at', { ascending: false });

      if (locationsError) {
        console.error('API: Error fetching locations:', locationsError);
      } else {
        console.log('API: Locations found:', locations?.length || 0);
        const processedLocations = locations?.map(location => ({
          ...location,
          type: 'location' as const,
          coordinates: extractCoordinates(location.location)
        })) || [];
        results.push(...processedLocations);
      }
    }

    // Fetch points of interest if requested
    if (includePOIs) {
      console.log('API: Fetching POIs...');
      let query = supabaseAdmin
        .from('points_of_interest')
        .select('id, name, description, location, address, category, rating, created_at, updated_at')
        .eq('user_id', user.id);

      if (startDate) {
        console.log('API: Adding startDate filter for POIs:', startDate);
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        console.log('API: Adding endDate filter for POIs:', endDate);
        query = query.lte('created_at', `${endDate} 23:59:59`);
      }

      const { data: pois, error: poisError } = await query
        .order('created_at', { ascending: false });

      if (poisError) {
        console.error('API: Error fetching POIs:', poisError);
      } else {
        console.log('API: POIs found:', pois?.length || 0);
        const processedPOIs = pois?.map(poi => ({
          ...poi,
          type: 'poi' as const,
          coordinates: extractCoordinates(poi.location)
        })) || [];
        results.push(...processedPOIs);
      }
    }

    // Fetch tracker data if requested - with optimized query
    if (includeTrackerData) {
      console.log('API: Fetching tracker data...');

      // First, get the total count for pagination
      let countQuery = supabaseAdmin
        .from('tracker_data')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (startDate) {
        countQuery = countQuery.gte('recorded_at', startDate);
      }
      if (endDate) {
        countQuery = countQuery.lte('recorded_at', `${endDate} 23:59:59`);
      }

      const { count: trackerCount, error: countError } = await countQuery;

      if (countError) {
        console.error('API: Error counting tracker data:', countError);
      } else {
        console.log('API: Total tracker data points available:', trackerCount || 0);
        totalCount += trackerCount || 0;
      }

      // Fetch all tracker data for transport mode calculation (without pagination)
      let allTrackerQuery = supabaseAdmin
        .from('tracker_data')
        .select('user_id, tracker_type, device_id, recorded_at, location, altitude, accuracy, speed, heading, battery_level, is_charging, activity_type, created_at, reverse_geocode')
        .eq('user_id', user.id);

      if (startDate) {
        console.log('API: Adding startDate filter for tracker data:', startDate);
        allTrackerQuery = allTrackerQuery.gte('recorded_at', startDate);
      }
      if (endDate) {
        console.log('API: Adding endDate filter for tracker data:', endDate);
        allTrackerQuery = allTrackerQuery.lte('recorded_at', `${endDate} 23:59:59`);
      }

      const { data: allTrackerData, error: allTrackerError } = await allTrackerQuery
        .order('recorded_at', { ascending: true });

      if (allTrackerError) {
        console.error('API: Error fetching all tracker data:', allTrackerError);
      } else {
        console.log('API: All tracker data points fetched for mode calculation:', allTrackerData?.length || 0);

        // Calculate transport modes for all tracker points
        const trackerDataWithModes = allTrackerData?.map((track, index) => {
          let transportMode = 'unknown';
          let isInTrainJourney = false;
          let atTrainType = false;

          // Check if this point is at a railway location based on extended train type logic
          if (track.reverse_geocode) {
            try {
              const geocode = typeof track.reverse_geocode === 'string'
                ? JSON.parse(track.reverse_geocode)
                : track.reverse_geocode;

              if (
                (geocode && geocode.type === 'railway_station') ||
                (geocode && geocode.class === 'railway') ||
                (geocode && geocode.type === 'platform') ||
                (geocode && geocode.addresstype === 'railway')
              ) {
                atTrainType = true;
              }
            } catch { /* Ignore parsing errors */ }
          }

          // Calculate speed if possible
          let speedKmh = 0;
          if (index > 0) {
            const prevTrack = allTrackerData[index - 1];
            const prevCoords = extractCoordinates(prevTrack.location);
            const currCoords = extractCoordinates(track.location);
            if (prevCoords && currCoords) {
              const prevTime = new Date(prevTrack.recorded_at).getTime();
              const currTime = new Date(track.recorded_at).getTime();
              const dt = (currTime - prevTime) / 1000; // seconds
              if (dt > 0) {
                const distance = haversine(prevCoords.lat, prevCoords.lng, currCoords.lat, currCoords.lng);
                speedKmh = (distance / dt) * 3.6;
              }
            }
          }

          // Start train journey if at train type and speed is in train range
          if (atTrainType && speedKmh > 30 && speedKmh < 300) {
            transportMode = 'train';
            isInTrainJourney = true;
          }

          // If not determined by above, calculate based on speed and context
          if (transportMode === 'unknown' && index > 0) {
            const prevTrack = allTrackerData[index - 1];
            const prevCoords = extractCoordinates(prevTrack.location);
            const currCoords = extractCoordinates(track.location);

            if (prevCoords && currCoords) {
              // Calculate time difference in seconds
              const prevTime = new Date(prevTrack.recorded_at).getTime();
              const currTime = new Date(track.recorded_at).getTime();
              const dt = (currTime - prevTime) / 1000; // seconds

              if (dt > 0) {
                // Calculate mode using the same logic as statistics API
                const modeContext: ModeContext = {};
                transportMode = detectMode(
                  prevCoords.lat, prevCoords.lng,
                  currCoords.lat, currCoords.lng,
                  dt,
                  modeContext
                );
              }
            }
          }

          return {
            ...track,
            transport_mode: transportMode,
            isInTrainJourney,
            atTrainType
          };
        }) || [];

        // Post-process to handle train journey continuity
        let currentTrainJourney = false;
        const finalTrackerData = trackerDataWithModes.map((track, index) => {
          let finalTransportMode = track.transport_mode;

          // Start train journey if at train type and speed is in train range
          if (track.atTrainType && track.transport_mode === 'train') {
            currentTrainJourney = true;
            finalTransportMode = 'train';
          }
          // Continue train journey if already started and speed is in train range (now 30-120 km/h)
          else if (currentTrainJourney && index > 0) {
            const prevTrack = trackerDataWithModes[index - 1];
            const prevCoords = extractCoordinates(prevTrack.location);
            const currCoords = extractCoordinates(track.location);
            if (prevCoords && currCoords) {
              const prevTime = new Date(prevTrack.recorded_at).getTime();
              const currTime = new Date(track.recorded_at).getTime();
              const dt = (currTime - prevTime) / 1000; // seconds
              let speedKmh = 0;
              if (dt > 0) {
                const distance = haversine(prevCoords.lat, prevCoords.lng, currCoords.lat, currCoords.lng);
                speedKmh = (distance / dt) * 3.6;
              }
              // Continue train journey if speed is in train range (30-120) or still at train type
              if ((speedKmh > 30 && speedKmh < 120) || track.atTrainType) {
                finalTransportMode = 'train';
              } else {
                // End train journey if speed drops below 30 and not at train type
                if (!track.atTrainType && speedKmh <= 30) {
                  currentTrainJourney = false;
                  // Fallback to regular detection
                  const modeContext: ModeContext = {};
                  finalTransportMode = detectMode(
                    prevCoords.lat, prevCoords.lng,
                    currCoords.lat, currCoords.lng,
                    dt,
                    modeContext
                  );
                } else {
                  // Still at train type, keep as train
                  finalTransportMode = 'train';
                }
              }
            }
          } else {
            // Not in a train journey
            currentTrainJourney = false;
          }

          return {
            ...track,
            transport_mode: finalTransportMode
          };
        });

        // Apply pagination to the processed data
        const paginatedTrackerData = finalTrackerData
          .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()) // Sort by most recent first
          .slice(offset, offset + limit);

        console.log('API: Tracker data points after pagination:', paginatedTrackerData.length);

        const processedTrackerData = paginatedTrackerData.map(track => ({
          id: `${track.user_id}-${track.recorded_at}`, // Create a composite ID for tracker data
          name: `Tracker Point`,
          description: `Activity: ${track.activity_type || 'Unknown'}`,
          location: track.location,
          created_at: track.created_at,
          type: 'tracker' as const,
          coordinates: extractCoordinates(track.location),
          tracker_type: track.tracker_type,
          device_id: track.device_id,
          recorded_at: track.recorded_at,
          altitude: track.altitude,
          accuracy: track.accuracy,
          speed: track.speed,
          heading: track.heading,
          battery_level: track.battery_level,
          is_charging: track.is_charging,
          activity_type: track.activity_type,
          transport_mode: track.transport_mode
        }));

        results.push(...processedTrackerData);
      }
    }

    // Sort all results by date (most recent first)
    results.sort((a, b) => {
      const dateA = new Date(a.created_at || a.recorded_at || '').getTime();
      const dateB = new Date(b.created_at || b.recorded_at || '').getTime();
      return dateB - dateA;
    });

    // Calculate hasMore based on total count
    const hasMore = offset + limit < totalCount;

    console.log('=== API RESPONSE SUMMARY ===');
    console.log('Total results:', results.length);
    console.log('Total count from database:', totalCount);
    console.log('Offset:', offset);
    console.log('Limit:', limit);
    console.log('Returning:', results.length);
    console.log('Has more:', hasMore);
    console.log('Breakdown by type:');
    console.log('  - Locations:', results.filter(r => r.type === 'location').length);
    console.log('  - POIs:', results.filter(r => r.type === 'poi').length);
    console.log('  - Tracker data:', results.filter(r => r.type === 'tracker').length);
    console.log('============================');

    return successResponse({
      locations: results,
      total: totalCount,
      count: results.length,
      hasMore: hasMore
    });
  } catch (error) {
    console.error('API: Error fetching trip locations:', error);
    return errorResponse(error);
  }
};

// Helper function to extract coordinates from PostGIS POINT
function extractCoordinates(location: unknown): { lat: number; lng: number } | null {
  try {
    if (!location) {
      return null;
    }

    // If it's already an object with lat/lng
    if (typeof location === 'object' && location && 'lat' in location && 'lng' in location) {
      const loc = location as { lat: number | string; lng: number | string };
      return {
        lat: parseFloat(String(loc.lat)),
        lng: parseFloat(String(loc.lng))
      };
    }

    // If it's an object with latitude/longitude
    if (typeof location === 'object' && location && 'latitude' in location && 'longitude' in location) {
      const loc = location as { latitude: number | string; longitude: number | string };
      return {
        lat: parseFloat(String(loc.latitude)),
        lng: parseFloat(String(loc.longitude))
      };
    }

    // Handle GeoJSON format (which is what we're actually getting)
    if (typeof location === 'object' && location && 'type' in location && 'coordinates' in location) {
      const geoJson = location as { type: string; coordinates: number[] };
      if (geoJson.type === 'Point' && Array.isArray(geoJson.coordinates) && geoJson.coordinates.length >= 2) {
        // GeoJSON coordinates are [longitude, latitude]
        return {
          lng: parseFloat(String(geoJson.coordinates[0])),
          lat: parseFloat(String(geoJson.coordinates[1]))
        };
      }
    }

    // If it's a string, try to parse as PostGIS POINT
    if (typeof location === 'string') {
      const match = location.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
      if (match) {
        return {
          lng: parseFloat(match[1]),
          lat: parseFloat(match[2])
        };
      }

      // Try to parse as JSON
      try {
        const parsed = JSON.parse(location);
        if (parsed.lat && parsed.lng) {
          return {
            lat: parseFloat(parsed.lat),
            lng: parseFloat(parsed.lng)
          };
        }
        if (parsed.latitude && parsed.longitude) {
          return {
            lat: parseFloat(parsed.latitude),
            lng: parseFloat(parsed.longitude)
          };
        }
        // Handle GeoJSON in string format
        if (parsed.type === 'Point' && Array.isArray(parsed.coordinates) && parsed.coordinates.length >= 2) {
          return {
            lng: parseFloat(String(parsed.coordinates[0])),
            lat: parseFloat(String(parsed.coordinates[1]))
          };
        }
      } catch {
        // Not JSON, continue
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting coordinates:', error, 'from location:', location);
    return null;
  }
}