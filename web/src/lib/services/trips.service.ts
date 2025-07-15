import { supabase } from '$lib/core/supabase/client';
import { TripLocationsService } from './trip-locations.service';
import { haversineDistance } from '../utils';

interface Trip {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  total_distance: number;
  point_count: number;
  labels?: string[];
  image_url?: string;
  created_at: string;
  updated_at: string;
}

interface CreateTripData {
  user_id: string; // Add user_id to the interface
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  labels?: string[];
  image_url?: string;
}

interface UpdateTripData extends Partial<CreateTripData> {
  id: string;
}

export class TripsService {
  private supabase: typeof supabase;

  constructor() {
    console.log('[TripsService] Initializing with authenticated client');
    // Use the authenticated client from the auth store
    this.supabase = supabase;
  }

  async getTrips(userId?: string): Promise<Trip[]> {
    try {
      console.log('[TripsService] Fetching trips for user:', userId);
      let query = this.supabase
        .from('trips')
        .select('*')
        .eq('status', 'active') // Only get active trips by default
        .order('created_at', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: trips, error } = await query;
      if (error) {
        console.error('[TripsService] Database error fetching trips:', error);
        throw error;
      }
      console.log('[TripsService] Successfully fetched trips:', trips?.length || 0);
      return (trips || []) as unknown as Trip[];
    } catch (error) {
      console.error('Error fetching trips:', error);
      throw error;
    }
  }

  async getTrip(id: string): Promise<Trip | null> {
    try {
      const { data: trip, error } = await this.supabase
        .from('trips')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      return trip as unknown as Trip;
    } catch (error) {
      console.error('Error fetching trip:', error);
      throw error;
    }
  }

  async createTrip(tripData: CreateTripData): Promise<Trip> {
    try {
      console.log('[TripsService] Creating trip with data:', tripData);
      const { data: trip, error } = await this.supabase
        .from('trips')
        .insert(tripData as unknown as Record<string, unknown>)
        .select()
        .single();

      if (error) {
        console.error('[TripsService] Database error:', error);
        throw error;
      }

      // --- Calculate geopoints and distance, then update metadata ---
      if (trip && trip.id) {
        await this.updateTripMetadata(trip.id);
      }

      console.log('[TripsService] Trip created successfully:', trip);
      return trip as unknown as Trip;
    } catch (error) {
      console.error('Error creating trip:', error);
      throw error;
    }
  }

  async updateTrip(tripData: UpdateTripData): Promise<Trip> {
    try {
      const { id, ...updateData } = tripData;
      const { data: trip, error } = await this.supabase
        .from('trips')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // --- Calculate geopoints and distance, then update metadata ---
      if (trip && trip.id) {
        await this.updateTripMetadata(trip.id);
      }

      return trip as unknown as Trip;
    } catch (error) {
      console.error('Error updating trip:', error);
      throw error;
    }
  }

  async deleteTrip(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('trips')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting trip:', error);
      throw error;
    }
  }

  async searchTrips(query: string): Promise<Trip[]> {
    try {
      const { data: trips, error } = await this.supabase
        .from('trips')
        .select('*')
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (trips || []) as unknown as Trip[];
    } catch (error) {
      console.error('Error searching trips:', error);
      throw error;
    }
  }

  // Helper to update trip metadata with geopoint count and distance
  async updateTripMetadata(tripId: string): Promise<void> {
    try {
      console.log('[updateTripMetadata] Start for tripId:', tripId);
      // Fetch the trip to get user_id
      const { data: trip, error: tripError } = await this.supabase
        .from('trips')
        .select('user_id')
        .eq('id', tripId)
        .single();
      console.log('[updateTripMetadata] Trip fetch result:', { trip, tripError });
      if (tripError || !trip) throw tripError || new Error('Trip not found');
      const userId = trip.user_id;
      const tripLocationsService = new TripLocationsService();
      const points = await tripLocationsService.getTripLocations(tripId, userId);
      console.log('[updateTripMetadata] Points fetched:', points.length, points);
      const pointCount = points.length;
      let distance = 0;
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1].location.coordinates;
        const curr = points[i].location.coordinates;
        distance += haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
      }
      console.log('[updateTripMetadata] Calculated:', { pointCount, distance });
      const { error: updateError } = await this.supabase
        .from('trips')
        .update({
          metadata: { point_count: pointCount, distance_traveled: distance }
        })
        .eq('id', tripId);
      console.log('[updateTripMetadata] Update result:', { updateError });
    } catch (error) {
      console.error('Error updating trip metadata:', error);
    }
  }
}