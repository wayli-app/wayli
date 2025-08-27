import { supabase } from '$lib/supabase';

import type { SupabaseClient } from '@supabase/supabase-js';

export class StatisticsService {
	private supabase: SupabaseClient;

	constructor(supabaseClient?: SupabaseClient) {
		this.supabase = supabaseClient || supabase;
	}

	async getLocationsByDateRange(
		userId: string,
		startDate: string,
		endDate: string
	): Promise<unknown[]> {
		try {
			const { data: locations, error } = await this.supabase
				.from('tracker_data')
				.select('*')
				.eq('user_id', userId)
				.gte('tst', startDate)
				.lte('tst', endDate)
				.order('tst', { ascending: true });

			if (error) {
				console.error('❌ Error fetching locations by date range:', error);
				throw error;
			}

			return locations || [];
		} catch (error) {
			console.error('❌ Error fetching locations by date range:', error);
			throw error;
		}
	}

	async getStatistics(userId: string): Promise<{
		totalLocations: number;
		totalTrips: number;
		totalDistance: number;
		averageSpeed: number;
		topLocations: unknown[];
	}> {
		try {
			// Get total locations
			const { count: totalLocations } = await this.supabase
				.from('tracker_data')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId);

			// Get total trips
			const { count: totalTrips } = await this.supabase
				.from('trips')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId);

			// Get total distance (sum of all trip distances)
			const { data: trips } = await this.supabase
				.from('trips')
				.select('distance')
				.eq('user_id', userId);

			const totalDistance =
				trips?.reduce((sum: number, trip: { distance: number }) => {
					return sum + (trip.distance || 0);
				}, 0) || 0;

			// Get average speed (placeholder calculation)
			const averageSpeed = totalDistance > 0 ? totalDistance / (totalTrips || 1) : 0;

			// Get top locations (most visited)
			const { data: topLocations } = await this.supabase
				.from('tracker_data')
				.select('lat, lon, count')
				.eq('user_id', userId)
				.order('count', { ascending: false })
				.limit(10);

			return {
				totalLocations: totalLocations || 0,
				totalTrips: totalTrips || 0,
				totalDistance,
				averageSpeed,
				topLocations: topLocations || []
			};
		} catch (error) {
			console.error('❌ Error getting statistics:', error);
			throw error;
		}
	}
}
