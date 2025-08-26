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
	maxDistanceFromHomeKm: number;
	minDataPointsPerDay: number;
	homeRadiusKm: number;
	clusteringRadiusMeters: number;
	minHomeDurationHours: number; // Minimum time user must be home to end a trip
	minHomeDataPoints: number; // Minimum number of data points that must be "home" to end a trip
}

export interface DateRange {
	startDate: string;
	endDate: string;
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

const DEFAULT_CONFIG: TripDetectionConfig = {
	minTripDurationHours: 24,
	maxDistanceFromHomeKm: 50,
	minDataPointsPerDay: 3,
	homeRadiusKm: 10,
	clusteringRadiusMeters: 1000,
	minHomeDurationHours: 1, // User must be home for at least 1 hour to end a trip
	minHomeDataPoints: 5 // User must have at least 5 "home" data points to end a trip
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

		// Step 1: Determine date ranges to process
		const dateRanges = providedDateRanges || (await this.determineDateRanges(userId));
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

		// Step 3: Process each date range
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

			const trips = await this.processDateRange(
				userId,
				dateRange,
				homeAddress,
				tripExclusions,
				finalConfig,
				language,
				(dayProgress: number, message: string) => {
					// Calculate overall progress based on current date range and day progress within it
					const dateRangeProgress = processedRanges / dateRanges.length;
					const dayProgressWithinRange = dayProgress / 100;
					const overallProgress =
						10 + Math.round((dateRangeProgress + dayProgressWithinRange / dateRanges.length) * 80);

					// Ensure progress never goes backwards (minimum 10% for initial setup)
					const minProgress = 10 + Math.round((processedRanges / dateRanges.length) * 80);
					const finalProgress = Math.max(overallProgress, minProgress);

					if (progressCallback) {
						progressCallback(finalProgress, message);
					}
				},
				jobId
			);

			allTrips.push(...trips);
			processedRanges++;
		}

		if (progressCallback) {
			progressCallback(95, `Detected ${allTrips.length} trips, preparing to save...`);
		}

		// Step 4: Save ALL trips to database. Exclusion cities are already treated as HOME in detection,
		// so we do not filter trips here to avoid dropping valid HOME-AWAY-HOME segments.
		const savedTrips = await this.saveTripsToDatabase(allTrips, userId);

		if (progressCallback) {
			progressCallback(100, `Trip detection completed: ${savedTrips.length} trips saved`);
		}

