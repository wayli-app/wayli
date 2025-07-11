import { supabase } from '$lib/core/supabase/client';

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
      let query = this.supabase.from('trips').select('*').order('created_at', { ascending: false });
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
}