import { supabase } from '$lib/core/supabase/client';

interface TripLocation {
  id: string;
  user_id: string;
  tracker_type: string;
  device_id?: string;
  recorded_at: string;
  location: {
    coordinates: {
      lat: number;
      lng: number;
    };
  };
  country_code?: string;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  battery_level?: number;
  is_charging?: boolean;
  activity_type?: string;
  raw_data?: Record<string, unknown>;
  reverse_geocode?: {
    city?: string;
    display_name?: string;
    amenity?: string;
    name?: string;
  };
  created_at: string;
  updated_at: string;
  // Additional fields for compatibility with statistics page
  name?: string;
  description?: string;
  type?: 'tracker' | 'location' | 'poi';
  transport_mode?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  city?: string;
}

export class TripLocationsService {
  private supabase: typeof supabase;

  constructor() {
    console.log('[TripLocationsService] Initializing with authenticated client');
    // Use the authenticated client from the auth store
    this.supabase = supabase;
  }

  async getTripLocations(tripId: string): Promise<TripLocation[]> {
    try {
      const { data: locations, error } = await this.supabase
        .from('tracker_data')
        .select('*')
        .eq('trip_id', tripId)
        .order('recorded_at', { ascending: true });

      if (error) throw error;

      return this.transformLocations(locations || []);
    } catch (error) {
      console.error('Error fetching trip locations:', error);
      throw error;
    }
  }

  async getLocationsByDateRange(
    startDate?: string,
    endDate?: string,
    limit = 10000,
    offset = 0
  ): Promise<{
    locations: TripLocation[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      let query = this.supabase
        .from('tracker_data')
        .select('*', { count: 'exact' })
        .order('recorded_at', { ascending: true })
        .range(offset, offset + limit - 1);

      if (startDate) {
        query = query.gte('recorded_at', startDate);
      }
      if (endDate) {
        query = query.lte('recorded_at', endDate + ' 23:59:59');
      }

      const { data: locations, error, count } = await query;

      if (error) throw error;

      const hasMore = count ? offset + limit < count : false;
      const transformedLocations = this.transformLocations(locations || []);

      return {
        locations: transformedLocations,
        total: count || 0,
        hasMore
      };
    } catch (error) {
      console.error('Error fetching locations by date range:', error);
      throw error;
    }
  }

  private transformLocations(locations: unknown[]): TripLocation[] {
    return locations.map((location: any, index) => {
      // Extract coordinates from PostGIS geometry
      const coordinates = location.location ? {
        lat: location.location.coordinates?.[1] || 0,
        lng: location.location.coordinates?.[0] || 0
      } : { lat: 0, lng: 0 };

      // Determine transport mode from activity_type or speed
      let transportMode = 'unknown';
      if (location.activity_type) {
        transportMode = location.activity_type;
      } else if (location.speed) {
        const speedKmh = location.speed * 3.6; // Convert m/s to km/h
        if (speedKmh < 5) transportMode = 'walking';
        else if (speedKmh < 20) transportMode = 'cycling';
        else if (speedKmh < 100) transportMode = 'car';
        else transportMode = 'airplane';
      }

      return {
        id: `${location.user_id}_${location.recorded_at}_${index}`, // Generate unique ID
        user_id: location.user_id,
        tracker_type: location.tracker_type,
        device_id: location.device_id,
        recorded_at: location.recorded_at,
        location: { coordinates },
        country_code: location.country_code,
        altitude: location.altitude,
        accuracy: location.accuracy,
        speed: location.speed,
        heading: location.heading,
        battery_level: location.battery_level,
        is_charging: location.is_charging,
        activity_type: location.activity_type,
        raw_data: location.raw_data,
        reverse_geocode: location.reverse_geocode,
        created_at: location.created_at,
        updated_at: location.updated_at,
        // Additional fields for compatibility
        name: location.reverse_geocode?.display_name || location.reverse_geocode?.name || 'Unknown Location',
        description: location.reverse_geocode?.amenity || '',
        type: 'tracker' as const,
        transport_mode: transportMode,
        coordinates,
        city: location.reverse_geocode?.city || ''
      };
    });
  }
}