		console.log(`✅ Trip detection completed: ${savedTrips.length} trips detected`);
		return savedTrips;
	}

	/**
	 * Determine date ranges to process, excluding existing trips and suggested trips
	 */
	private async determineDateRanges(userId: string): Promise<DateRange[]> {
		// Get all tracker data dates
		const { data: trackerData } = await this.supabase
			.from('tracker_data')
			.select('recorded_at')
			.eq('user_id', userId)
			.not('country_code', 'is', null) // Ignore records with NULL country codes when determining trip date ranges
			.order('recorded_at', { ascending: true });

		if (!trackerData || trackerData.length === 0) {
			return [];
		}

		const allDates = trackerData.map(
			(point) => new Date(point.recorded_at).toISOString().split('T')[0]
		);
		const firstDate = allDates[0];
		const lastDate = allDates[allDates.length - 1];

		// Get existing trips and suggested trips to exclude their date ranges
		const { data: existingTrips } = await this.supabase
			.from('trips')
			.select('start_date, end_date')
			.eq('user_id', userId);

		const { data: existingSuggestedTrips } = await this.supabase
			.from('trips')
			.select('start_date, end_date')
			.eq('user_id', userId)
			.eq('status', 'pending');

		const excludedRanges = [...(existingTrips || []), ...(existingSuggestedTrips || [])];

		// Create date ranges, excluding existing trips
		const dateRanges: DateRange[] = [];
		let currentStart = firstDate;

		for (const excludedRange of excludedRanges) {
			const excludedStart = excludedRange.start_date;
			const excludedEnd = excludedRange.end_date;

			// If there's a gap before the excluded range, add it
			if (currentStart < excludedStart) {
				dateRanges.push({
					startDate: currentStart,
					endDate: new Date(new Date(excludedStart).getTime() - 24 * 60 * 60 * 1000)
						.toISOString()
						.split('T')[0]
				});
			}

			// Move current start to after the excluded range
			currentStart = new Date(new Date(excludedEnd).getTime() + 24 * 60 * 60 * 1000)
				.toISOString()
				.split('T')[0];
		}

		// Add the remaining range if any
		if (currentStart <= lastDate) {
			dateRanges.push({
				startDate: currentStart,
				endDate: lastDate
			});
		}

		return dateRanges.filter((range) => range.startDate <= range.endDate);
	}

	/**
	 * Filter out trips that are primarily spent in excluded cities (>50% of time)
	 */
	private filterTripsInExcludedCities(
		trips: DetectedTrip[],
		tripExclusions: TripExclusion[]
	): DetectedTrip[] {
		return trips.filter((trip) => {
			// Get all visited locations for this trip
			const visitedLocations = trip.metadata?.visitedLocations || [];

			if (visitedLocations.length === 0) {
				console.log(`⚠️ Trip "${trip.title}" has no visited locations, keeping it`);
				return true;
			}

			// Calculate total duration and duration in excluded cities
			let totalDuration = 0;
			let excludedDuration = 0;

			for (const location of visitedLocations) {
				totalDuration += location.durationHours;

				// Check if this location is in an excluded city
				const isExcluded = tripExclusions.some((exclusion) => {
					const exclusionCityName =
						exclusion.location?.address?.city ||
						exclusion.location?.address?.town ||
						exclusion.location?.address?.village ||
						exclusion.location?.address?.municipality;

					return (
						exclusionCityName &&
						location.cityName &&
						location.cityName.toLowerCase().includes(exclusionCityName.toLowerCase())
					);
				});

				if (isExcluded) {
					excludedDuration += location.durationHours;
					console.log(
						`🚫 Trip "${trip.title}": Location "${location.cityName}" is excluded, adding ${location.durationHours}h to excluded duration`
					);
				}
			}

			// Calculate percentage of time spent in excluded cities
			const excludedPercentage = totalDuration > 0 ? (excludedDuration / totalDuration) * 100 : 0;

			// Keep trip if less than 50% of time was spent in excluded cities
			if (excludedPercentage >= 50) {
				console.log(
					`❌ Removing trip "${trip.title}" - ${excludedPercentage.toFixed(1)}% of time spent in excluded cities`
				);
				return false;
			} else {
				console.log(
					`✅ Keeping trip "${trip.title}" - ${excludedPercentage.toFixed(1)}% of time spent in excluded cities`
				);
				return true;
			}
		});
	}

	/**
	 * Get user's home address, trip exclusions, and language preference
	 */
	private async getUserSettings(userId: string): Promise<{
		homeAddress: HomeAddress | null;
		tripExclusions: TripExclusion[];
		language: string;
	}> {
		// Get home address from user_profiles and trip exclusions/language from user_preferences
		console.log(`🔍 Fetching user settings for user: ${userId}`);

		const [homeAddressResult, userPreferencesResult] = await Promise.all([
			this.supabase.from('user_profiles').select('home_address').eq('id', userId).single(),
			this.supabase
				.from('user_preferences')
				.select('trip_exclusions, language')
				.eq('id', userId)
				.single()
		]);

		console.log(`🔍 Home address result:`, homeAddressResult);
		console.log(`🔍 User preferences result:`, userPreferencesResult);

		if (homeAddressResult.error) {
			console.error('❌ Error fetching user profile (home address):', homeAddressResult.error);
		}

		if (userPreferencesResult.error) {
			console.error('❌ Error fetching user preferences:', userPreferencesResult.error);
		}

		// Parse home address if it's a JSON string
		let homeAddress = homeAddressResult.data?.home_address || null;
		if (homeAddress && typeof homeAddress === 'string') {
			try {
				homeAddress = JSON.parse(homeAddress);
			} catch (error) {
				console.error('❌ Error parsing home address JSON:', error);
				homeAddress = null;
			}
		}

		// Fallback: infer home from historical data to enable HOME-AWAY-HOME when no home is configured
		if (!homeAddress) {
			console.log('🏠 No configured home address found – inferring from tracker data...');
			homeAddress = await this.inferHomeAddress(userId);
			if (homeAddress) {
				console.log(
					`✅ Inferred home: ${homeAddress.display_name} (${homeAddress.coordinates?.lat?.toFixed(4)}, ${homeAddress.coordinates?.lng?.toFixed(4)})`
				);
			} else {
				console.log('⚠️ Unable to infer home address from data');
			}
		}

		// Parse trip exclusions - they might be stored as JSON string
		let tripExclusions = userPreferencesResult.data?.trip_exclusions || [];

		// If it's a string, try to parse it as JSON
		if (typeof tripExclusions === 'string') {
			try {
				tripExclusions = JSON.parse(tripExclusions);
				console.log(`🔧 Parsed trip exclusions from JSON string`);
			} catch (error) {
				console.error('❌ Error parsing trip exclusions JSON:', error);
				tripExclusions = [];
			}
		}

		// Get user language preference, default to 'en'
		const language = userPreferencesResult.data?.language || 'en';

		console.log(`🚫 Raw trip exclusions data:`, userPreferencesResult.data);
		console.log(
			`🚫 Trip exclusions loaded:`,
			tripExclusions.map((ex: TripExclusion) => {
				const cityName =
					ex.location?.address?.city ||
					ex.location?.address?.town ||
					ex.location?.address?.village ||
					ex.location?.address?.municipality ||
					'Unknown';
				return `${ex.name}: "${cityName}" (${ex.location?.address?.country || 'Unknown'})`;
			})
		);
		console.log(`🌍 User language preference:`, language);

		return { homeAddress, tripExclusions, language };
	}

	/**
	 * Infer a reasonable home location from historical data by selecting the most frequently
	 * visited city across the dataset and averaging its coordinates.
	 */
	private async inferHomeAddress(userId: string): Promise<HomeAddress | null> {
		try {
			const { data: trackerData, error } = await this.supabase
				.from('tracker_data')
				.select('recorded_at, location, geocode')
				.eq('user_id', userId)
				.order('recorded_at', { ascending: true });

			if (error || !trackerData || trackerData.length === 0) {
				return null;
			}

			// Reduce to per-day visited location to avoid overweighting high-frequency days
			const dayMap = new Map<
				string,
				{ lat: number; lng: number; city: string; country?: string; cc?: string }
			>();
			for (const point of trackerData as TrackerDataPoint[]) {
				const dateStr = new Date(point.recorded_at).toISOString().split('T')[0];
				if (dayMap.has(dateStr)) continue;
				const loc = this.getVisitedLocation([point]);
				if (loc) {
					dayMap.set(dateStr, {
						lat: loc.coordinates.lat,
						lng: loc.coordinates.lng,
						city: loc.cityName,
						country: loc.countryName,
						cc: loc.countryCode
					});
				}
			}

			if (dayMap.size === 0) return null;

			// Count most common city
			const cityCounts = new Map<string, number>();
			for (const { city } of dayMap.values()) {
				cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
			}
			let bestCity = '';
			let bestCount = 0;
			for (const [city, count] of cityCounts) {
				if (count > bestCount) {
					bestCity = city;
					bestCount = count;
				}
			}

			if (!bestCity) return null;

			// Average coordinates for the chosen city
			let sumLat = 0;
			let sumLng = 0;
			let n = 0;
			let country = 'Unknown';
			let cc: string | undefined;
			for (const entry of dayMap.values()) {
				if (entry.city === bestCity) {
					sumLat += entry.lat;
					sumLng += entry.lng;
					n += 1;
					country = entry.country || country;
					cc = entry.cc || cc;
				}
			}

			if (n === 0) return null;

			const avgLat = sumLat / n;
			const avgLng = sumLng / n;

			return {
				display_name: `${bestCity}${country ? `, ${country}` : ''}`,
				coordinates: { lat: avgLat, lng: avgLng },
				address: {
					city: bestCity,
					country: country || undefined,
					country_code: cc?.toLowerCase()
				}
			};
		} catch {
			return null;
		}
	}

	/**
	 * Process a single date range for trip detection
	 */
	private async processDateRange(
		userId: string,
		dateRange: DateRange,
		homeAddress: HomeAddress | null,
		tripExclusions: TripExclusion[],
		config: TripDetectionConfig,
		language: string,
		progressCallback?: (progress: number, message: string) => void,
		jobId?: string
	): Promise<DetectedTrip[]> {
		// Initialize trip detection state
		let currentTripStart: string | null = null;
		let currentTripEnd: string | null = null;
		let currentTripLocations: VisitedLocation[] = [];
		let lastHomeDate: string | null = null;
		let consecutiveAwayDays = 0; // Track consecutive away days for debugging
		let consecutiveHomeDays = 0;
		let homeStartTime: Date | null = null; // Track when user started being home
		let totalHomeHours = 0; // Track total hours user has been home
		let totalHomeDataPoints = 0; // Track total "home" data points
		const detectedTrips: DetectedTrip[] = [];

		// Process data day by day using streaming
		const startDate = new Date(dateRange.startDate);
		const endDate = new Date(dateRange.endDate);
		const currentDate = new Date(startDate);
		const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
		let processedDays = 0;

		while (currentDate <= endDate) {
			// Check for cancellation every 10 days or at the start
			if (processedDays % 10 === 0 || processedDays === 0) {
				await checkJobCancellation(jobId);
			}

			const dateStr = currentDate.toISOString().split('T')[0];

			// Update progress every day or at the end
			if (processedDays % 1 === 0 || currentDate >= endDate) {
				const progress = Math.round((processedDays / totalDays) * 100);
				if (progressCallback) {
					progressCallback(
						progress,
						`Processing day ${dateStr} (${processedDays}/${totalDays} days)`
					);
				}
				// Add a small delay to make progress updates more visible
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			// Fetch data for this specific day
			const dayData = await this.fetchDataForDay(userId, dateStr);

			if (dayData.length > 0) {
				// Determine if user is home on this day
				const isHome = this.isUserHome(dayData, homeAddress, tripExclusions, config);
				const visitedLocation = this.getVisitedLocation(dayData);

				console.log(
					`📅 ${dateStr}: ${isHome ? '🏠 HOME' : '✈️ AWAY'} (${dayData.length} data points)`
				);

				if (isHome) {
					// User is home today
					lastHomeDate = dateStr;
					consecutiveHomeDays++;
					consecutiveAwayDays = 0;

					// Count home data points for this day (home means within radius OR in home/exclusion city)
					const homeCityName = (homeAddress?.address?.city || '').toLowerCase();
					const homeDataPointsToday = dayData.filter((point) => {
						// Check radius
						let isHome = false;
						if (homeAddress?.coordinates) {
							const distance =
								haversineDistance(
									point.location.coordinates[1],
									point.location.coordinates[0],
									homeAddress.coordinates.lat,
									homeAddress.coordinates.lng
								) / 1000;
							if (distance <= config.homeRadiusKm) isHome = true;
						}
						const { cityName } = this.extractDestinationInfo(point);
						const inHomeCity = cityName && homeCityName && cityName.toLowerCase() === homeCityName;
						const inExcludedCity =
							cityName &&
							tripExclusions.some((exclusion) => {
								const exclusionCityName =
									exclusion.location?.address?.city ||
									exclusion.location?.address?.town ||
									exclusion.location?.address?.village ||
									exclusion.location?.address?.municipality;
								return (
									exclusionCityName &&
									cityName.toLowerCase().includes(exclusionCityName.toLowerCase())
								);
							});
						return isHome || inHomeCity || inExcludedCity;
					}).length;

					totalHomeDataPoints += homeDataPointsToday;

					// Start tracking home time if not already tracking
					if (homeStartTime === null) {
						homeStartTime = new Date(currentDate);
						console.log(`🏠 Started tracking home time: ${dateStr}`);
					}

					// Calculate total home hours (assuming 24 hours per day for simplicity)
					// In a more sophisticated implementation, you'd calculate actual hours from GPS data
					totalHomeHours = consecutiveHomeDays * 24;

					// End trip as soon as first HOME day after being away has >= minHomeDataPoints
					if (
						currentTripStart &&
						currentTripLocations.length > 0 &&
						homeDataPointsToday >= config.minHomeDataPoints
					) {
						// Set the end date to the last day we were away (before coming home)
						const tripEndDate = new Date(currentDate);
						tripEndDate.setDate(tripEndDate.getDate() - consecutiveHomeDays);
						currentTripEnd = tripEndDate.toISOString().split('T')[0];

						console.log(
							`🏁 Ending trip: ${currentTripStart} to ${currentTripEnd} (${currentTripLocations.length} locations) - User home for ${totalHomeHours} hours with ${totalHomeDataPoints} home data points`
						);

						// Only consider it a trip if we've been away for at least 1 day
						if (currentTripLocations.length >= 1) {
							const trip = await this.createTripFromLocations(
								currentTripStart,
								currentTripEnd,
								currentTripLocations,
								homeAddress,
								userId,
								language
							);
							if (trip) {
								detectedTrips.push(trip);
								console.log(`✅ Trip detected: ${trip.title}`);
							}
						}

						currentTripStart = null;
						currentTripEnd = null;
						currentTripLocations = [];
						homeStartTime = null;
						totalHomeHours = 0;
						totalHomeDataPoints = 0;
					}
				} else {
					// User is away today
					consecutiveAwayDays++;
					consecutiveHomeDays = 0;

					// Reset home tracking when user goes away
					homeStartTime = null;
					totalHomeHours = 0;
					totalHomeDataPoints = 0;

					if (!currentTripStart) {
						// Start of a new trip - use the last home date as start
						// Only start a trip if we have a proper home-away pattern
						if (lastHomeDate) {
							currentTripStart = lastHomeDate;
							console.log(
								`🚀 Starting trip: ${currentTripStart} (last home: ${lastHomeDate}, consecutive away: ${consecutiveAwayDays})`
							);
						} else {
							// If no last home date, use current date as start
							currentTripStart = dateStr;
							console.log(
								`🚀 Starting trip without known home: ${currentTripStart} (consecutive away: ${consecutiveAwayDays})`
							);
						}
					}

					// Add this day's location to the trip
					if (visitedLocation) {
						currentTripLocations.push(visitedLocation);
						console.log(
							`📍 Added location: ${visitedLocation.cityName}, ${visitedLocation.countryName}`
						);
					}
				}
			} else {
				console.log(`📅 ${dateStr}: No data`);
			}

			// Move to next day
			currentDate.setDate(currentDate.getDate() + 1);
			processedDays++;
		}

		// Handle case where trip ends without returning home
		// Create this trip if we have a proper home-away pattern, even without returning home
		if (currentTripStart && currentTripLocations.length > 0) {
			console.log(
				`🏁 Ending incomplete trip: ${currentTripStart} to ${endDate.toISOString().split('T')[0]} (${currentTripLocations.length} locations)`
			);

			const trip = await this.createTripFromLocations(
				currentTripStart,
				endDate.toISOString().split('T')[0],
				currentTripLocations,
				homeAddress,
				userId,
				language
			);
			if (trip) {
				detectedTrips.push(trip);
				console.log(`✅ Trip detected: ${trip.title}`);
			}
		}

		console.log(`✅ Detected ${detectedTrips.length} trips in date range`);
		return detectedTrips;
	}

	/**
	 * Fetch data for a specific day
	 */
	private async fetchDataForDay(userId: string, dateStr: string): Promise<TrackerDataPoint[]> {
		const { data: trackerData, error } = await this.supabase
			.from('tracker_data')
			.select('*')
			.eq('user_id', userId)
			.gte('recorded_at', `${dateStr}T00:00:00Z`)
			.lt('recorded_at', `${dateStr}T23:59:59Z`)
			.not('country_code', 'is', null) // Ignore records with NULL country codes when determining trip dates
			.order('recorded_at', { ascending: true });

		if (error) {
			console.error(`❌ Error fetching data for ${dateStr}:`, error);
			return [];
		}

		return trackerData || [];
	}

	/**
	 * Determine if user is home on a given day
	 */
	private isUserHome(
		dayData: TrackerDataPoint[],
		homeAddress: HomeAddress | null,
		tripExclusions: TripExclusion[],
		config: TripDetectionConfig
	): boolean {
		// Check if any location is within home radius
		if (homeAddress?.coordinates) {
			for (const point of dayData) {
				const distance =
					haversineDistance(
						point.location.coordinates[1], // lat
						point.location.coordinates[0], // lng
						homeAddress.coordinates.lat,
						homeAddress.coordinates.lng
					) / 1000; // Convert to km

				if (distance <= config.homeRadiusKm) {
					return true;
				}
			}
		}

		// Check if any location is in excluded cities (treat as home)
		for (const point of dayData) {
			const { cityName } = this.extractDestinationInfo(point);
			if (cityName) {
				console.log(`🔍 Checking city "${cityName}" against trip exclusions...`);
				const matchingExclusion = tripExclusions.find((exclusion) => {
					const exclusionCityName =
						exclusion.location?.address?.city ||
						exclusion.location?.address?.town ||
						exclusion.location?.address?.village ||
						exclusion.location?.address?.municipality;

					return (
						exclusionCityName &&
						cityName &&
						cityName.toLowerCase().includes(exclusionCityName.toLowerCase())
					);
				});

				if (matchingExclusion) {
					const exclusionCityName =
						matchingExclusion.location?.address?.city ||
						matchingExclusion.location?.address?.town ||
						matchingExclusion.location?.address?.village ||
						matchingExclusion.location?.address?.municipality;
					console.log(
						`🏠 User considered home due to trip exclusion: "${cityName}" matches exclusion "${exclusionCityName}"`
					);
					return true;
				} else {
					console.log(`❌ City "${cityName}" does not match any trip exclusions`);
				}
			}
		}

		return false;
	}

	/**
	 * Extract destination information from a tracker data point
	 */
	private extractDestinationInfo(point: TrackerDataPoint): {
		cityName: string | null;
		countryCode: string | null;
		countryName: string | null;
		stateName: string | null;
	} {
		if (!point.geocode)
			return { cityName: null, countryCode: null, countryName: null, stateName: null };

		let geocode;
		try {
			geocode = typeof point.geocode === 'string' ? JSON.parse(point.geocode) : point.geocode;
		} catch {
			return { cityName: null, countryCode: null, countryName: null, stateName: null };
		}

		if (!geocode || typeof geocode !== 'object') {
			return { cityName: null, countryCode: null, countryName: null, stateName: null };
		}

		// Try to extract city name from various possible locations
		const cityName =
			geocode?.address?.city ||
			geocode?.city ||
			geocode?.address?.town ||
			geocode?.town ||
			geocode?.address?.village ||
			geocode?.village ||
			geocode?.address?.municipality ||
			geocode?.municipality ||
			geocode?.address?.suburb ||
			geocode?.suburb ||
			null;

		// Extract country information
		const countryCode = geocode?.address?.country_code || geocode?.country_code || null;
		const countryName = geocode?.address?.country || geocode?.country || null;
		const stateName = geocode?.address?.state || geocode?.state || null;

		return {
			cityName: cityName ? cityName.trim() : null,
			countryCode: countryCode ? countryCode.toUpperCase() : null,
			countryName: countryName ? countryName.trim() : null,
			stateName: stateName ? stateName.trim() : null
		};
	}

	/**
	 * Extract country name from a tracker data point
	 */
	private extractCountryName(point: TrackerDataPoint): string | null {
		if (!point.geocode) return null;

		let geocode;
		try {
			geocode = typeof point.geocode === 'string' ? JSON.parse(point.geocode) : point.geocode;
		} catch {
			return null;
		}

		if (!geocode || typeof geocode !== 'object') {
			return null;
		}

		return geocode?.address?.country || geocode?.country || null;
	}

	/**
	 * Get visited location information for a day
	 */
	private getVisitedLocation(dayData: TrackerDataPoint[]): VisitedLocation | null {
		if (dayData.length === 0) return null;

		// Find the most common city and country for this day
		const destinationInfos = dayData.map((point) => this.extractDestinationInfo(point));

		const cityNames = destinationInfos
			.map((info) => info.cityName)
			.filter((city) => city && city !== 'Unknown' && city !== 'Unknown Location');

		const countryCodes = destinationInfos
			.map((info) => info.countryCode)
			.filter((code) => code && code !== 'Unknown');

		const countryNames = destinationInfos
			.map((info) => info.countryName)
			.filter((country) => country && country !== 'Unknown');

		const mostCommonCity = this.getMostCommonValue(cityNames);
		const mostCommonCountryCode = this.getMostCommonValue(countryCodes);
		const mostCommonCountry = this.getMostCommonValue(countryNames);

		if (!mostCommonCity && !mostCommonCountry) {
			return null;
		}

		// Calculate average coordinates
		const avgLat =
			dayData.reduce((sum, point) => sum + point.location.coordinates[1], 0) / dayData.length;
		const avgLng =
			dayData.reduce((sum, point) => sum + point.location.coordinates[0], 0) / dayData.length;

		return {
			cityName: mostCommonCity || 'Unknown City',
			countryName: mostCommonCountry || 'Unknown Country',
			countryCode: mostCommonCountryCode || 'UN',
			durationHours: 24, // One day
			dataPoints: dayData.length,
			coordinates: { lat: avgLat, lng: avgLng }
		};
	}

	/**
	 * Create a trip from visited locations
	 */
	private async createTripFromLocations(
		startDate: string,
		endDate: string,
		visitedLocations: VisitedLocation[],
		homeAddress: HomeAddress | null,
		userId: string,
		language: string
	): Promise<DetectedTrip | null> {
		if (visitedLocations.length === 0) return null;

		// Calculate trip duration
		const start = new Date(startDate);
		const end = new Date(endDate);
		const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

		if (durationHours < 24) {
			return null; // Skip trips shorter than 24 hours
		}

		// Analyze visited locations
		const visitedCities = [...new Set(visitedLocations.map((loc) => loc.cityName))];
		const visitedCountries = [...new Set(visitedLocations.map((loc) => loc.countryName))];
		const visitedCountryCodes = [...new Set(visitedLocations.map((loc) => loc.countryCode))];

		// Find primary location (most time spent)
		const primaryLocation = visitedLocations.reduce((prev, current) =>
			prev.durationHours > current.durationHours ? prev : current
		);

		// Get home country code for comparison
		const homeCountryCode = homeAddress?.address?.country_code?.toUpperCase() || null;

		// Determine trip type and title
		const isMultiCountryTrip = visitedCountryCodes.length > 1;
		const isMultiCityTrip = visitedCities.length > 1;
		const isInternationalTrip =
			visitedCountryCodes.length > 1 ||
			(visitedCountryCodes.length === 1 &&
				homeCountryCode &&
				primaryLocation.countryCode !== homeCountryCode);

		// Find the most visited city/country for better titles
		const cityTimeMap = new Map<string, number>();
		const countryTimeMap = new Map<string, number>();

		for (const location of visitedLocations) {
			const cityKey = `${location.cityName}, ${location.countryName}`;
			cityTimeMap.set(cityKey, (cityTimeMap.get(cityKey) || 0) + location.durationHours);
			countryTimeMap.set(
				location.countryName,
				(countryTimeMap.get(location.countryName) || 0) + location.durationHours
			);
		}

		// Find the most visited city and country
		let mostVisitedCity = '';
		let mostVisitedCityHours = 0;
		for (const [city, hours] of cityTimeMap) {
			if (hours > mostVisitedCityHours) {
				mostVisitedCity = city;
				mostVisitedCityHours = hours;
			}
		}

		let mostVisitedCountry = '';
		let mostVisitedCountryHours = 0;
		for (const [country, hours] of countryTimeMap) {
			if (hours > mostVisitedCountryHours) {
				mostVisitedCountry = country;
				mostVisitedCountryHours = hours;
			}
		}

		// Check if user spent more than 50% of time in one city
		const totalTripHours = visitedLocations.reduce((sum, loc) => sum + loc.durationHours, 0);
		const cityPercentage = mostVisitedCityHours / totalTripHours;
		const hasPrimaryCity = cityPercentage > 0.5;

		let title: string;
		let tripType: 'city' | 'country' | 'multi-city' | 'multi-country' = 'city';

		if (isInternationalTrip) {
			if (isMultiCountryTrip) {
				title = `Multi-country trip: ${visitedCountries.slice(0, 3).join(' → ')}${visitedCountries.length > 3 ? '...' : ''}`;
				tripType = 'multi-country';
			} else {
				// International trip to one country
				if (hasPrimaryCity) {
					const [cityName, countryName] = mostVisitedCity.split(', ');
					title = `Trip to ${countryName}, ${cityName}`;
				} else {
					title = `Trip to ${primaryLocation.countryName}`;
				}
				tripType = 'country';
			}
		} else {
			if (isMultiCityTrip) {
				title = `Multi-city trip: ${visitedCities.slice(0, 3).join(' → ')}${visitedCities.length > 3 ? '...' : ''}`;
				tripType = 'multi-city';
			} else {
				title = `Trip to ${primaryLocation.cityName}`;
				tripType = 'city';
			}
		}

		// Calculate total distance traveled during the trip
		let totalDistanceTraveled = 0;

		// Get all GPS points for this trip period
		const { data: tripPoints, error: pointsError } = await this.supabase.rpc(
			'get_user_tracking_data',
			{
				user_uuid: userId,
				start_date: startDate,
				end_date: endDate
			}
		);

		if (!pointsError && tripPoints && tripPoints.length > 0) {
			// Check if points have distance column (from updated get_user_tracking_data function)
			const hasDistanceColumn = tripPoints.some(
				(point: TrackingDataPoint) => typeof point.distance === 'number'
			);

			if (hasDistanceColumn) {
				// Use pre-calculated distances from database
				totalDistanceTraveled = tripPoints.reduce((total: number, point: TrackingDataPoint) => {
					const pointDistance =
						typeof point.distance === 'number' && isFinite(point.distance) ? point.distance : 0;
					return total + pointDistance / 1000; // Convert meters to kilometers
				}, 0);
			} else {
				// Fallback to manual calculation for backward compatibility
				for (let i = 1; i < tripPoints.length; i++) {
					const prev = tripPoints[i - 1];
					const curr = tripPoints[i];

					if (prev.lat && prev.lon && curr.lat && curr.lon) {
						const segmentDistance =
							haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon) / 1000; // Convert to km
						totalDistanceTraveled += segmentDistance;
					}
				}
			}
		}

		// Also calculate distance from home to destination for reference
		let distanceFromHome = 0;
		if (homeAddress?.coordinates) {
			distanceFromHome =
				haversineDistance(
					homeAddress.coordinates.lat,
					homeAddress.coordinates.lng,
					primaryLocation.coordinates.lat,
					primaryLocation.coordinates.lng
				) / 1000; // Convert to km
		}

		return {
			id: '', // Will be set when saved to database
			user_id: '', // Will be set when saved to database
			startDate,
			endDate,
			title,
			description: translateServer(
				'tripDetection.autoGenerated',
				{
					locationCount: visitedLocations.length,
					plural: getPluralSuffix(visitedLocations.length, language)
				},
				language
			),
			location: {
				type: 'Point',
				coordinates: [primaryLocation.coordinates.lng, primaryLocation.coordinates.lat]
			},
			cityName: primaryLocation.cityName,

			dataPoints: visitedLocations.reduce((sum, loc) => sum + loc.dataPoints, 0),
			overnightStays: visitedLocations.length,
			distanceFromHome,
			status: 'pending',
			metadata: {
				totalDurationHours: durationHours,
				visitedCities,
				visitedCountries,
				visitedCountryCodes,
				visitedLocations,
				isMultiCountryTrip,
				isMultiCityTrip,
				tripType,
				primaryLocation: primaryLocation.cityName,
				primaryCountry: primaryLocation.countryName,
				primaryCountryCode: primaryLocation.countryCode,
				mostVisitedCountry,
				homeCity: this.extractCityNameFromHomeAddress(homeAddress),
				homeCountry: this.extractCountryNameFromHomeAddress(homeAddress),
				homeCountryCode: homeAddress?.address?.country_code?.toUpperCase() || 'UN',
				isInternationalTrip,
				distance_traveled: totalDistanceTraveled,
				distance_from_home: distanceFromHome
			},
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};
	}

	/**
	 * Extract city name from home address
	 */
	private extractCityNameFromHomeAddress(homeAddress: HomeAddress | null): string {
		if (!homeAddress?.address) return 'Unknown';
		return (
			homeAddress.address.city ||
			homeAddress.address.town ||
			homeAddress.address.village ||
			'Unknown'
		);
	}

	/**
	 * Extract country name from home address
	 */
	private extractCountryNameFromHomeAddress(homeAddress: HomeAddress | null): string {
		if (!homeAddress?.address) return 'Unknown';
		return homeAddress.address.country || 'Unknown';
	}

	/**
	 * Get most common value from array
	 */
	private getMostCommonValue<T>(array: T[]): T | undefined {
		if (array.length === 0) return undefined;

		const counts = new Map<T, number>();
		let maxCount = 0;
		let mostCommon: T | undefined;

		for (const item of array) {
			const count = (counts.get(item) || 0) + 1;
			counts.set(item, count);

			if (count > maxCount) {
				maxCount = count;
				mostCommon = item;
			}
		}

		return mostCommon;
	}

	/**
	 * Save trips to database
	 */
	private async saveTripsToDatabase(
		trips: DetectedTrip[],
		userId: string
	): Promise<DetectedTrip[]> {
		if (trips.length === 0) return [];

		const tripsToSave = trips.map((trip) => ({
			user_id: userId,
			start_date: trip.startDate,
			end_date: trip.endDate,
			title: trip.title,
			description: trip.description,
			status: 'pending', // All detected trips are pending suggestions
			labels: ['suggested'], // Mark as suggested
			metadata: {
				...trip.metadata,
				suggested: true,
				point_count: trip.dataPoints,
				distance_traveled: trip.distanceFromHome,
				visited_places_count: trip.dataPoints,
				overnight_stays: trip.overnightStays,
				location: trip.location,
				city_name: trip.cityName,
				confidence: 0.8 // Default confidence for detected trips
			}
		}));

		const { data: savedTrips, error } = await this.supabase
			.from('trips')
			.insert(tripsToSave)
			.select();

		if (error) {
			console.error('❌ Error saving trips to database:', error);
			return [];
		}

		console.log(`✅ Saved ${savedTrips?.length || 0} suggested trips to database`);
		return savedTrips || [];
	}
}
