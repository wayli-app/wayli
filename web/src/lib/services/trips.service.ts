import type { SupabaseClient } from '@supabase/supabase-js';

interface Trip {
	id: string;
	user_id: string;
	title: string;
	description?: string;
	start_date: string;
	end_date: string;
	metadata?: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

interface CreateTripData {
	title: string;
	description?: string;
	start_date: string;
	end_date: string;
	metadata?: Record<string, unknown>;
}

interface UpdateTripData extends Partial<CreateTripData> {
	id: string;
}

export class TripsService {
	private supabase: SupabaseClient;

	constructor(client: SupabaseClient) {
		this.supabase = client;
	}

	private async getCurrentUserId(): Promise<string> {
		const { data: { session } } = await this.supabase.auth.getSession();
		if (!session?.user?.id) {
			throw new Error('User not authenticated');
		}
		return session.user.id;
	}

	private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
		const R = 6371; // Earth's radius in kilometers
		const dLat = (lat2 - lat1) * Math.PI / 180;
		const dLon = (lon2 - lon1) * Math.PI / 180;
		const a =
			Math.sin(dLat/2) * Math.sin(dLat/2) +
			Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
			Math.sin(dLon/2) * Math.sin(dLon/2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
		return R * c;
	}

	async getTrips(userId?: string): Promise<Trip[]> {
		try {
			// Get current user if userId is not provided
			let currentUserId = userId;
			if (!currentUserId) {
				const { data: { user }, error: userError } = await this.supabase.auth.getUser();
				if (userError || !user) {
					throw new Error('User not authenticated');
				}
				currentUserId = user.id;
			}

			const query = this.supabase
				.from('trips')
				.select('*')
				.eq('user_id', currentUserId)
				.order('created_at', { ascending: false });

			const { data: trips, error } = await query;
			if (error) {
				console.error('❌ [TripsService] Database error fetching trips:', error);
				throw error;
			}
			return (trips || []) as unknown as Trip[];
		} catch (error) {
			console.error('❌ Error fetching trips:', error);
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
			console.error('❌ Error fetching trip:', error);
			throw error;
		}
	}

	async createTrip(tripData: CreateTripData): Promise<Trip> {
		try {
			const insertData = {
				...tripData,
				user_id: await this.getCurrentUserId()
			};

			const { data: trip, error } = await this.supabase
				.from('trips')
				.insert(insertData)
				.select()
				.single();

			if (error) {
				console.error('❌ [TripsService] Database error:', error);
				throw error;
			}

			return trip as unknown as Trip;
		} catch (error) {
			console.error('❌ Error creating trip:', error);
			throw error;
		}
	}

	async updateTrip(tripData: UpdateTripData): Promise<Trip> {
		try {
			const { id, ...updateData } = tripData;
			const updatePayload = {
				...updateData,
				metadata: updateData.metadata ?? {},
			};
			const { data: trip, error } = await this.supabase
				.from('trips')
				.update(updatePayload)
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
			console.error('❌ Error updating trip:', error);
			throw error;
		}
	}

	async deleteTrip(id: string): Promise<void> {
		try {
			const { error } = await this.supabase.from('trips').delete().eq('id', id);

			if (error) throw error;
		} catch (error) {
			console.error('❌ Error deleting trip:', error);
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
			console.error('❌ Error searching trips:', error);
			throw error;
		}
	}

	// Helper to update trip metadata with geopoint count and distance
	async updateTripMetadata(tripId: string): Promise<void> {
		try {
			// Fetch the trip to get user_id and date range
			const { data: trip, error: tripError } = await this.supabase
				.from('trips')
				.select('user_id, start_date, end_date')
				.eq('id', tripId)
				.single();

			if (tripError || !trip) throw tripError || new Error('Trip not found');

			// Use raw SQL to extract coordinates from PostGIS location column
			const { data: points, error: pointsError } = await this.supabase
				.rpc('get_user_tracking_data', {
					user_uuid: trip.user_id,
					start_date: trip.start_date,
					end_date: trip.end_date
				});

			if (pointsError) throw pointsError;

			const pointCount = points?.length || 0;
			let distance = 0;

			// Calculate total distance using pre-calculated distance column if available
			if (points && points.length > 0) {
				// Check if points have distance column (from updated get_user_tracking_data function)
				const hasDistanceColumn = points.some(point => typeof point.distance === 'number');

				if (hasDistanceColumn) {
					// Use pre-calculated distances from database
					distance = points.reduce((total, point) => {
						const pointDistance = typeof point.distance === 'number' && isFinite(point.distance) ? point.distance : 0;
						return total + (pointDistance / 1000); // Convert meters to kilometers
					}, 0);
				} else {
					// Fallback to manual calculation for backward compatibility
					for (let i = 1; i < points.length; i++) {
						const prev = points[i - 1];
						const curr = points[i];
						distance += this.calculateDistance(
							prev.lat,
							prev.lon,
							curr.lat,
							curr.lon
						);
					}
				}
			}

			// Get existing metadata to preserve image_attribution and other fields
			const { data: existingTrip, error: fetchError } = await this.supabase
				.from('trips')
				.select('metadata')
				.eq('id', tripId)
				.single();

			if (fetchError) {
				console.error('❌ [updateTripMetadata] Error fetching existing metadata:', fetchError);
				throw fetchError;
			}

			// Preserve existing metadata and update with new values
			const existingMetadata = existingTrip?.metadata || {};
			const updatedMetadata = {
				...existingMetadata,
				point_count: pointCount,
				distance: Math.round(distance * 100) / 100 // Round to 2 decimal places
			};

			const { error: updateError } = await this.supabase
				.from('trips')
				.update({
					metadata: updatedMetadata
				})
				.eq('id', tripId);

			if (updateError) {
				console.error('❌ [updateTripMetadata] Error updating trip:', updateError);
				throw updateError;
			}
		} catch (error) {
			console.error('❌ Error updating trip metadata:', error);
			throw error;
		}
	}
}
