// web/src/lib/services/trip-detection.service.ts
import { createWorkerClient } from '../../worker/client';
import { haversineDistance } from '../utils/geocoding-utils';
import { checkJobCancellation } from '../utils/job-cancellation';
import { translateServer, getPluralSuffix } from '../utils/server-translations';

import type {
	TripExclusion,
	TrackerDataPoint,
	TrackingDataPoint,
	HomeAddress,
	DetectedTrip
} from '../types/trip-generation.types';

export interface TripDetectionConfig {
	minTripDurationHours: number;
	minDataPointsPerDay: number;
	homeRadiusKm: number;
	clusteringRadiusMeters: number;
	minAwayDurationHours: number; // Minimum time user must be away to start a trip
	minStatusConfirmationPoints: number; // Minimum points to confirm home/away status
	chunkSize: number; // Number of points to process in each chunk
}

export interface DateRange {
	startDate?: string; // Optional - undefined means start from first data point
	endDate?: string; // Optional - undefined means continue until last data point
}

export interface VisitedLocation {
	cityName: string;
	countryName: string;
	countryCode: string;
	stateName?: string;
	durationHours: number;
	dataPoints: number;
	coordinates: {
		lat: number;
		lng: number;
	};
}

export interface TripState {
	homePoints: TrackerDataPoint[]; // Accumulated home points for status confirmation
	awayPoints: TrackerDataPoint[]; // Accumulated away points for status confirmation
	currentTripStart: string | null; // Current trip start timestamp
	currentTripEnd: string | null; // Current trip end timestamp
	currentTripLocations: VisitedLocation[];
	lastHomePoint: TrackerDataPoint | null; // Last confirmed home point
	lastAwayPoint: TrackerDataPoint | null; // Last confirmed away point
	tripDataPoints: number; // Total number of data points processed for this trip
}

const DEFAULT_CONFIG: TripDetectionConfig = {
	minTripDurationHours: 24,
	minDataPointsPerDay: 3,
	homeRadiusKm: 10,
	clusteringRadiusMeters: 1000,
	minAwayDurationHours: 24, // User must be away for at least 24 hours to start a trip
	minStatusConfirmationPoints: 10, // Need 10 points to confirm home/away status
	chunkSize: 1000 // Process 1000 points at a time
};



export class TripDetectionService {
	private supabase = createWorkerClient();

	/**
	 * Main entry point for trip detection
	 */
	async detectTrips(
		userId: string,
		config: Partial<TripDetectionConfig> = {},
		jobId?: string,
		progressCallback?: (progress: number, message: string) => void,
		providedDateRanges?: DateRange[]
	): Promise<DetectedTrip[]> {
		const finalConfig = { ...DEFAULT_CONFIG, ...config };

		console.log('🚀 Starting trip detection for user:', userId);
		console.log('⚙️ Configuration:', finalConfig);

		// Step 1: Determine date ranges to process
		// If no date ranges provided, determine them based on available data
		let dateRanges: DateRange[];
		if (providedDateRanges && providedDateRanges.length > 0) {
			dateRanges = providedDateRanges;
		} else {
			// Extract start/end dates from the first and last provided ranges if they exist
			const firstRange = providedDateRanges?.[0];
			const lastRange = providedDateRanges?.[providedDateRanges.length - 1];

			dateRanges = await this.determineDateRanges(
				userId,
				firstRange?.startDate,
				lastRange?.endDate
			);
		}
		console.log(`📅 Found ${dateRanges.length} date ranges to process`);

		// Log the date ranges being processed
		dateRanges.forEach((range, index) => {
			console.log(`📅 Range ${index + 1}: ${range.startDate} to ${range.endDate}`);
		});

		if (progressCallback) {
			progressCallback(10, `Found ${dateRanges.length} date ranges to process`);
		}

		// Step 2: Get user's home address, trip exclusions, and language preference
		const { homeAddress, tripExclusions, language } = await this.getUserSettings(userId);
		console.log('🏠 Home address:', homeAddress?.display_name || 'Not set');
		console.log('🚫 Trip exclusions:', tripExclusions.length);

		// Step 3: Process each date range with chunk processing
		const allTrips: DetectedTrip[] = [];
		let processedRanges = 0;

		for (const dateRange of dateRanges) {
			// Check for cancellation before processing each date range
			await checkJobCancellation(jobId);

			if (progressCallback) {
				const progress = 10 + Math.round((processedRanges / dateRanges.length) * 80);
				progressCallback(
					progress,
					`Processing date range: ${dateRange.startDate} to ${dateRange.endDate}`
				);
			}

			console.log(`🔄 Processing date range: ${dateRange.startDate} to ${dateRange.endDate}`);

			const trips = await this.processDateRangeInChunks(
				userId,
				dateRange,
				homeAddress,
				tripExclusions,
				finalConfig,
				language,
				progressCallback,
				jobId
			);

			allTrips.push(...trips);
			processedRanges++;

			console.log(
				`✅ Completed date range ${processedRanges}/${dateRanges.length}, found ${trips.length} trips`
			);
		}

		if (progressCallback) {
			progressCallback(100, `Trip detection completed. Found ${allTrips.length} total trips.`);
		}

		console.log(`🎉 Trip detection completed! Found ${allTrips.length} total trips.`);
		return allTrips;
	}

