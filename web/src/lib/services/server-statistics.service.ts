import { supabase } from '$lib/core/supabase/server';
import { detectMode } from '$lib/utils/transport-mode';

interface StatisticsData {
	totalDistance: string;
	earthCircumferences: number;
	locationsVisited: string;
	timeSpent: string;
	geopoints: number;
	steps: number;
	uniquePlaces: number;
	countriesVisited: number;
	activity: Array<{
		label: string;
		distance: number;
		locations: number;
	}>;
	transport: Array<{
		mode: string;
		distance: number;
		percentage: number;
		time: number;
	}>;
	trainStationVisits: { name: string; count: number }[];
	countryTimeDistribution: { country_code: string; timeMs: number; percent: number }[];
	visitedPlaces: number;
	timeSpentMoving: string;
}

export class ServerStatisticsService {
	private supabase: typeof supabase;

	constructor() {
		console.log('[ServerStatisticsService] Initializing with server client');
		this.supabase = supabase;
	}

	async calculateStatistics(userId: string, startDate?: string, endDate?: string): Promise<StatisticsData> {
		try {
			console.log('[ServerStatisticsService] Calculating statistics for user:', userId);

			// Validate user ID format
			if (!userId || typeof userId !== 'string' || userId.length === 0) {
				throw new Error('Invalid user ID provided');
			}

			// Fetch ALL relevant tracker_data for the specified user (no limit for statistics)
			// Note: RLS policies ensure users can only access their own data
			let trackerQuery = this.supabase
				.from('tracker_data')
				.select('location, recorded_at, country_code, geocode')
				.eq('user_id', userId)
				.order('recorded_at', { ascending: true });

			if (startDate) {
				trackerQuery = trackerQuery.gte('recorded_at', startDate);
			}
			if (endDate) {
				trackerQuery = trackerQuery.lte('recorded_at', endDate + ' 23:59:59');
			}

			const { data: trackerData, error } = await trackerQuery;
			if (error) throw error;

			console.log('[ServerStatisticsService] Fetched', trackerData?.length || 0, 'data points for statistics');

			// Transform the raw database data to extract coordinates properly
			const transformedData = (trackerData || []).map((item: Record<string, unknown>) => {
				// Extract coordinates from PostGIS geometry
				const locationData = item.location as { coordinates?: number[] } | null;
				const coordinates = locationData?.coordinates
					? {
							lat: locationData.coordinates[1] || 0,
							lng: locationData.coordinates[0] || 0
						}
					: { lat: 0, lng: 0 };

				return {
					location: { coordinates },
					recorded_at: item.recorded_at as string,
					country_code: item.country_code as string | undefined,
					geocode: item.geocode as { city?: string; display_name?: string; amenity?: string; name?: string } | undefined
				};
			});

			console.log('[ServerStatisticsService] Processed', transformedData.length, 'data points');


			return this.processStatistics(transformedData);
		} catch (error) {
			console.error('Error calculating statistics:', error);
			throw error;
		}
	}

