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
	minTripDurationHours: number; // Minimum trip duration to reduce noise
	minDataPointsPerDay: number; // Minimum data points per day to ensure sufficient tracking
	homeRadiusKm: number; // Radius in km to consider user "at home"
	minStatusConfirmationPoints: number; // Points needed to confirm home/away status
	chunkSize: number; // Number of points to process in each chunk
}

export interface DateRange {
	startDate?: string; // Optional - undefined means start from first data point
	endDate?: string;   // Optional - undefined means continue until last data point
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
	tz_diff?: number; // Timezone difference from UTC in hours
}

export interface TripState {
	homePoints: TrackerDataPoint[]; // Accumulated home points for status confirmation
	awayPoints: TrackerDataPoint[]; // Accumulated away points for status confirmation
	currentTripStart: string | null; // Current trip start timestamp
	currentTripEnd: string | null; // Current trip end timestamp
	currentTripLocations: VisitedLocation[];
	lastHomePoint: TrackerDataPoint | null; // Last confirmed home point
	lastAwayPoint: TrackerDataPoint | null; // Last confirmed away point
	tripDataPoints: number; // Total number of data points processed during current trip
}

const DEFAULT_CONFIG: TripDetectionConfig = {
	minTripDurationHours: 24, // Minimum trip duration to reduce noise
	minDataPointsPerDay: 5, // Minimum data points per day to ensure sufficient tracking
	homeRadiusKm: 30, // Radius in km to consider user "at home"
	minStatusConfirmationPoints: 10, // Points needed to confirm home/away status
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
		console.log('🔍 Debug: Method parameters:', { userId, jobId, hasProgressCallback: !!progressCallback, dateRangesCount: providedDateRanges?.length });

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
			console.log(`📅 Range ${index + 1}: ${range.startDate || 'undefined'} to ${range.endDate || 'undefined'}`);
		});

		if (progressCallback) {
			progressCallback(5, `Found ${dateRanges.length} date ranges to process`);
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

			// Double-check that this date range doesn't already have trips
			const hasExistingTrips = await this.hasExistingTripsInDateRange(userId, dateRange);
			if (hasExistingTrips) {
				console.log(`⏭️ Skipping date range ${dateRange.startDate} to ${dateRange.endDate} - already has trips`);
				processedRanges++;
				continue;
			}

			if (progressCallback) {
				const progress = 5 + Math.round((processedRanges / dateRanges.length) * 5); // 5-10% for date range setup
				progressCallback(
					progress,
					`Processing date range ${processedRanges + 1}/${dateRanges.length}: ${dateRange.startDate || 'undefined'} to ${dateRange.endDate || 'undefined'}`
				);
			}

			console.log(`🔄 Processing date range: ${dateRange.startDate || 'undefined'} to ${dateRange.endDate || 'undefined'}`);

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

			console.log(`✅ Completed date range ${processedRanges}/${dateRanges.length}, found ${trips.length} trips`);
		}

		if (progressCallback) {
			progressCallback(100, `Trip detection completed. Found ${allTrips.length} total trips.`);
		}

		const skippedRanges = dateRanges.length - processedRanges;
		console.log(`🎉 Trip detection completed! Found ${allTrips.length} total trips.`);
		if (skippedRanges > 0) {
			console.log(`⏭️ Skipped ${skippedRanges} date ranges that already had trips`);
		}

		// Save detected trips to the database
		if (allTrips.length > 0) {
			if (progressCallback) {
				progressCallback(90, `Saving ${allTrips.length} detected trips to database...`);
			}

			try {
				await this.saveTripsToDatabase(allTrips, userId);
				console.log(`💾 Successfully saved ${allTrips.length} trips to database`);

				if (progressCallback) {
					progressCallback(95, `Successfully saved ${allTrips.length} trips to database`);
				}
			} catch (error) {
				console.error('❌ Failed to save trips to database:', error);
				// Don't throw error here, we still want to return the detected trips
			}
		}

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

		// First, determine the total number of data points to process
		const totalDataPoints = await this.getTotalDataPointsForDateRange(userId, dateRange);
		const totalBatches = Math.ceil(totalDataPoints / config.chunkSize);

		console.log(`🔄 Processing date range in chunks of ${config.chunkSize} points`);
		console.log(`📊 Total data points: ${totalDataPoints}, Total batches: ${totalBatches}`);

		if (progressCallback) {
			progressCallback(0, `Starting to process ${totalBatches} batches of data`);
		}

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

			// Update progress based on actual batches processed
			if (progressCallback) {
				const currentBatch = Math.floor(currentOffset / config.chunkSize) + 1;
				const batchProgress = Math.min((currentBatch / totalBatches) * 80, 80); // 80% for batch processing
				const overallProgress = Math.round(10 + batchProgress); // 10% for setup + 80% for processing, ensure integer
				progressCallback(
					overallProgress,
					`Processing batch ${currentBatch}/${totalBatches} (${currentOffset}/${totalDataPoints} points), found ${trips.length} trips`
				);
			}

			// Add small delay to prevent overwhelming the system
			await new Promise(resolve => setTimeout(resolve, 100));
		}

		// Finalize any incomplete trip
		if (tripState.currentTripStart) {
			// If we never got back home, set the end to the last processed point
			if (!tripState.currentTripEnd) {
				// Find the last point we processed to set as trip end
				// This is a fallback for trips that never return home
				const lastProcessedPoint = await this.getLastProcessedPoint(userId, dateRange.endDate);
				if (lastProcessedPoint) {
					tripState.currentTripEnd = lastProcessedPoint.recorded_at;
					console.log(`🏁 Finalizing incomplete trip at last processed point: ${tripState.currentTripEnd}`);
				}
			}

			const finalTrip = await this.finalizeTrip(tripState, homeAddress, tripExclusions, config, language);
			if (finalTrip) {
				trips.push(finalTrip);
			}
		}

		console.log(`✅ Completed processing date range. Found ${trips.length} trips.`);
		return trips;
	}

			/**
	 * Check if a date range already has trips
	 */
	private async hasExistingTripsInDateRange(userId: string, dateRange: DateRange): Promise<boolean> {
		try {
			// Use a more reliable approach: check if any existing trip overlaps with this date range
			const { data: existingTrips, error } = await this.supabase
				.from('trips')
				.select('id')
				.eq('user_id', userId)
				.in('status', ['confirmed', 'suggested', 'pending'])
				.or(`start_date.lte.${dateRange.endDate || '9999-12-31'},end_date.gte.${dateRange.startDate || '1900-01-01'}`);

			if (error) {
				console.error('❌ Error checking for existing trips in date range:', error);
				return false; // Assume no conflicts if we can't check
			}

			return (existingTrips?.length || 0) > 0;
		} catch (error) {
			console.error('❌ Exception checking for existing trips in date range:', error);
			return false; // Assume no conflicts if we can't check
		}
	}

	/**
	 * Get the total number of data points for a specific date range
	 */
	private async getTotalDataPointsForDateRange(userId: string, dateRange: DateRange): Promise<number> {
		try {
			let query = this.supabase
				.from('tracker_data')
				.select('recorded_at', { count: 'exact', head: true })
				.eq('user_id', userId);

			// Apply date filters only if dates are provided
			if (dateRange.startDate) {
				query = query.gte('recorded_at', dateRange.startDate);
			}
			if (dateRange.endDate) {
				query = query.lte('recorded_at', dateRange.endDate);
			}

			const { count, error } = await query;

			if (error) {
				console.error('❌ Error counting data points for date range:', error);
				return 1000; // Fallback to reasonable default
			}

			return count || 0;
		} catch (error) {
			console.error('❌ Exception counting data points for date range:', error);
			return 1000; // Fallback to reasonable default
		}
	}

	/**
	 * Save detected trips to the trips table
	 */
	private async saveTripsToDatabase(trips: DetectedTrip[], userId: string): Promise<void> {
		if (trips.length === 0) {
			console.log('📝 No trips to save to database');
			return;
		}

		console.log(`💾 Saving ${trips.length} detected trips to trips table with status 'pending'...`);

		// Debug: Log metadata values to identify the decimal issue
		trips.forEach((trip, index) => {
			console.log(`🔍 Trip ${index + 1} metadata debug:`);
			console.log(`  - overnightStays:`, trip.metadata.overnightStays, `(type: ${typeof trip.metadata.overnightStays})`);
			console.log(`  - dataPoints:`, trip.dataPoints, `(type: ${typeof trip.dataPoints})`);
			console.log(`  - totalDurationHours:`, trip.metadata.totalDurationHours, `(type: ${typeof trip.metadata.totalDurationHours})`);
		});

		try {
			// Convert DetectedTrip objects to trips table format (only include fields that exist in the table)
			const tripsToInsert = trips.map(trip => ({
				id: trip.id,
				user_id: userId,
				title: trip.title,
				description: trip.description,
				start_date: trip.startDate.split('T')[0], // Convert to date only
				end_date: trip.endDate.split('T')[0], // Convert to date only
				status: 'pending', // All detected trips start as pending (suggested)
				image_url: null,
				labels: ['suggested'], // Mark as suggested trip
				metadata: {
					// Store the additional trip data in metadata since they don't exist as separate columns
					cityName: trip.metadata.homeCity || 'Unknown',
					confidence: 0.8,
					point_count: trip.dataPoints || 0, // Frontend expects this field name
					overnightStays: Math.round(Number(trip.metadata.overnightStays) || 0),
					distanceFromHome: 0.0,
					distance_traveled: 0.0, // Frontend expects this field name
					image_attribution: null, // Frontend expects this field
					detected_trip_id: trip.id,
					detection_method: 'automatic',
					detected_at: new Date().toISOString(),
					// Ensure numeric values are properly typed
					totalDurationHours: Number(trip.metadata.totalDurationHours || 0),
					visitedCities: trip.metadata.visitedCities || [],
					visitedCountries: trip.metadata.visitedCountries || [],
					visitedCountryCodes: trip.metadata.visitedCountryCodes || [],
					visitedLocations: trip.metadata.visitedLocations || [],
					isMultiCountryTrip: Boolean(trip.metadata.isMultiCountryTrip),
					isMultiCityTrip: Boolean(trip.metadata.isMultiCityTrip),
					tripType: trip.metadata.tripType || 'city',
					primaryLocation: trip.metadata.primaryLocation || 'Unknown',
					primaryCountry: trip.metadata.primaryCountry || 'Unknown',
					primaryCountryCode: trip.metadata.primaryCountryCode || 'Unknown',
					homeCountry: trip.metadata.homeCountry || 'Unknown',
					homeCountryCode: trip.metadata.homeCountryCode || 'Unknown',
					cityDurations: trip.metadata.cityDurations || {},
					isDomestic: Boolean(trip.metadata.isDomestic),
					// Add timezone information from trip metadata
					timezone_info: trip.metadata.timezone_info || 'UTC'
				},
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			}));

			// Debug: Log what's being sent to the database
			console.log(`🔍 Database insert debug - First trip metadata:`, JSON.stringify(tripsToInsert[0]?.metadata, null, 2));

			// Insert trips into the trips table
			const { data: insertedTrips, error } = await this.supabase
				.from('trips')
				.insert(tripsToInsert)
				.select();

			if (error) {
				console.error('❌ Error saving trips to trips table:', error);
				throw error;
			}

			console.log(`✅ Successfully saved ${insertedTrips?.length || 0} trips to trips table`);

			// Log the saved trips for debugging
			insertedTrips?.forEach((trip, index) => {
				console.log(`  📍 Trip ${index + 1}: ${trip.title} (${trip.start_date} to ${trip.end_date})`);
			});

		} catch (error) {
			console.error('❌ Failed to save trips to trips table:', error);
			throw error;
		}
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

			// Log status changes periodically
			if (dataPoints.indexOf(point) % 1000 === 0) {
				const city = this.getCityFromPoint(point);
				console.log(`📍 Point ${dataPoints.indexOf(point)}: ${isHome ? '🏠 HOME' : '✈️ AWAY'} in ${city || 'Unknown'}`);
			}

			if (isHome) {
				// User is at home
				updatedTripState.homePoints.push(point);
				updatedTripState.lastHomePoint = point;

				// Check if we have enough home points to confirm status
				if (updatedTripState.homePoints.length >= config.minStatusConfirmationPoints) {
					// If we were on a trip, this ends it
					if (updatedTripState.currentTripStart && !updatedTripState.currentTripEnd) {
						// Set trip end to the last away point (before returning home)
						const lastAwayPoint = updatedTripState.awayPoints[updatedTripState.awayPoints.length - 1];
						if (lastAwayPoint) {
							updatedTripState.currentTripEnd = lastAwayPoint.recorded_at;
							console.log(`🏠 User returned home, ending trip at: ${updatedTripState.currentTripEnd}`);

							// Finalize the completed trip
							const trip = await this.finalizeTrip(
								updatedTripState,
								homeAddress,
								tripExclusions,
								config,
								language
							);
							if (trip) {
								newTrips.push(trip);
								console.log(`✅ Trip completed: ${trip.startDate} to ${trip.endDate}`);
							}
						}

						// Reset trip state for next trip
						updatedTripState = {
							homePoints: [point], // Keep current home point
							awayPoints: [],
							currentTripStart: null,
							currentTripEnd: null,
							currentTripLocations: [],
							lastHomePoint: point,
							lastAwayPoint: null,
							tripDataPoints: 0
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

					if (awayDuration >= config.minTripDurationHours && !updatedTripState.currentTripStart) {
						// Start a new trip from the last home point
						if (updatedTripState.lastHomePoint) {
							updatedTripState.currentTripStart = updatedTripState.lastHomePoint.recorded_at;
							console.log(`🚀 Starting new trip at: ${updatedTripState.currentTripStart}`);
						}
					}
				}

										// If we're on a trip, add this location and increment data point counter
		if (updatedTripState.currentTripStart) {
			// Increment the trip data point counter for every GPS point processed
			updatedTripState.tripDataPoints = (updatedTripState.tripDataPoints || 0) + 1;

			const location = await this.processLocation(point, homeAddress, tripExclusions, config);
			if (location) {
				// Set the actual data points for this location (not just 1)
				location.dataPoints = 1; // Each location represents 1 GPS point
				updatedTripState.currentTripLocations.push(location);

			} else {
				// Log when location processing fails (occasionally to avoid spam)
				if (Math.random() < 0.001) {
					const city = this.getCityFromPoint(point);
					console.log(`❌ Failed to process location: city=${city}, coords=${JSON.stringify(this.getCoordinatesFromPoint(point))}`);
				}
			}

					// Log trip progress periodically (only when we have locations and every 100)
					if (updatedTripState.currentTripLocations.length > 0 && updatedTripState.currentTripLocations.length % 100 === 0) {
						console.log(`🗺️ Trip in progress: ${updatedTripState.currentTripLocations.length} locations, started: ${updatedTripState.currentTripStart}`);
					}
				}
			}
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

		// Finalize any incomplete trip if we're at the end of data
		if (!shouldContinue && updatedTripState.currentTripStart && !updatedTripState.currentTripEnd) {
			// Set trip end to the last data point if we never got back home
			updatedTripState.currentTripEnd = lastPoint.recorded_at;
			console.log(`🏁 Finalizing incomplete trip at end of data: ${updatedTripState.currentTripEnd}`);

			// Finalize the incomplete trip
			const trip = await this.finalizeTrip(
				updatedTripState,
				homeAddress,
				tripExclusions,
				config,
				language
			);
			if (trip) {
				newTrips.push(trip);
				console.log(`✅ Incomplete trip finalized: ${trip.startDate} to ${trip.endDate}`);
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

		// Validate minimum trip duration (increase threshold to reduce noise)
		if (duration < config.minTripDurationHours) {
			console.log(`⏰ Trip too short (${duration.toFixed(1)}h), skipping`);
			return null;
		}

		// Validate minimum data points (use actual processed data points)
		const totalDataPoints = tripState.tripDataPoints || 0;
		if (totalDataPoints < config.minDataPointsPerDay * 2) { // Require more data points
			console.log(`📊 Trip has too few data points (${totalDataPoints}), skipping`);
			return null;
		}

		// Additional filtering: skip very short trips or trips with too few locations
		if (tripState.currentTripLocations.length < 3) {
			console.log(`📍 Trip has too few locations (${tripState.currentTripLocations.length}), skipping`);
			return null;
		}

		// Generate a proper UUID for the trip
		const tripId = crypto.randomUUID();



		// Calculate duration spent in each city (minimum 2 hours to count as "visited")
		const cityDurations = new Map<string, number>();

		// Count data points for each city (1 data point ≈ 1 hour estimate)
		for (const location of tripState.currentTripLocations) {
			const city = location.cityName;
			const currentDuration = cityDurations.get(city) || 0;
			cityDurations.set(city, currentDuration + 1);
		}

		// Filter cities that were visited for at least 2 hours and sort by duration (descending)
		const visitedCities = Array.from(cityDurations.entries())
			.filter(([city, duration]) => duration >= 3)
			.sort(([, durationA], [, durationB]) => durationB - durationA) // Sort by duration descending
			.map(([city]) => city);

		// Determine if this is a domestic or international trip
		const homeCountryCode = homeAddress?.address?.country_code || 'Unknown';
		const isDomestic = tripState.currentTripLocations.every(loc =>
			loc.countryCode === homeCountryCode || loc.countryCode === 'Unknown'
		);

		// Generate smart trip title based on the rules
		let tripTitle = 'Trip to Unknown';
		if (visitedCities.length === 0) {
			tripTitle = 'Trip to Unknown';
		} else if (isDomestic) {
			if (visitedCities.length === 1) {
				tripTitle = `Trip to ${visitedCities[0]}`;
			} else {
				// Check if primary city dominates the trip (>50% of time)
				const primaryCity = visitedCities[0];
				const primaryCityDuration = cityDurations.get(primaryCity) || 0;
				const totalDuration = tripState.tripDataPoints || 1;
				const primaryCityPercentage = (primaryCityDuration / totalDuration) * 100;

				if (primaryCityPercentage >= 50) {
					// Primary city dominates, use single city title
					tripTitle = `Trip to ${primaryCity}`;
				} else {
					// Multi-city domestic trip
					const cityList = visitedCities.slice(0, 3).join(', ');
					tripTitle = `Multi-city trip: ${cityList}`;
				}
			}
		} else {
			// International trip
			// Calculate time spent in each country (excluding home country)
			const countryDurations = new Map<string, number>();
			const homeCountryCode = homeAddress?.address?.country_code || 'Unknown';
			
			for (const location of tripState.currentTripLocations) {
				if (location.countryCode && location.countryCode !== 'Unknown' && location.countryCode !== homeCountryCode) {
					const currentDuration = countryDurations.get(location.countryCode) || 0;
					countryDurations.set(location.countryCode, currentDuration + location.durationHours);
				}
			}
			
			// Only count countries visited for more than 24 hours
			const visitedCountryCodes = Array.from(countryDurations.entries())
				.filter(([code, duration]) => duration >= 24)
				.map(([code]) => code);

			if (visitedCountryCodes.length > 1) {
				// Multi-country trip - get country names from codes
				const countryNames = await this.getCountryNamesFromCodes(visitedCountryCodes);
				const countryList = countryNames.slice(0, 3).join(', ');
				tripTitle = `Trip to ${countryList}`;
			} else if (visitedCountryCodes.length === 1) {
				// Single country international trip
				const countryName = await this.getCountryNameFromCode(visitedCountryCodes[0]);
				const primaryCity = visitedCities[0];
				const primaryCityDuration = cityDurations.get(primaryCity) || 0;
				const totalDuration = tripState.tripDataPoints || 1;
				const primaryCityPercentage = (primaryCityDuration / totalDuration) * 100;

				if (visitedCities.length > 1) {
					// Multiple cities visited abroad - use country name
					tripTitle = `Trip to ${countryName}`;
				} else if (primaryCityPercentage >= 50) {
					// Single city dominates the trip - use city name
					tripTitle = `Trip to ${primaryCity}`;
				} else {
					// Multiple cities but no single city dominates - use country name
					tripTitle = `Trip to ${countryName}`;
				}
			} else {
				// Fallback for unknown countries or insufficient duration
				const primaryCity = visitedCities[0];
				tripTitle = `Trip to ${primaryCity}`;
			}
		}

		// Create the trip
		const trip: DetectedTrip = {
			id: tripId,
			user_id: '', // Will be set by caller
			startDate: tripState.currentTripStart,
			endDate: tripState.currentTripEnd,
			title: tripTitle,
			description: this.getLocalizedTripDescription(tripState.currentTripStart, tripState.currentTripEnd, language),
			location: {
				type: 'Point',
				coordinates: [0, 0] // Will be set properly later
			},
			cityName: tripState.currentTripLocations[0]?.cityName || 'Unknown',
			dataPoints: tripState.tripDataPoints || 0,
			overnightStays: 0, // Will be calculated later
			distanceFromHome: 0, // Will be calculated later
			status: 'pending',
			metadata: {
				totalDurationHours: duration,
				visitedCities: visitedCities, // Only cities visited for at least 2 hours
				visitedCountries: Array.from(new Set(tripState.currentTripLocations.map(loc => loc.countryName))), // Unique countries only
				visitedCountryCodes: Array.from(new Set(tripState.currentTripLocations.map(loc => loc.countryCode))), // Unique country codes only
				visitedLocations: tripState.currentTripLocations, // Required by interface, but could be optimized later
				isMultiCountryTrip: new Set(tripState.currentTripLocations.map(loc => loc.countryCode)).size > 1,
				isMultiCityTrip: visitedCities.length > 1,
				tripType: isDomestic ? 'city' : 'multi-country',
				primaryLocation: visitedCities[0] || 'Unknown',
				primaryCountry: tripState.currentTripLocations[0]?.countryName || 'Unknown',
				primaryCountryCode: tripState.currentTripLocations[0]?.countryCode || 'Unknown',
				homeCity: homeAddress?.address?.city || 'Unknown',
				homeCountry: homeAddress?.address?.country || 'Unknown',
				homeCountryCode: homeAddress?.address?.country_code || 'Unknown',
				cityDurations: Object.fromEntries(cityDurations), // Store duration for each city
				isDomestic: isDomestic,
				// Add timezone information
				timezone_info: this.getTimezoneInfo(tripState.currentTripLocations)
			},
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		console.log(`✅ Finalized trip: ${trip.startDate} to ${trip.endDate} (${duration.toFixed(1)}h, ${tripState.currentTripLocations.length} locations)`);

		// Debug: Log metadata values to identify the decimal issue
		console.log(`🔍 Trip metadata debug:`);
		console.log(`  - cityDurations:`, Object.fromEntries(cityDurations));
		console.log(`  - visitedCities:`, visitedCities);
		console.log(`  - tripDataPoints:`, tripState.tripDataPoints);
		console.log(`  - overnightStays:`, trip.overnightStays, `(type: ${typeof trip.overnightStays})`);
		console.log(`  - Full trip metadata:`, JSON.stringify(trip.metadata, null, 2));

		return trip;
	}

		/**
	 * Determine if a user is at home based on location and exclusions
	 */
	private async isUserHome(
		point: TrackerDataPoint,
		homeAddress: HomeAddress | null,
		tripExclusions: TripExclusion[],
		config: TripDetectionConfig
	): Promise<boolean> {
		const cityName = this.getCityFromPoint(point);
		const pointCoords = this.getCoordinatesFromPoint(point);

		// Check if point is in an excluded city (always considered "home")
		for (const exclusion of tripExclusions) {
			// City name matching
			if (exclusion.exclusion_type === 'city' && cityName === exclusion.value) {
				if (Math.random() < 0.001) console.log(`✅ Home detected via city exclusion: ${cityName} matches ${exclusion.value}`);
				return true;
			}

			// Location-based exclusion using coordinates
			if (exclusion.location?.coordinates?.lat && exclusion.location?.coordinates?.lng && pointCoords) {
				const exclusionCoords = exclusion.location.coordinates;
				const distance = haversineDistance(
					exclusionCoords.lat,
					exclusionCoords.lng,
					pointCoords.lat,
					pointCoords.lng
				);

				// Use a reasonable radius for exclusion zones (5km default)
				const exclusionRadius = 5; // km
				if (distance <= exclusionRadius) {
					if (Math.random() < 0.001) console.log(`✅ Home detected via location exclusion: ${distance.toFixed(2)}km from ${exclusion.name} (${exclusion.value})`);
					return true;
				}
			}
		}

		// FALLBACK: If geocode data is empty but we have country code, check if user is in Netherlands
		// This is a temporary fix until geocode data is properly populated
		if (!cityName && point.country_code === 'NL') {
			// Check if home address is in Netherlands
			if (homeAddress?.address?.country === 'Netherlands' || homeAddress?.address?.country === 'Nederland') {
				if (Math.random() < 0.001) console.log(`✅ Home detected via country fallback: NL country code matches home country`);
				return true;
			}
		}

		// Check if user is in their home city (city name match with fallbacks)
		if (homeAddress?.address?.city && cityName) {
			const homeCity = homeAddress.address.city.toLowerCase();
			const currentCity = cityName.toLowerCase();

			// Exact match
			if (currentCity === homeCity) {
				if (Math.random() < 0.001) console.log(`✅ Home detected via exact city match: ${cityName} matches home city ${homeAddress.address.city}`);
				return true;
			}

			// Check if current city contains home city or vice versa (for partial matches)
			if (currentCity.includes(homeCity) || homeCity.includes(currentCity)) {
				if (Math.random() < 0.001) console.log(`✅ Home detected via partial city match: ${cityName} partially matches home city ${homeAddress.address.city}`);
				return true;
			}

			// Check municipality as fallback
			if (homeAddress.address.municipality && homeAddress.address.municipality.toLowerCase() === currentCity) {
				if (Math.random() < 0.001) console.log(`✅ Home detected via municipality match: ${cityName} matches home municipality ${homeAddress.address.municipality}`);
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

				if (Math.random() < 0.001) console.log(`  - Distance from home: ${distance.toFixed(2)}km (threshold: ${config.homeRadiusKm}km)`);

				if (distance <= config.homeRadiusKm) {
					if (Math.random() < 0.001) console.log(`✅ Home detected via radius: ${distance.toFixed(2)}km <= ${config.homeRadiusKm}km`);
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Extract city name from a tracker data point
	 */
	private getCityFromPoint(point: TrackerDataPoint): string | null {
		let geocode: any = null;

		// Handle different geocode data formats
		if (typeof point.geocode === 'string') {
			try {
				geocode = JSON.parse(point.geocode);
			} catch (e) {
				// If parsing fails, try to use the string directly
				geocode = { display_name: point.geocode };
			}
		} else if (typeof point.geocode === 'object' && point.geocode !== null) {
			geocode = point.geocode;
		}

		if (geocode) {
			// Check various city fields
			if (geocode.city) return geocode.city;
			if (geocode.town) return geocode.town;
			if (geocode.village) return geocode.village;
			if (geocode.municipality) return geocode.municipality;
			if (geocode.suburb) return geocode.suburb;

			// Check address object
			if (geocode.address?.city) return geocode.address.city;
			if (geocode.address?.town) return geocode.address.town;
			if (geocode.address?.village) return geocode.address.village;

			// Check display_name as fallback
			if (geocode.display_name) {
				// Try to extract city from display_name (e.g., "Amsterdam, Noord-Holland, Netherlands")
				const parts = geocode.display_name.split(', ');
				if (parts.length > 0) {
					return parts[0]; // First part is usually the city
				}
			}

			// Additional fallback: check for any location-related field
			if (geocode.name) return geocode.name;
			if (geocode.locality) return geocode.locality;
			if (geocode.place) return geocode.place;
		}

		// Debug logging for city extraction (only occasionally to avoid spam)
		if (Math.random() < 0.001) { // 0.1% chance to log
			console.log(`🏙️ City extraction debug:`);
			console.log(`  - Geocode type:`, typeof point.geocode);
			console.log(`  - Geocode data:`, point.geocode);
			console.log(`  - Parsed geocode:`, geocode);
			console.log(`  - Country code:`, point.country_code);
		}

		return null;
	}

	/**
	 * Extract coordinates from a tracker data point
	 */
	private getCoordinatesFromPoint(point: TrackerDataPoint): { lat: number; lng: number } | null {
		// Try to get coordinates from location.coordinates
		if (point.location?.coordinates && point.location.coordinates.length >= 2) {
			return {
				lng: point.location.coordinates[0], // Longitude is first
				lat: point.location.coordinates[1]  // Latitude is second
			};
		}

		return null;
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

		// Basic validation
		if (!cityName || !coordinates) {
			return null;
		}

		// Create visited location
		const location: VisitedLocation = {
			cityName: cityName,
			countryName: 'Unknown', // Will be set from geocode data later
			countryCode: point.country_code || '',
			stateName: undefined, // Will be set from geocode data later
			durationHours: 0, // Will be calculated when clustering
			dataPoints: 0, // Will be set by caller based on actual GPS points
			coordinates: coordinates,
			tz_diff: (point as any).tz_diff // Capture timezone difference
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
	 * Get localized trip description based on user's language preference
	 */
	private getLocalizedTripDescription(startDate: string, endDate: string, language: string): string {
		const start = new Date(startDate);
		const end = new Date(endDate);
		const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

		// Default to English if language not supported
		const messages = {
			en: `Trip of ${daysDiff} day${daysDiff === 1 ? '' : 's'} detected.`,
			nl: `Reis van ${daysDiff} dag${daysDiff === 1 ? '' : 'en'} gedetecteerd.`,
			es: `Viaje de ${daysDiff} día${daysDiff === 1 ? '' : 's'} detectado.`
		};

		return messages[language as keyof typeof messages] || messages.en;
	}

	/**
	 * Get average timezone difference for trip locations
	 * Used for converting UTC timestamps to local time
	 */
	private getAverageTzDiff(locations: VisitedLocation[]): number {
		if (!locations || locations.length === 0) {
			return 0; // Default to UTC
		}

		// Filter out undefined/null tz_diff values
		const validTzDiffs = locations
			.map(loc => loc.tz_diff)
			.filter(tz => tz !== undefined && tz !== null);

		if (validTzDiffs.length === 0) {
			return 0; // Default to UTC
		}

		// Calculate average timezone difference
		const sum = validTzDiffs.reduce((acc, tz) => acc + tz, 0);
		return sum / validTzDiffs.length;
	}

	/**
	 * Get timezone information for trip locations
	 * Returns a summary of timezone differences encountered during the trip
	 */
	private getTimezoneInfo(locations: VisitedLocation[]): string {
	if (!locations || locations.length === 0) {
		return 'UTC';
	}

	// Get unique timezone differences
	const timezoneDiffs = new Set<number>();
	locations.forEach(location => {
		if (location.tz_diff !== undefined && location.tz_diff !== null) {
			timezoneDiffs.add(location.tz_diff);
		}
	});

	if (timezoneDiffs.size === 0) {
		return 'UTC';
	}

	if (timezoneDiffs.size === 1) {
		const tzDiff = Array.from(timezoneDiffs)[0];
		return this.formatTimezoneOffset(tzDiff);
	}

	// Multiple timezones - show range
	const sortedDiffs = Array.from(timezoneDiffs).sort((a, b) => a - b);
	const minTz = this.formatTimezoneOffset(sortedDiffs[0]);
	const maxTz = this.formatTimezoneOffset(sortedDiffs[sortedDiffs.length - 1]);
	return `${minTz} to ${maxTz}`;
}

/**
 * Format timezone offset in a user-friendly way
 */
	private formatTimezoneOffset(tzDiff: number): string {
		if (tzDiff === 0) return 'UTC';

		const sign = tzDiff > 0 ? '+' : '-';
		const hours = Math.abs(Math.floor(tzDiff));
		const minutes = Math.abs(Math.round((tzDiff % 1) * 60));

		if (minutes === 0) {
			return `UTC${sign}${hours}`;
		}

		return `UTC${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
	}

/**
 * Format timestamp with timezone information
 * Converts UTC timestamp to local timezone based on tz_diff
 */
private formatTimestampWithTimezone(timestamp: string, tz_diff?: number): string {
	if (!tz_diff) {
		return timestamp; // Return as-is if no timezone info
	}

	try {
		const date = new Date(timestamp);
		const utcTime = date.getTime();
		const localTime = utcTime + (tz_diff * 60 * 60 * 1000); // Convert to local time
		const localDate = new Date(localTime);

		// Format with timezone offset
		const offsetHours = Math.abs(tz_diff);
		const offsetSign = tz_diff >= 0 ? '+' : '-';
		const offsetStr = `${offsetSign}${offsetHours.toString().padStart(2, '0')}:00`;

		return localDate.toISOString().replace('Z', offsetStr);
	} catch (error) {
		console.warn('⚠️ Error formatting timestamp with timezone:', error);
		return timestamp; // Fallback to original timestamp
	}
}

	/**
	 * Determine which date ranges to process (exclude existing trips)
	 * Handles undefined start/end dates by using first/last data points
	 */
	private async determineDateRanges(userId: string, providedStartDate?: string, providedEndDate?: string): Promise<DateRange[]> {
		try {
			// Get existing trips to avoid duplicates (including pending trips from previous runs)
			const { data: existingTrips, error: tripsError } = await this.supabase
				.from('trips')
				.select('start_date, end_date, status')
				.eq('user_id', userId)
				.in('status', ['confirmed', 'suggested', 'pending']);

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
				return [{
					startDate: providedStartDate,
					endDate: providedEndDate
				}];
			}

			// Create date ranges, excluding dates with existing trips
			const ranges: DateRange[] = [];
			let currentDate = new Date(effectiveStartDate);
			let skippedDates = 0;

			console.log(`📅 Checking ${existingTrips?.length || 0} existing trips for date conflicts`);

			while (currentDate <= new Date(effectiveEndDate)) {
				const dateStr = currentDate.toISOString().split('T')[0];

				// Check if this date has existing trips
				const hasExistingTrips = existingTrips?.some(trip => {
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

					// Only add range if it has meaningful duration (at least 1 day)
					if (rangeEnd > currentDate) {
						ranges.push({
							startDate: currentDate.toISOString().split('T')[0],
							endDate: rangeEnd.toISOString().split('T')[0]
						});
					}

					currentDate = new Date(rangeEnd);
					currentDate.setDate(currentDate.getDate() + 1);
				} else {
					skippedDates++;
					currentDate.setDate(currentDate.getDate() + 1);
				}
			}

			if (skippedDates > 0) {
				console.log(`⏭️ Skipped ${skippedDates} dates that already have trips`);
			}

			console.log(`📅 Created ${ranges.length} date ranges to process`);
			return ranges;
		} catch (error) {
			console.error('❌ Error determining date ranges:', error);
			return [];
		}
	}

	/**
	 * Get the last processed data point for a user (used for finalizing incomplete trips)
	 */
	private async getLastProcessedPoint(userId: string, endDate?: string): Promise<TrackerDataPoint | null> {
		try {
			let query = this.supabase
				.from('tracker_data')
				.select('*')
				.eq('user_id', userId)
				.order('recorded_at', { ascending: false })
				.limit(1);

			// Apply end date filter if provided
			if (endDate) {
				query = query.lte('recorded_at', endDate);
			}

			const { data, error } = await query.single();

			if (error) {
				console.warn('⚠️ Could not fetch last processed point:', error);
				return null;
			}

			return data;
		} catch (error) {
			console.error('❌ Error fetching last processed point:', error);
			return null;
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
			// Get home address from user_profiles
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

			// Debug logging for user settings
			console.log(`🏠 User settings debug:`);
			console.log(`  - Home address:`, homeAddress?.home_address);
			console.log(`  - Trip exclusions:`, userPreferences?.trip_exclusions);
			console.log(`  - Language:`, userPreferences?.language);
			console.log(`  - Raw userPreferences:`, userPreferences);

			// Validate and clean trip exclusions
			let tripExclusions = userPreferences?.trip_exclusions || [];
			console.log(`  - Raw trip exclusions:`, tripExclusions);
			console.log(`  - Trip exclusions type:`, typeof tripExclusions);
			console.log(`  - Trip exclusions is array:`, Array.isArray(tripExclusions));

			if (Array.isArray(tripExclusions)) {
				// Filter valid exclusions and convert to the expected format
				tripExclusions = tripExclusions
					.filter(ex => ex && typeof ex === 'object' && ex.name && ex.location)
					.map((ex: any) => ({
						id: ex.id || crypto.randomUUID(),
						name: ex.name,
						exclusion_type: 'city' as const, // Default to city exclusion
						value: ex.name, // Use name as value for city matching
						location: ex.location,
						created_at: ex.created_at || new Date().toISOString(),
						updated_at: ex.updated_at || new Date().toISOString()
					}));
				console.log(`  - Cleaned trip exclusions:`, tripExclusions.length, 'valid items');
				tripExclusions.forEach((ex: any, i: number) => {
					console.log(`    - Exclusion ${i}:`, ex);
				});
			}

			// Process home address to ensure it has the expected structure
			let processedHomeAddress: HomeAddress | null = null;
			if (homeAddress?.home_address) {
				const rawHomeAddress = homeAddress.home_address;
				if (typeof rawHomeAddress === 'string') {
					// If it's just a string, create a basic HomeAddress object
					processedHomeAddress = {
						display_name: rawHomeAddress,
						coordinates: undefined,
						address: undefined
					};
				} else if (typeof rawHomeAddress === 'object' && rawHomeAddress !== null) {
					// Handle the actual structure from the database
					const raw = rawHomeAddress as any;

					// Extract coordinates from the coordinates field
					let coordinates: { lat: number; lng: number } | undefined;
					if (raw.coordinates?.lat && raw.coordinates?.lng) {
						coordinates = {
							lat: raw.coordinates.lat,
							lng: raw.coordinates.lng
						};
					} else if (raw.lat && raw.lon) {
						// Fallback to lat/lon fields
						coordinates = {
							lat: raw.lat,
							lng: raw.lon
						};
					}

					// Extract address information
					let address: any = undefined;
					if (raw.address) {
						address = {
							city: raw.address.city,
							state: raw.address.state,
							country: raw.address.country,
							country_code: raw.address.country_code,
							municipality: raw.address.municipality
						};
					}

					processedHomeAddress = {
						display_name: raw.display_name || 'Unknown location',
						coordinates: coordinates,
						address: address
					};
				}

				// Debug logging for home address parsing
				console.log(`🏠 Home address parsing debug:`);
				console.log(`  - Raw home address:`, rawHomeAddress);
				console.log(`  - Processed home address:`, processedHomeAddress);
				if (processedHomeAddress?.address) {
					console.log(`  - Home address.city:`, processedHomeAddress.address.city);
					console.log(`  - Home address.country:`, processedHomeAddress.address.country);
				}
				if (processedHomeAddress?.coordinates) {
					console.log(`  - Home coordinates:`, processedHomeAddress.coordinates);
				}
			}

			return {
				homeAddress: processedHomeAddress,
				tripExclusions: tripExclusions,
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

	/**
	 * Get country names from a list of country codes
	 */
	private async getCountryNamesFromCodes(codes: string[]): Promise<string[]> {
		const countryNames: string[] = [];
		for (const code of codes) {
			const name = await this.getCountryNameFromCode(code);
			countryNames.push(name);
		}
		return countryNames;
	}

	/**
	 * Get country name from a country code using the full_country function
	 */
	private async getCountryNameFromCode(code: string): Promise<string> {
		try {
			const { data, error } = await this.supabase
				.rpc('full_country', { country: code });

			if (error) {
				console.warn(`⚠️ Could not find country name for code: ${code}`, error);
				return code; // Return code as fallback
			}
			return data || code; // Return name or code as fallback
		} catch (error) {
			console.error('❌ Error fetching country name from code:', error);
			return code; // Return code as fallback
		}
	}
}