	/**
	 * Process a date range in chunks of points instead of day by day
	 */
	private async processDateRangeInChunks(
		userId: string,
		dateRange: DateRange,
		homeAddress: HomeAddress | null,
		tripExclusions: TripExclusion[],
		config: TripDetectionConfig,
		language: string,
		progressCallback?: (progress: number, message: string) => void,
		jobId?: string
	): Promise<DetectedTrip[]> {
		const trips: DetectedTrip[] = [];
		let currentOffset = 0;
		let hasMoreData = true;
		let tripState: TripState = {
			homePoints: [],
			awayPoints: [],
			currentTripStart: null,
			currentTripEnd: null,
			currentTripLocations: [],
			lastHomePoint: null,
			lastAwayPoint: null,
			tripDataPoints: 0
		};

		console.log(`🔄 Processing date range in chunks of ${config.chunkSize} points`);

		while (hasMoreData) {
			// Check for cancellation
			await checkJobCancellation(jobId);

			// Fetch chunk of data points
			const dataPoints = await this.fetchDataChunk(
				userId,
				dateRange.startDate,
				dateRange.endDate,
				config.chunkSize,
				currentOffset
			);

			if (dataPoints.length === 0) {
				console.log('📭 No more data points to process');
				hasMoreData = false;
				break;
			}

			console.log(`📊 Processing chunk: ${dataPoints.length} points (offset: ${currentOffset})`);

			// Process this chunk and update trip state
			const { newTrips, updatedTripState, shouldContinue } = await this.processDataChunk(
				dataPoints,
				tripState,
				homeAddress,
				tripExclusions,
				config,
				language,
				dateRange
			);

			// Add new trips
			trips.push(...newTrips);

			// Update trip state for next chunk
			tripState = updatedTripState;

			// Check if we should continue processing
			if (!shouldContinue) {
				console.log('🛑 Stopping chunk processing (trip completed or no more data needed)');
				hasMoreData = false;
				break;
			}

			// Move to next chunk
			currentOffset += dataPoints.length;

			// Update progress
			if (progressCallback) {
				const chunkProgress = Math.min((currentOffset / 10000) * 100, 90); // Estimate progress
				progressCallback(
					chunkProgress,
					`Processed ${currentOffset} points, found ${trips.length} trips`
				);
			}

			// Add small delay to prevent overwhelming the system
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		// Finalize any incomplete trip
		if (tripState.currentTripStart && tripState.currentTripEnd) {
			const finalTrip = await this.finalizeTrip(
				tripState,
				homeAddress,
				tripExclusions,
				config,
				language
			);
			if (finalTrip) {
				trips.push(finalTrip);
			}
		}

		console.log(`✅ Completed processing date range. Found ${trips.length} trips.`);
		return trips;
	}

	/**
	 * Fetch a chunk of data points for the given date range
	 * Handles undefined dates by fetching all data
	 */
	private async fetchDataChunk(
		userId: string,
		startDate: string | undefined,
		endDate: string | undefined,
		chunkSize: number,
		offset: number
	): Promise<TrackerDataPoint[]> {
		try {
			let query = this.supabase
				.from('tracker_data')
				.select('*')
				.eq('user_id', userId)
				.order('recorded_at', { ascending: true });

			// Apply date filters only if dates are provided
			if (startDate) {
				query = query.gte('recorded_at', startDate);
			}
			if (endDate) {
				query = query.lte('recorded_at', endDate);
			}

			const { data, error } = await query.range(offset, offset + chunkSize - 1);

			if (error) {
				console.error('❌ Error fetching data chunk:', error);
				return [];
			}

			return data || [];
		} catch (error) {
			console.error('❌ Exception fetching data chunk:', error);
			return [];
		}
	}

	/**
	 * Process a chunk of data points and update trip state
	 */
	private async processDataChunk(
		dataPoints: TrackerDataPoint[],
		tripState: TripState,
		homeAddress: HomeAddress | null,
		tripExclusions: TripExclusion[],
		config: TripDetectionConfig,
		language: string,
		dateRange: DateRange
	): Promise<{
		newTrips: DetectedTrip[];
		updatedTripState: TripState;
		shouldContinue: boolean;
	}> {
		const newTrips: DetectedTrip[] = [];
		let updatedTripState = { ...tripState };
		let shouldContinue = true;

		for (const point of dataPoints) {
			// Determine if this point is home or away
			const isHome = await this.isUserHome(point, homeAddress, tripExclusions, config);

			if (isHome) {
				// User is at home
				updatedTripState.homePoints.push(point);
				updatedTripState.lastHomePoint = point;

				// Check if we have enough home points to confirm status
				if (updatedTripState.homePoints.length >= config.minStatusConfirmationPoints) {
					// If we were on a trip, this might end it
					if (updatedTripState.currentTripStart && updatedTripState.currentTripEnd) {
						const trip = await this.finalizeTrip(
							updatedTripState,
							homeAddress,
							tripExclusions,
							config,
							language
						);
						if (trip) {
							newTrips.push(trip);
						}

						// Reset trip state
						updatedTripState = {
							homePoints: [point], // Keep current point
							awayPoints: [],
							currentTripStart: null,
							currentTripEnd: null,
							currentTripLocations: [],
							lastHomePoint: point,
							lastAwayPoint: null,
							tripDataPoints: updatedTripState.tripDataPoints + 1
						};
					}
				}
			} else {
				// User is away from home
				updatedTripState.awayPoints.push(point);
				updatedTripState.lastAwayPoint = point;

				// Check if we have enough away points to confirm status
				if (updatedTripState.awayPoints.length >= config.minStatusConfirmationPoints) {
					// Check if we've been away long enough to start a trip
					const awayDuration = this.calculateDuration(
						updatedTripState.awayPoints[0].recorded_at,
						point.recorded_at
					);

					if (awayDuration >= config.minAwayDurationHours && !updatedTripState.currentTripStart) {
						// Start a new trip from the last home point
						if (updatedTripState.lastHomePoint) {
							updatedTripState.currentTripStart = updatedTripState.lastHomePoint.recorded_at;
							console.log(`🚀 Starting new trip at: ${updatedTripState.currentTripStart}`);
						}
					}
				}

				// If we're on a trip, add this location
				if (updatedTripState.currentTripStart) {
					const location = await this.processLocation(point, homeAddress, tripExclusions, config);
					if (location) {
						updatedTripState.currentTripLocations.push(location);
					}
				}
			}
		}

		// Fix the timestamp issue:
		if (updatedTripState.lastHomePoint) {
			updatedTripState.currentTripStart = updatedTripState.lastHomePoint.recorded_at;
			console.log(`🚀 Starting new trip at: ${updatedTripState.currentTripStart}`);
		}

		// Check if we should continue processing
		// Stop if we've reached the end date or if we have a complete trip
		const lastPoint = dataPoints[dataPoints.length - 1];
		if (lastPoint && dateRange.endDate) {
			const lastPointDate = new Date(lastPoint.recorded_at).toISOString().split('T')[0];
			const rangeEndDate = new Date(dateRange.endDate).toISOString().split('T')[0];

			if (lastPointDate >= rangeEndDate) {
				shouldContinue = false;
			}
		}

		return { newTrips, updatedTripState, shouldContinue };
	}

	/**
	 * Finalize a trip and create the DetectedTrip object
	 */
	private async finalizeTrip(
		tripState: TripState,
		homeAddress: HomeAddress | null,
		tripExclusions: TripExclusion[],
		config: TripDetectionConfig,
		language: string
	): Promise<DetectedTrip | null> {
		if (!tripState.currentTripStart || !tripState.currentTripEnd) {
			return null;
		}

		// Calculate trip duration using actual GPS timestamps
		const duration = this.calculateDuration(tripState.currentTripStart, tripState.currentTripEnd);

		// Validate minimum trip duration
		if (duration < config.minTripDurationHours) {
			console.log(`⏰ Trip too short (${duration}h), skipping`);
			return null;
		}

		// Validate minimum data points
		const totalDataPoints = tripState.currentTripLocations.reduce(
			(sum, loc) => sum + loc.dataPoints,
			0
		);
		if (totalDataPoints < config.minDataPointsPerDay) {
			console.log(`📊 Trip has too few data points (${totalDataPoints}), skipping`);
			return null;
		}

		// Generate smart trip title based on visited locations and home country
		const tripTitle = await this.generateTripTitle(tripState.currentTripLocations, homeAddress, language);

		// Calculate trip characteristics
		const uniqueCountries = this.getUniqueCountries(tripState.currentTripLocations);
		const uniqueCities = this.getUniqueCities(tripState.currentTripLocations);
		const isMultiCountryTrip = uniqueCountries.length > 1;
		const isMultiCityTrip = uniqueCities.length > 1;

		// Create the trip
		const trip: DetectedTrip = {
			id: `temp_${Date.now()}`,
			user_id: '', // Will be set by caller
			startDate: tripState.currentTripStart!,
			endDate: tripState.currentTripEnd!,
			title: tripTitle,
			description: `Trip detected from ${tripState.currentTripStart} to ${tripState.currentTripEnd}`,
			location: {
				type: 'Point',
				coordinates: [0, 0] // Will be set properly later
			},
			cityName: tripState.currentTripLocations[0]?.cityName || 'Unknown',
			dataPoints: tripState.currentTripLocations.reduce((sum, loc) => sum + loc.dataPoints, 0),
			overnightStays: 0, // Will be calculated later
			distanceFromHome: 0, // Will be calculated later
			status: 'pending',
			metadata: {
				totalDurationHours: duration,
				visitedCities: uniqueCities,
				visitedCountries: await this.getCountryNamesFromCodes(uniqueCountries),
				visitedCountryCodes: uniqueCountries,
				visitedLocations: tripState.currentTripLocations,
				isMultiCountryTrip: isMultiCountryTrip,
				isMultiCityTrip: isMultiCityTrip,
				tripType: this.determineTripType(tripState.currentTripLocations, homeAddress),
				primaryLocation: tripState.currentTripLocations[0]?.cityName || 'Unknown',
				primaryCountry: await this.getCountryNameFromCode(tripState.currentTripLocations[0]?.countryCode || 'Unknown'),
				primaryCountryCode: tripState.currentTripLocations[0]?.countryCode || 'Unknown',
				homeCity: homeAddress?.address?.city || 'Unknown',
				homeCountry: homeAddress?.address?.country || 'Unknown',
				homeCountryCode: homeAddress?.address?.country_code || 'Unknown'
			},
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		console.log(`✅ Finalized trip: ${trip.startDate} to ${trip.endDate} (${duration}h)`);
		return trip;
	}

	private async isUserHome(
        point: TrackerDataPoint,
        homeAddress: HomeAddress | null,
        tripExclusions: TripExclusion[],
        config: TripDetectionConfig
    ): Promise<boolean> {
        // Check if point is in an excluded city (always considered "home")
        for (const exclusion of tripExclusions) {
            const cityName = this.getCityFromPoint(point);
            // Handle new format: exclusion.name contains city name
            if (exclusion.name && cityName === exclusion.name) {
                return true;
            }
            // Handle old format: exclusion.exclusion_type === 'city' && exclusion.value
            if (exclusion.exclusion_type === 'city' && cityName === exclusion.value) {
                return true;
            }
        }

        // Check radius-based home detection
        if (homeAddress?.coordinates?.lat && homeAddress?.coordinates?.lng) {
            const pointCoords = this.getCoordinatesFromPoint(point);
            if (pointCoords) {
                const distance = haversineDistance(
                    homeAddress.coordinates.lat,
                    homeAddress.coordinates.lng,
                    pointCoords.lat,
                    pointCoords.lng
                );

                if (distance <= config.homeRadiusKm) {
                    return true;
                }
            }
        }

        return false;
    }

	/**
	 * Process a location point and create a VisitedLocation
	 */
	private async processLocation(
		point: TrackerDataPoint,
		homeAddress: HomeAddress | null,
		tripExclusions: TripExclusion[],
		config: TripDetectionConfig
	): Promise<VisitedLocation | null> {
		// Get city and coordinates from the point
		const cityName = this.getCityFromPoint(point);
		const coordinates = this.getCoordinatesFromPoint(point);
		const countryName = this.getCountryFromPoint(point);

		// Basic validation
		if (!cityName || !coordinates) {
			return null;
		}

		// Create visited location
		const location: VisitedLocation = {
			cityName: cityName,
			countryName: countryName || 'Unknown',
			countryCode: point.country_code || '',
			stateName: undefined, // Will be set from geocode data later
			durationHours: 0, // Will be calculated when clustering
			dataPoints: 1,
			coordinates: coordinates
		};

		return location;
	}

	/**
	 * Calculate duration between two timestamps in hours
	 */
	private calculateDuration(startTimestamp: string, endTimestamp: string): number {
		const start = new Date(startTimestamp).getTime();
		const end = new Date(endTimestamp).getTime();
		const durationMs = end - start;
		return durationMs / (1000 * 60 * 60); // Convert to hours
	}

	/**
	 * Determine which date ranges to process (exclude existing trips)
	 * Handles undefined start/end dates by using first/last data points
	 */
	private async determineDateRanges(
		userId: string,
		providedStartDate?: string,
		providedEndDate?: string
	): Promise<DateRange[]> {
		try {
			// Get existing trips and suggestions to avoid duplicates
			const { data: existingTrips, error: tripsError } = await this.supabase
				.from('trips')
				.select('start_date, end_date')
				.eq('user_id', userId)
				.in('status', ['confirmed', 'suggested']);

			if (tripsError) {
				console.error('❌ Error fetching existing trips:', tripsError);
				return [];
			}

			// Get user's data range to determine actual start/end dates
			const { data: dataRange, error: rangeError } = await this.supabase
				.from('tracker_data')
				.select('recorded_at')
				.eq('user_id', userId)
				.order('recorded_at', { ascending: true });

			if (rangeError || !dataRange || dataRange.length === 0) {
				console.error('❌ Error fetching data range:', rangeError);
				return [];
			}

			// Determine effective start and end dates
			const firstDataPoint = dataRange[0];
			const lastDataPoint = dataRange[dataRange.length - 1];

			const effectiveStartDate = providedStartDate || firstDataPoint.recorded_at;
			const effectiveEndDate = providedEndDate || lastDataPoint.recorded_at;

			console.log(`📅 Effective date range: ${effectiveStartDate} to ${effectiveEndDate}`);
			console.log(`📅 First data point: ${firstDataPoint.recorded_at}`);
			console.log(`📅 Last data point: ${lastDataPoint.recorded_at}`);

			// If we have a specific date range, return it directly
			if (providedStartDate && providedEndDate) {
				return [
					{
						startDate: providedStartDate,
						endDate: providedEndDate
					}
				];
			}

			// Create date ranges, excluding dates with existing trips
			const ranges: DateRange[] = [];
			let currentDate = new Date(effectiveStartDate);

			while (currentDate <= new Date(effectiveEndDate)) {
				const dateStr = currentDate.toISOString().split('T')[0];

				// Check if this date has existing trips
				const hasExistingTrips = existingTrips?.some((trip) => {
					const tripStart = new Date(trip.start_date);
					const tripEnd = new Date(trip.end_date);
					const checkDate = new Date(dateStr);
					return checkDate >= tripStart && checkDate <= tripEnd;
				});

				if (!hasExistingTrips) {
					// Find the next date with existing trips or end of data
					let rangeEnd = new Date(currentDate);
					rangeEnd.setDate(rangeEnd.getDate() + 30); // Default 30-day range

					// Adjust range end if there are existing trips
					if (existingTrips) {
						for (const trip of existingTrips) {
							const tripStart = new Date(trip.start_date);
							if (tripStart > currentDate && tripStart < rangeEnd) {
								rangeEnd = new Date(tripStart);
								rangeEnd.setDate(rangeEnd.getDate() - 1);
								break;
							}
						}
					}

					// Ensure range doesn't exceed effective end date
					if (rangeEnd > new Date(effectiveEndDate)) {
						rangeEnd = new Date(effectiveEndDate);
					}

					ranges.push({
						startDate: currentDate.toISOString().split('T')[0],
						endDate: rangeEnd.toISOString().split('T')[0]
					});

					currentDate = new Date(rangeEnd);
					currentDate.setDate(currentDate.getDate() + 1);
				} else {
					currentDate.setDate(currentDate.getDate() + 1);
				}
			}

			console.log(`📅 Created ${ranges.length} date ranges to process`);
			return ranges;
		} catch (error) {
			console.error('❌ Error determining date ranges:', error);
			return [];
		}
	}

	/**
	 * Get user settings (home address, trip exclusions, language)
	 */
	private async getUserSettings(userId: string): Promise<{
		homeAddress: HomeAddress | null;
		tripExclusions: TripExclusion[];
		language: string;
	}> {
		try {
			// Get home address from user_profiles using 'id' column
			const { data: homeAddress, error: homeError } = await this.supabase
				.from('user_profiles')
				.select('home_address')
				.eq('id', userId)
				.single();

			// Get trip exclusions and language from user_preferences
			const { data: userPreferences, error: preferencesError } = await this.supabase
				.from('user_preferences')
				.select('trip_exclusions, language')
				.eq('id', userId)
				.single();

			if (homeError) console.warn('⚠️ Could not fetch home address:', homeError);
			if (preferencesError) console.warn('⚠️ Could not fetch user preferences:', preferencesError);

			// Parse trip exclusions from JSON column
			let tripExclusions: any[] = [];
			if (userPreferences?.trip_exclusions) {
				try {
					tripExclusions = typeof userPreferences.trip_exclusions === 'string'
						? JSON.parse(userPreferences.trip_exclusions)
						: userPreferences.trip_exclusions;
				} catch (parseError) {
					console.warn('⚠️ Could not parse trip exclusions:', parseError);
					tripExclusions = [];
				}
			}

			return {
				homeAddress: homeAddress?.home_address || null,
				tripExclusions: tripExclusions || [],
				language: userPreferences?.language || 'en'
			};
		} catch (error) {
			console.error('❌ Error fetching user settings:', error);
			return {
				homeAddress: null,
				tripExclusions: [],
				language: 'en'
			};
		}
	}

	// Add these helper methods before the closing brace of the class:

	/**
	 * Get city name from TrackerDataPoint geocode data
	 */
	private getCityFromPoint(point: TrackerDataPoint): string | null {
		if (point.geocode && typeof point.geocode === 'object') {
			// Handle case where city is directly in geocode object (for testing)
			if ('city' in point.geocode && typeof point.geocode.city === 'string') {
				return point.geocode.city;
			}

			// Handle case where city is in address object
			if ('address' in point.geocode && point.geocode.address && typeof point.geocode.address === 'object') {
				const address = point.geocode.address as any;
				return address?.city || address?.town || address?.village || address?.municipality || null;
			}
		}
		return null;
	}

	/**
	 * Get coordinates from TrackerDataPoint location field
	 */
	private getCoordinatesFromPoint(point: TrackerDataPoint): { lat: number; lng: number } | null {
		if (point.location?.coordinates && point.location.coordinates.length >= 2) {
			return {
				lng: point.location.coordinates[0], // longitude
				lat: point.location.coordinates[1] // latitude
			};
		}
		return null;
	}

	/**
	 * Get country name from TrackerDataPoint geocode data
	 */
	private getCountryFromPoint(point: TrackerDataPoint): string | null {
		if (point.geocode && typeof point.geocode === 'object') {
			// Handle case where country is directly in geocode object (for testing)
			if ('country' in point.geocode && typeof point.geocode.country === 'string') {
				return point.geocode.country;
			}

			// Handle case where country is in address object
			if ('address' in point.geocode && point.geocode.address && typeof point.geocode.address === 'object') {
				const address = point.geocode.address as any;
				return typeof address.country === 'string' ? address.country : null;
			}
		}
		return null;
	}

	/**
	 * Generate trip title based on visited locations and home country
	 */
	private async generateTripTitle(
		locations: VisitedLocation[],
		homeAddress: HomeAddress | null,
		language: string
	): Promise<string> {
		if (locations.length === 0) return 'Trip to Unknown';

		const homeCountryCode = this.getHomeCountryCode(homeAddress);
		const isHomeCountry = this.isHomeCountryTrip(locations, homeCountryCode);



		if (isHomeCountry) {
			return this.generateHomeCountryTitle(locations);
		} else {
			return await this.generateInternationalTitle(locations);
		}
	}

	private getHomeCountryCode(homeAddress: HomeAddress | null): string {
		return homeAddress?.address?.country_code || 'Unknown';
	}

	private isHomeCountryTrip(locations: VisitedLocation[], homeCountryCode: string): boolean {
		return locations.every(loc => loc.countryCode === homeCountryCode);
	}

	private generateHomeCountryTitle(locations: VisitedLocation[]): string {
		const cities = this.getUniqueCities(locations);
		if (cities.length === 1) {
			return `Trip to ${cities[0]}`;
		} else {
			// For home country trips, always show city names (max 3)
			const cityList = cities.slice(0, 3).join(', ');
			return `Trip to ${cityList}`;
		}
	}

	private async generateInternationalTitle(locations: VisitedLocation[]): Promise<string> {
		const countries = this.getUniqueCountries(locations);

		if (countries.length > 1) {
			// Multiple countries
			const countryNames = await this.getCountryNamesFromCodes(countries);
			return `Trip to ${countryNames.slice(0, 3).join(', ')}`;
		} else {
			// Single country
			const countryCode = countries[0];
			const countryName = await this.getCountryNameFromCode(countryCode);
			const cities = this.getUniqueCities(locations);

			if (cities.length === 1) {
				return `Trip to ${cities[0]}`;
			} else {
				return `Trip to ${countryName}`;
			}
		}
	}

	private getUniqueCountries(locations: VisitedLocation[]): string[] {
		return Array.from(new Set(locations.map(loc => loc.countryCode)))
			.filter(code => code && code !== 'Unknown');
	}

	private getUniqueCities(locations: VisitedLocation[]): string[] {
		return Array.from(new Set(locations.map(loc => loc.cityName)))
			.filter(city => city && city !== 'Unknown');
	}

	private async getCountryNamesFromCodes(codes: string[]): Promise<string[]> {
		const countryNames: string[] = [];
		for (const code of codes) {
			const name = await this.getCountryNameFromCode(code);
			countryNames.push(name);
		}
		return countryNames;
	}

	private async getCountryNameFromCode(code: string): Promise<string> {
		try {
			const { data, error } = await this.supabase.rpc('full_country', { country: code });
			if (error) {
				console.warn(`⚠️ Could not find country name for code: ${code}`, error);
				return code;
			}
			return data || code;
		} catch (error) {
			console.error('❌ Error fetching country name from code:', error);
			return code;
		}
	}

	private determineTripType(locations: VisitedLocation[], homeAddress: HomeAddress | null): 'city' | 'country' | 'multi-city' | 'multi-country' {
		const homeCountryCode = this.getHomeCountryCode(homeAddress);
		const isHomeCountry = this.isHomeCountryTrip(locations, homeCountryCode);
		const uniqueCountries = this.getUniqueCountries(locations);
		const uniqueCities = this.getUniqueCities(locations);

		if (isHomeCountry) {
			return uniqueCities.length > 1 ? 'multi-city' : 'city';
		} else {
			return uniqueCountries.length > 1 ? 'multi-country' : 'country';
		}
	}
}