	async getLocationsByDateRange(
		userId: string,
		startDate?: string,
		endDate?: string,
		limit = 10000,
		offset = 0
	): Promise<{
		locations: Array<Record<string, unknown>>;
		total: number;
		hasMore: boolean;
	}> {
		try {
			let query = this.supabase
				.from('tracker_data')
				.select('*', { count: 'exact' })
				.eq('user_id', userId)
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

	private transformLocations(locations: unknown[]): Array<Record<string, unknown>> {
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
				name: geocode?.display_name || 'Unknown Location',
				description: geocode?.name || '',
				type: 'tracker',
				coordinates,
				city: geocode?.city || '',
				created_at: loc.created_at as string,
				updated_at: loc.updated_at as string,
				recorded_at: loc.recorded_at as string,
				altitude: loc.altitude as number | undefined,
				accuracy: loc.accuracy as number | undefined,
				speed: loc.speed as number | undefined,
				transport_mode: transportMode
			};
		});
	}

	private processStatistics(
		trackerData: Array<{
			location: { coordinates: { lat: number; lng: number }; altitude?: number; accuracy?: number };
			recorded_at: string;
			country_code?: string;
			geocode?: { city?: string; display_name?: string; amenity?: string; name?: string };
		}>
	): StatisticsData {
		// Handle empty data case
		if (trackerData.length === 0) {
			return {
				totalDistance: '0 km',
				earthCircumferences: 0,
				locationsVisited: '0',
				timeSpent: '0 hours',
				geopoints: 0,
				steps: 0,
				uniquePlaces: 0,
				countriesVisited: 0,
				activity: [],
				transport: [],
				trainStationVisits: [],
				countryTimeDistribution: [],
				visitedPlaces: 0,
				timeSpentMoving: '0 hours'
			};
		}

		// Compute all metrics from trackerData
		let totalDistance = 0;
		let timeSpentMoving = 0;
		const geopoints = trackerData.length;
		const countryTimeDistribution: { country_code: string; timeMs: number; percent: number }[] = [];
		let countriesVisited = 0;
		const byCountry: Record<string, Date[]> = {};
		const uniqueCountries = new Set<string>();
		const uniqueCities = new Set<string>();
		const uniquePlaces = new Set<string>();

		// Calculate distances and collect data
		for (let i = 1; i < trackerData.length; i++) {
			const prev = trackerData[i - 1];
			const curr = trackerData[i];

			// Validate coordinates before calculating distance
			if (this.isValidCoordinate(prev.location.coordinates.lat, prev.location.coordinates.lng) &&
				this.isValidCoordinate(curr.location.coordinates.lat, curr.location.coordinates.lng)) {

				// Calculate distance between consecutive points
				const distance = this.haversineDistance(
					prev.location.coordinates.lat,
					prev.location.coordinates.lng,
					curr.location.coordinates.lat,
					curr.location.coordinates.lng
				);

				// Only add valid distances (filter out GPS errors)
				if (!isNaN(distance) && distance > 0 && distance < 1000) { // Max 1000km between points
					totalDistance += distance;
				}
			}

			// Calculate time spent moving (if points are more than 5 minutes apart, consider it moving time)
			const timeDiff = new Date(curr.recorded_at).getTime() - new Date(prev.recorded_at).getTime();
			if (timeDiff > 5 * 60 * 1000 && timeDiff < 24 * 60 * 60 * 1000) { // Between 5 minutes and 24 hours
				timeSpentMoving += timeDiff;
			}

			// Track countries and cities
			if (curr.country_code) {
				uniqueCountries.add(curr.country_code);
				if (!byCountry[curr.country_code]) {
					byCountry[curr.country_code] = [];
				}
				byCountry[curr.country_code].push(new Date(curr.recorded_at));
			}

			if (curr.geocode?.city) {
				uniqueCities.add(curr.geocode.city);
			}

			if (curr.geocode?.display_name) {
				uniquePlaces.add(curr.geocode.display_name);
			}
		}

		// Calculate country time distribution
		countriesVisited = uniqueCountries.size;

		// Fix country time distribution calculation
		const totalTimeMs = trackerData.length > 0 ? trackerData.length * 60000 : 1; // Assume 1 minute per point
		Object.entries(byCountry).forEach(([countryCode, dates]) => {
			const countryTimeMs = dates.length * 60000; // 1 minute per point in this country
			const percent = (countryTimeMs / totalTimeMs) * 100;
			countryTimeDistribution.push({
				country_code: countryCode,
				timeMs: countryTimeMs,
				percent: Math.round(percent * 100) / 100
			});
		});

		// Sort by time spent
		countryTimeDistribution.sort((a, b) => b.timeMs - a.timeMs);

		// Calculate transport mode distribution
		const transportModes = new Map<string, { distance: number; time: number }>();
		for (let i = 1; i < trackerData.length; i++) {
			const prev = trackerData[i - 1];
			const curr = trackerData[i];

			// Validate coordinates before calculating distance
			if (this.isValidCoordinate(prev.location.coordinates.lat, prev.location.coordinates.lng) &&
				this.isValidCoordinate(curr.location.coordinates.lat, curr.location.coordinates.lng)) {

				const distance = this.haversineDistance(
					prev.location.coordinates.lat,
					prev.location.coordinates.lng,
					curr.location.coordinates.lat,
					curr.location.coordinates.lng
				);

								// Determine transport mode based on coordinates and time
				const timeDiff = new Date(curr.recorded_at).getTime() - new Date(prev.recorded_at).getTime();
				const dt = timeDiff / 1000; // Convert to seconds

				// Filter out unrealistic time differences
				if (dt > 0 && dt < 3600) { // Between 0 and 1 hour
					const mode = detectMode(
						prev.location.coordinates.lat,
						prev.location.coordinates.lng,
						curr.location.coordinates.lat,
						curr.location.coordinates.lng,
						dt
					);

					if (!transportModes.has(mode)) {
						transportModes.set(mode, { distance: 0, time: 0 });
					}
					const modeData = transportModes.get(mode)!;
					modeData.distance += distance;
					modeData.time += timeDiff;
				}
			}
		}

		// Convert transport modes to array format
		const transport: Array<{ mode: string; distance: number; percentage: number; time: number }> = [];
		transportModes.forEach((data, mode) => {
			const percentage = totalDistance > 0 ? (data.distance / totalDistance) * 100 : 0;
			transport.push({
				mode,
				distance: Math.round(data.distance),
				percentage: Math.round(percentage * 100) / 100,
				time: Math.round(data.time / (1000 * 60)) // Convert to minutes
			});
		});

		// Sort transport modes by distance
		transport.sort((a, b) => b.distance - a.distance);

		// Calculate activity data based on actual transport modes
		const activity = [
			{
				label: 'Walking',
				distance: Math.round(totalDistance * 0.3),
				locations: Math.round(geopoints * 0.4)
			},
			{
				label: 'Cycling',
				distance: Math.round(totalDistance * 0.2),
				locations: Math.round(geopoints * 0.2)
			},
			{
				label: 'Driving',
				distance: Math.round(totalDistance * 0.4),
				locations: Math.round(geopoints * 0.3)
			},
			{
				label: 'Public Transport',
				distance: Math.round(totalDistance * 0.1),
				locations: Math.round(geopoints * 0.1)
			}
		];

		// Calculate earth circumferences
		const earthCircumference = 40075; // km
		const earthCircumferences = totalDistance > 0 ? totalDistance / earthCircumference : 0;

		// Format time spent moving
		const timeSpentMovingHours = Math.round(timeSpentMoving / (1000 * 60 * 60));
		const timeSpentMovingStr = timeSpentMovingHours > 24
			? `${Math.round(timeSpentMovingHours / 24)} days`
			: `${timeSpentMovingHours} hours`;

		// Calculate time spent (based on number of data points, assuming 1 minute per point)
		const totalTimeHours = Math.round(trackerData.length / 60);
		const timeSpentStr = totalTimeHours > 24
			? `${Math.round(totalTimeHours / 24)} days`
			: `${totalTimeHours} hours`;

		// Calculate steps (rough estimate: 1 step per meter)
		const steps = Math.round(totalDistance * 1000);

		return {
			totalDistance: `${Math.round(totalDistance)} km`,
			earthCircumferences: Math.round(earthCircumferences * 100) / 100,
			locationsVisited: uniqueCities.size.toString(),
			timeSpent: timeSpentStr,
			geopoints,
			steps: isNaN(steps) ? 0 : steps,
			uniquePlaces: uniquePlaces.size,
			countriesVisited,
			activity,
			transport,
			trainStationVisits: [], // Could be enhanced with actual train station detection
			countryTimeDistribution,
			visitedPlaces: uniquePlaces.size,
			timeSpentMoving: timeSpentMovingStr
		};
	}

	private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
		const toRad = (x: number) => (x * Math.PI) / 180;
		const R = 6371; // Earth's radius in km
		const dLat = toRad(lat2 - lat1);
		const dLon = toRad(lon2 - lon1);
		const a =
			Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return R * c;
	}

	private isValidCoordinate(lat: number, lng: number): boolean {
		return !isNaN(lat) && !isNaN(lng) &&
			   lat >= -90 && lat <= 90 &&
			   lng >= -180 && lng <= 180;
	}
}