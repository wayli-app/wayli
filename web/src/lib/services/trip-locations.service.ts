import { supabase } from '$lib/core/supabase/worker';
import { getSupabaseConfig } from '$lib/core/config/node-environment';

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
	geocode?: {
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

	// Allow override for test/worker/Node.js
	static setSupabaseClient() {
		// TODO: Implement static client override
		console.log('[TripLocationsService] Static client override not yet implemented');
	}

	// Allow override for Node/worker: call this at startup in worker context
	static useWorkerClient() {
		// TODO: Implement static worker client override
		console.log('[TripLocationsService] Static worker client override not yet implemented');
	}

	// Instance method to switch to worker client
	useWorkerClient() {
		this.supabase = supabase;
		console.log('[TripLocationsService] Switched to worker Supabase client');
	}

	// Instance method to switch to node environment config
	async useNodeEnvironmentConfig() {
		const config = getSupabaseConfig();
		const { createClient } = await import('@supabase/supabase-js');
		this.supabase = createClient(config.url, config.serviceRoleKey);
		console.log('[TripLocationsService] Switched to Node environment Supabase client');
	}

	async getTripLocations(tripId: string, userId?: string): Promise<TripLocation[]> {
		try {
			// First, get the trip to get its date range
			const { data: trip, error: tripError } = await this.supabase
				.from('trips')
				.select('start_date, end_date, user_id')
				.eq('id', tripId)
				.single();

			if (tripError || !trip) {
				console.error('Error fetching trip:', tripError);
				throw tripError || new Error('Trip not found');
			}

			// Use the trip's user_id if userId is not provided
			const targetUserId = userId || trip.user_id;

			// Fetch tracker data for the user within the trip's date range
			const { data: locations, error } = await this.supabase
				.from('tracker_data')
				.select('*')
				.eq('user_id', targetUserId)
				.gte('recorded_at', `${trip.start_date}T00:00:00Z`)
				.lte('recorded_at', `${trip.end_date}T23:59:59Z`)
				.order('recorded_at', { ascending: true });

			if (error) throw error;

			console.log(
				`[getTripLocations] Found ${locations?.length || 0} points for trip ${tripId} (${trip.start_date} to ${trip.end_date})`
			);
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
		return locations.map((location: unknown, index) => {
			const loc = location as Record<string, unknown>;

			// Extract coordinates from PostGIS geometry
			const locationData = loc.location as { coordinates?: number[] } | null;
			const coordinates = locationData?.coordinates
				? {
						lat: locationData.coordinates[1] || 0,
						lng: locationData.coordinates[0] || 0
					}
				: { lat: 0, lng: 0 };

			// Determine transport mode from activity_type or speed
			let transportMode = 'unknown';
			if (loc.activity_type) {
				transportMode = loc.activity_type as string;
			} else if (loc.speed) {
				const speedKmh = (loc.speed as number) * 3.6; // Convert m/s to km/h
				if (speedKmh < 5) transportMode = 'walking';
				else if (speedKmh < 20) transportMode = 'cycling';
				else if (speedKmh < 100) transportMode = 'car';
				else transportMode = 'airplane';
			}

			const geocode = loc.geocode as {
				display_name?: string;
				name?: string;
				amenity?: string;
				city?: string;
				error?: boolean;
			} | null;

			return {
				id: `${loc.user_id}_${loc.recorded_at}_${index}`, // Generate unique ID
				user_id: loc.user_id as string,
				tracker_type: loc.tracker_type as string,
				device_id: loc.device_id as string | undefined,
				recorded_at: loc.recorded_at as string,
				location: { coordinates },
				country_code: loc.country_code as string | undefined,
				altitude: loc.altitude as number | undefined,
				accuracy: loc.accuracy as number | undefined,
				speed: loc.speed as number | undefined,
				heading: loc.heading as number | undefined,
				battery_level: loc.battery_level as number | undefined,
				is_charging: loc.is_charging as boolean | undefined,
				activity_type: loc.activity_type as string | undefined,
				raw_data: loc.raw_data as Record<string, unknown> | undefined,
				geocode: geocode || undefined,
				created_at: loc.created_at as string,
				updated_at: loc.updated_at as string,
				// Additional fields for compatibility
				name:
					geocode && typeof geocode === 'object' && 'error' in geocode
						? 'Error occurred during geocoding'
						: geocode?.display_name || geocode?.name || 'Unknown Location',
				description: geocode?.amenity || '',
				type: 'tracker' as const,
				transport_mode: transportMode,
				coordinates,
				city:
					geocode && typeof geocode === 'object' && 'error' in geocode ? '' : geocode?.city || ''
			};
		});
	}
}
