import { createWorkerClient } from '$lib/core/supabase/worker-client';
import { haversineDistance } from '../utils';
import { JobQueueService } from './queue/job-queue.service.worker';
import { JobProcessorService } from './queue/job-processor.service';
import type {
	SuggestedTrip,
	OvernightStay,
	TripDetectionConfig,
	TrackerDataPoint,
	TripExclusion,
	HomeAddress,
	ImageGenerationJob
} from '../types/trip-generation.types';

const DEFAULT_CONFIG: TripDetectionConfig = {
	minTripDurationHours: 12,
	maxDistanceFromHomeKm: 50,
	minDataPointsPerDay: 3,
	overnightHoursStart: 20, // 8 PM
	overnightHoursEnd: 8, // 8 AM
	minOvernightHours: 6,
	homeRadiusKm: 50,
	clusteringRadiusMeters: 1000,
	minConfidenceScore: 0.7
};

export class EnhancedTripDetectionService {
	private supabase = createWorkerClient();

	/**
	 * Detect sleep locations from tracker data - where the user slept each night
	 * Simplified approach: just determine if they were at home or away from home
	 */
	async detectSleepLocations(
		trackerData: TrackerDataPoint[],
		homeAddress: HomeAddress | null,
		exclusions: TripExclusion[],
		config: Partial<TripDetectionConfig> = {},
		jobId?: string,
		currentRange?: number,
		totalRanges?: number
	): Promise<OvernightStay[]> {
		console.log(`😴 Starting sleep location detection for ${trackerData.length} data points`);
		const startTime = Date.now();

		const finalConfig = { ...DEFAULT_CONFIG, ...config };
		const sleepLocations: OvernightStay[] = [];

		// Group data by day
		console.log(`📅 Grouping ${trackerData.length} data points by day...`);
		const groupingStartTime = Date.now();
		const dailyGroups = this.groupDataByDay(trackerData);
		const groupingTime = Date.now() - groupingStartTime;
		console.log(`📅 Grouped into ${Object.keys(dailyGroups).length} days in ${groupingTime}ms`);

		let processedDays = 0;
		let skippedDays = 0;
		let locationFindingTime = 0;
		let cityNameTime = 0;
		let distanceCalculationTime = 0;

		for (const [date, dayData] of Object.entries(dailyGroups)) {
			processedDays++;
			console.log(
				`📅 Processing day ${processedDays}/${Object.keys(dailyGroups).length}: ${date} (${dayData.length} data points)`
			);

			// Check for job cancellation every 10 days or if jobId is provided
			if (jobId && (processedDays % 10 === 0 || processedDays === 1)) {
				try {
					await JobProcessorService['checkJobCancellation'](jobId);
				} catch (error) {
					if (error instanceof Error && error.message === 'Job was cancelled') {
						console.log(`🛑 Sleep location detection cancelled for job ${jobId}`);
						throw error;
					}
				}
			}

			// Update job progress with day processing information if jobId is provided
			if (jobId) {
				const totalDays = Object.keys(dailyGroups).length;
				const baseProgress =
					currentRange && totalRanges ? 20 + (currentRange * 60) / totalRanges : 20;
				const dayProgress = (processedDays * 20) / totalDays;
				const progress = Math.min(100, Math.round(baseProgress + dayProgress));

				await JobQueueService.updateJobProgress(jobId, progress, {
					message: `Processing day ${processedDays}/${totalDays}: ${date} (${dayData.length} data points)`,
					currentDay: processedDays,
					totalDays: totalDays,
					currentDate: date,
					dataPointsInDay: dayData.length,
					currentRange: currentRange || 1,
					totalRanges: totalRanges || 1
				});
			}

			if (dayData.length < finalConfig.minDataPointsPerDay) {
				console.log(
					`⚠️ Skipping ${date}: insufficient data points (${dayData.length} < ${finalConfig.minDataPointsPerDay})`
				);
				skippedDays++;
				continue;
			}

			// Find the most common location for this day (where they likely slept)
			const locationStartTime = Date.now();
			const mainLocation = this.findMainLocation(dayData, finalConfig.clusteringRadiusMeters);
			const locationTime = Date.now() - locationStartTime;
			locationFindingTime += locationTime;

			if (!mainLocation) {
				console.log(`⚠️ No main location found for ${date} in ${locationTime}ms`);
				skippedDays++;
				continue;
			}
			console.log(`📍 Found main location for ${date} in ${locationTime}ms`);

			// Get city name from existing geocode data
			const cityStartTime = Date.now();
			const cityName = this.getCityNameFromGeocodeData(dayData);
			const cityTime = Date.now() - cityStartTime;
			cityNameTime += cityTime;

			console.log(`🏙️ City name extraction for ${date}: ${cityTime}ms, city: ${cityName}`);

			// Initialize variables that will be used in logging
			let distanceFromHome = 0;
			let isSameCityAsHome = false;
			let isAtHome = false;

			// Exclusion list: treat excluded cities as 'home'
			if (
				cityName &&
				exclusions.some(
					(exclusion) =>
						exclusion.exclusion_type === 'city' &&
						cityName.toLowerCase().includes(exclusion.value.toLowerCase())
				)
			) {
				isAtHome = true;
				console.log(
					`🚫 Exclusion list: City '${cityName}' is in the exclusion list. Treating as 'home' and skipping further checks.`
				);
			} else {
				// Check if the detected city matches the home city (from address.city field)
				let hasHomeCity = false;
				const hasLocationCity = !!cityName;
				if (homeAddress?.address?.city && cityName) {
					const homeCity = homeAddress.address.city;
					isSameCityAsHome =
						cityName.toLowerCase().includes(homeCity.toLowerCase()) ||
						homeCity.toLowerCase().includes(cityName.toLowerCase());
					hasHomeCity = true;
					console.log(
						`🏠 City comparison for ${date}: detected="${cityName}", home="${homeCity}" (from address.city), isSameCity: ${isSameCityAsHome}`
					);
				} else if (homeAddress?.address?.town && cityName) {
					// Fallback to town if city is not available
					const homeTown = homeAddress.address.town;
					isSameCityAsHome =
						cityName.toLowerCase().includes(homeTown.toLowerCase()) ||
						homeTown.toLowerCase().includes(cityName.toLowerCase());
					hasHomeCity = true;
					console.log(
						`🏠 Town comparison for ${date}: detected="${cityName}", home="${homeTown}" (from address.town), isSameCity: ${isSameCityAsHome}`
					);
				} else if (homeAddress?.address?.village && cityName) {
					// Fallback to village if city and town are not available
					const homeVillage = homeAddress.address.village;
					isSameCityAsHome =
						cityName.toLowerCase().includes(homeVillage.toLowerCase()) ||
						homeVillage.toLowerCase().includes(homeVillage.toLowerCase());
					hasHomeCity = true;
					console.log(
						`🏠 Village comparison for ${date}: detected="${cityName}", home="${homeVillage}" (from address.village), isSameCity: ${isSameCityAsHome}`
					);
				} else if (homeAddress?.address?.municipality && cityName) {
					// Fallback to municipality if other fields are not available
					const homeMunicipality = homeAddress.address.municipality;
					isSameCityAsHome =
						cityName.toLowerCase().includes(homeMunicipality.toLowerCase()) ||
						homeMunicipality.toLowerCase().includes(cityName.toLowerCase());
					hasHomeCity = true;
					console.log(
						`🏠 Municipality comparison for ${date}: detected="${cityName}", home="${homeMunicipality}" (from address.municipality), isSameCity: ${isSameCityAsHome}`
					);
				} else {
					console.log(
						`🏠 No city/town/village/municipality found in home address for comparison with "${cityName}"`
					);
				}

				// If both have city info, skip distance calculation entirely
				if (hasHomeCity && hasLocationCity) {
					isAtHome = isSameCityAsHome;
					console.log(
						`🏠 Fast path: Both have city info. isAtHome=${isAtHome} (city match: ${isSameCityAsHome}) - skipping distance calculation`
					);
				} else if (homeAddress && homeAddress.coordinates) {
					// Only calculate distance if city info is missing on either side
					const distanceStartTime = Date.now();
					distanceFromHome =
						haversineDistance(
							mainLocation.coordinates[1], // lat
							mainLocation.coordinates[0], // lng
							homeAddress.coordinates.lat,
							homeAddress.coordinates.lng
						) / 1000; // Convert from meters to km
					isAtHome = distanceFromHome <= 10; // 10km radius
					const distanceTime = Date.now() - distanceStartTime;
					distanceCalculationTime += distanceTime;
					console.log(
						`🏠 Distance calculation for ${date}: ${distanceTime}ms, distance: ${distanceFromHome.toFixed(2)}km, isAtHome: ${isAtHome}`
					);
				} else {
					console.log(
						`🏠 No home address or coordinates for ${date}, skipping distance calculation`
					);
				}
			}

			// Check if this location is excluded
			const isExcluded = exclusions.some((exclusion) => {
				if (exclusion.exclusion_type === 'city') {
					return cityName.toLowerCase().includes(exclusion.value.toLowerCase());
				}
				return false;
			});

			console.log(`🚫 Exclusion check for ${date}: isExcluded: ${isExcluded}`);

			// Only include if not excluded and not at home (we're looking for away-from-home trips)
			if (!isExcluded && !isAtHome) {
				sleepLocations.push({
					date,
					location: mainLocation,
					cityName,
					startTime: `${date}T00:00:00Z`,
					endTime: `${date}T23:59:59Z`,
					durationHours: 24,
					dataPoints: dayData.length,
					confidence: 0.8 // High confidence since we're only looking at sleep hours data
				});
				console.log(`✅ Added sleep location for ${date}: ${cityName}`);
			} else {
				const reason = isAtHome
					? `at home (distance: ${distanceFromHome.toFixed(2)}km${isSameCityAsHome ? ', same city' : ''})`
					: 'excluded';
				console.log(`⏭️ Skipped ${date}: ${reason}`);
			}
		}

		const totalTime = Date.now() - startTime;
		console.log(`😴 Sleep location detection completed in ${totalTime}ms:`);
		console.log(`  - Processed ${processedDays} days`);
		console.log(`  - Skipped ${skippedDays} days`);
		console.log(`  - Found ${sleepLocations.length} away-from-home sleep locations`);
		console.log(`  - Time breakdown:`);
		console.log(`    - Grouping: ${groupingTime}ms`);
		console.log(`    - Location finding: ${locationFindingTime}ms`);
		console.log(`    - Distance calculations: ${distanceCalculationTime}ms`);
		console.log(`    - City name extractions: ${cityNameTime}ms`);

		return sleepLocations;
	}

	/**
	 * Generate suggested trips from sleep locations using home → away → home pattern detection
	 */
	async generateSuggestedTrips(
		sleepLocations: OvernightStay[],
		homeAddress: HomeAddress | null,
		exclusions: TripExclusion[],
		config: Partial<TripDetectionConfig> = {}
	): Promise<SuggestedTrip[]> {
		const finalConfig = { ...DEFAULT_CONFIG, ...config };
		const suggestedTrips: SuggestedTrip[] = [];

		// Sort all sleep locations by date
		const sortedSleepLocations = sleepLocations.sort(
			(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
		);

		// Detect trip patterns: home → away → home
		const tripPatterns = this.detectTripPatterns(sortedSleepLocations, homeAddress, finalConfig);
		suggestedTrips.push(...tripPatterns);

		return suggestedTrips.sort((a, b) => b.confidence - a.confidence);
	}

	/**
	 * Check if a trip already exists to prevent duplicates
	 */
	private async isTripDuplicate(trip: SuggestedTrip, userId: string): Promise<boolean> {
		// Check for existing trips with same date range and similar location
		const { data: existingTrips, error } = await this.supabase
			.from('suggested_trips')
			.select('id, start_date, end_date, city_name, title')
			.eq('user_id', userId)
			.eq('start_date', trip.startDate)
			.eq('end_date', trip.endDate)
			.in('status', ['pending', 'approved']);

		if (error || !existingTrips) return false;

		// Check if any existing trip has the same title or similar city name
		return existingTrips.some((existingTrip) => {
			// Exact title match
			if (existingTrip.title === trip.title) return true;

			// Similar city name (for multi-city trips, check if same cities are involved)
			if (trip.metadata?.visitedCities && existingTrip.city_name) {
				const tripCities = trip.metadata.visitedCities as string[];
				return tripCities.some(
					(city) =>
						existingTrip.city_name?.toLowerCase().includes(city.toLowerCase()) ||
						city.toLowerCase().includes(existingTrip.city_name?.toLowerCase() || '')
				);
			}

			return false;
		});
	}

	/**
	 * Save suggested trips to database for review, filtering out duplicates
	 */
	async saveSuggestedTrips(suggestedTrips: SuggestedTrip[], userId: string): Promise<string[]> {
		const tripIds: string[] = [];

		for (const trip of suggestedTrips) {
			// Check for duplicates before saving
			const isDuplicate = await this.isTripDuplicate(trip, userId);
			if (isDuplicate) {
				console.log(`Skipping duplicate trip: ${trip.title} (${trip.startDate} - ${trip.endDate})`);
				continue;
			}

			const { data: savedTrip, error } = await this.supabase
				.from('suggested_trips')
				.insert({
					user_id: userId,
					start_date: trip.startDate,
					end_date: trip.endDate,
					title: trip.title,
					description: trip.description,
					location: `POINT(${trip.location.coordinates[0]} ${trip.location.coordinates[1]})`,
					city_name: trip.cityName,
					confidence: trip.confidence,
					data_points: trip.dataPoints,
					overnight_stays: trip.overnightStays,
					distance_from_home: trip.distanceFromHome,
					status: 'pending',
					metadata: trip.metadata
				})
				.select('id')
				.single();

			if (!error && savedTrip) {
				tripIds.push(savedTrip.id);
			}
		}

		return tripIds;
	}

	/**
	 * Queue image generation for approved trips
	 */
	async queueImageGeneration(suggestedTripIds: string[], userId: string): Promise<void> {
		// Get the suggested trips to extract city names
		const { data: trips, error } = await this.supabase
			.from('suggested_trips')
			.select('id, city_name')
			.in('id', suggestedTripIds);

		if (error || !trips) return;

		// Create image generation jobs with rate limiting
		const jobs: Partial<ImageGenerationJob>[] = trips.map((trip, index) => ({
			suggested_trip_id: trip.id,
			user_id: userId,
			cityName: trip.city_name,
			status: 'queued',
			priority: 1,
			attempts: 0,
			max_attempts: 3,
			// Stagger job creation to respect rate limits
			created_at: new Date(Date.now() + index * 2000).toISOString() // 2 second delay between jobs
		}));

		// Insert jobs in batches to avoid overwhelming the database
		const batchSize = 10;
		for (let i = 0; i < jobs.length; i += batchSize) {
			const batch = jobs.slice(i, i + batchSize);
			await this.supabase.from('image_generation_jobs').insert(batch);
		}
	}

	/**
	 * Approve suggested trips and create actual trips
	 */
	async approveSuggestedTrips(suggestedTripIds: string[], userId: string): Promise<string[]> {
		const approvedTripIds: string[] = [];

		// Update suggested trips status to approved
		await this.supabase
			.from('suggested_trips')
			.update({ status: 'approved' })
			.in('id', suggestedTripIds);

		// Get approved trips
		const { data: suggestedTrips, error } = await this.supabase
			.from('suggested_trips')
			.select('*')
			.in('id', suggestedTripIds);

		if (error || !suggestedTrips) return approvedTripIds;

		// Create actual trips
		for (const suggestedTrip of suggestedTrips) {
			const { data: actualTrip, error: createError } = await this.supabase
				.from('trips')
				.insert({
					user_id: userId,
					title: suggestedTrip.title,
					description: suggestedTrip.description,
					start_date: suggestedTrip.start_date,
					end_date: suggestedTrip.end_date,
					image_url: suggestedTrip.image_url,
					labels: ['auto-generated', 'suggested'],
					status: 'approved',
					metadata: {
						...suggestedTrip.metadata,
						suggested_trip_id: suggestedTrip.id,
						confidence: suggestedTrip.confidence,
						distance_from_home: suggestedTrip.distance_from_home
					}
				})
				.select('id')
				.single();

			if (!createError && actualTrip) {
				approvedTripIds.push(actualTrip.id);

				// Update suggested trip status to created
				await this.supabase
					.from('suggested_trips')
					.update({ status: 'created' })
					.eq('id', suggestedTrip.id);
			}
		}

		return approvedTripIds;
	}

	/**
	 * Reject suggested trips and store rejected date ranges to prevent future suggestions
	 */
	async rejectSuggestedTrips(suggestedTripIds: string[], userId: string): Promise<void> {
		// First, get the suggested trips to extract their date ranges
		const { data: suggestedTrips, error } = await this.supabase
			.from('suggested_trips')
			.select('*')
			.in('id', suggestedTripIds);

		if (error || !suggestedTrips) {
			console.error('Error fetching suggested trips for rejection:', error);
			return;
		}

		// Update suggested trips status to rejected
		await this.supabase
			.from('suggested_trips')
			.update({ status: 'rejected' })
			.in('id', suggestedTripIds);

		// Store rejected date ranges in trips table to prevent future suggestions
		for (const suggestedTrip of suggestedTrips) {
			const { error: insertError } = await this.supabase.from('trips').insert({
				user_id: userId,
				title: `Rejected: ${suggestedTrip.title}`,
				description: `Date range rejected by user: ${suggestedTrip.start_date} to ${suggestedTrip.end_date}`,
				start_date: suggestedTrip.start_date,
				end_date: suggestedTrip.end_date,
				status: 'rejected',
				labels: ['rejected-suggestion'],
				metadata: {
					original_suggested_trip_id: suggestedTrip.id,
					rejection_reason: 'user_rejected',
					original_confidence: suggestedTrip.confidence,
					original_city_name: suggestedTrip.city_name
				}
			});

			if (insertError) {
				console.error('Error storing rejected date range:', insertError);
			}
		}
	}

	// Private helper methods

	private groupDataByDay(trackerData: TrackerDataPoint[]): Record<string, TrackerDataPoint[]> {
		const groups: Record<string, TrackerDataPoint[]> = {};

		for (const point of trackerData) {
			const date = new Date(point.recorded_at).toISOString().split('T')[0];
			if (!groups[date]) groups[date] = [];
			groups[date].push(point);
		}

		return groups;
	}

	private findMainLocation(
		dataPoints: TrackerDataPoint[],
		clusteringRadius: number
	): { type: string; coordinates: number[] } | null {
		if (dataPoints.length === 0) return null;

		// Simple clustering: find the point with most neighbors within radius
		let bestPoint = dataPoints[0];
		let maxNeighbors = 0;

		for (const point of dataPoints) {
			const neighbors = dataPoints.filter((other) => {
				const distance = haversineDistance(
					point.location.coordinates[1],
					point.location.coordinates[0],
					other.location.coordinates[1],
					other.location.coordinates[0]
				);
				return distance <= clusteringRadius;
			});

			if (neighbors.length > maxNeighbors) {
				maxNeighbors = neighbors.length;
				bestPoint = point;
			}
		}

		return bestPoint.location;
	}

	private calculateConfidence(dataPoints: TrackerDataPoint[], durationHours: number): number {
		// Base confidence on data quality and duration
		const dataQualityScore = Math.min(dataPoints.length / 10, 1); // More points = higher confidence
		const durationScore = Math.min(durationHours / 8, 1); // Longer stays = higher confidence

		return (dataQualityScore + durationScore) / 2;
	}

	private isLocationExcluded(stay: OvernightStay, exclusions: TripExclusion[]): boolean {
		return exclusions.some((exclusion) => {
			if (exclusion.exclusion_type === 'city') {
				return stay.cityName.toLowerCase().includes(exclusion.value.toLowerCase());
			}
			// Add more exclusion logic as needed
			return false;
		});
	}

	/**
	 * Detect trip patterns based on sleep locations: home → away → home
	 */
	private detectTripPatterns(
		sortedSleepLocations: OvernightStay[],
		homeAddress: HomeAddress | null,
		config: TripDetectionConfig
	): SuggestedTrip[] {
		const trips: SuggestedTrip[] = [];
		let currentTripStays: OvernightStay[] = [];
		let lastHomeDate: string | null = null;

		for (let i = 0; i < sortedSleepLocations.length; i++) {
			const sleepLocation = sortedSleepLocations[i];

			// Check if this is a "home" sleep (close to home address OR same city)
			let distanceFromHome = 0;
			let isAtHome = false;

			if (homeAddress?.coordinates) {
				distanceFromHome =
					haversineDistance(
						homeAddress.coordinates.lat,
						homeAddress.coordinates.lng,
						sleepLocation.location.coordinates[1],
						sleepLocation.location.coordinates[0]
					) / 1000; // Convert from meters to km
				isAtHome = distanceFromHome <= 10; // 10km radius
			}

			// Check if the detected city matches the home city (from address.city field)
			if (homeAddress?.address?.city && sleepLocation.cityName) {
				const homeCity = homeAddress.address.city;
				const isSameCityAsHome =
					sleepLocation.cityName.toLowerCase().includes(homeCity.toLowerCase()) ||
					homeCity.toLowerCase().includes(sleepLocation.cityName.toLowerCase());
				if (isSameCityAsHome && !isAtHome) {
					isAtHome = true;
					console.log(
						`🏠 Trip pattern: Overriding isAtHome to true for ${sleepLocation.date}: same city as home (${sleepLocation.cityName})`
					);
				}
			} else if (homeAddress?.address?.town && sleepLocation.cityName) {
				// Fallback to town if city is not available
				const homeTown = homeAddress.address.town;
				const isSameCityAsHome =
					sleepLocation.cityName.toLowerCase().includes(homeTown.toLowerCase()) ||
					homeTown.toLowerCase().includes(sleepLocation.cityName.toLowerCase());
				if (isSameCityAsHome && !isAtHome) {
					isAtHome = true;
					console.log(
						`🏠 Trip pattern: Overriding isAtHome to true for ${sleepLocation.date}: same town as home (${sleepLocation.cityName})`
					);
				}
			} else if (homeAddress?.address?.village && sleepLocation.cityName) {
				// Fallback to village if city and town are not available
				const homeVillage = homeAddress.address.village;
				const isSameCityAsHome =
					sleepLocation.cityName.toLowerCase().includes(homeVillage.toLowerCase()) ||
					homeVillage.toLowerCase().includes(sleepLocation.cityName.toLowerCase());
				if (isSameCityAsHome && !isAtHome) {
					isAtHome = true;
					console.log(
						`🏠 Trip pattern: Overriding isAtHome to true for ${sleepLocation.date}: same village as home (${sleepLocation.cityName})`
					);
				}
			} else if (homeAddress?.address?.municipality && sleepLocation.cityName) {
				// Fallback to municipality if other fields are not available
				const homeMunicipality = homeAddress.address.municipality;
				const isSameCityAsHome =
					sleepLocation.cityName.toLowerCase().includes(homeMunicipality.toLowerCase()) ||
					homeMunicipality.toLowerCase().includes(sleepLocation.cityName.toLowerCase());
				if (isSameCityAsHome && !isAtHome) {
					isAtHome = true;
					console.log(
						`🏠 Trip pattern: Overriding isAtHome to true for ${sleepLocation.date}: same municipality as home (${sleepLocation.cityName})`
					);
				}
			}

			if (isAtHome) {
				// If we have a current trip and we're back home, end the trip
				if (currentTripStays.length > 0) {
					const trip = this.createTripFromSleepPattern(currentTripStays, homeAddress, config);
					if (trip) trips.push(trip);
					currentTripStays = [];
				}
				lastHomeDate = sleepLocation.date;
			} else {
				// This is an away sleep location (>10km from home)
				if (currentTripStays.length === 0) {
					// Start a new trip if we have a recent home sleep (within 3 days)
					if (lastHomeDate && this.isConsecutiveDates(lastHomeDate, sleepLocation.date)) {
						currentTripStays = [sleepLocation];
					}
				} else {
					// Continue current trip if consecutive
					const lastStay = currentTripStays[currentTripStays.length - 1];
					if (this.isConsecutiveStay(lastStay, sleepLocation)) {
						currentTripStays.push(sleepLocation);
					} else {
						// Gap in trip - end current trip and potentially start new one
						const trip = this.createTripFromSleepPattern(currentTripStays, homeAddress, config);
						if (trip) trips.push(trip);
						currentTripStays = [sleepLocation];
					}
				}
			}
		}

		// Handle any remaining trip (even if not back home yet)
		if (currentTripStays.length > 0) {
			const trip = this.createTripFromSleepPattern(currentTripStays, homeAddress, config);
			if (trip) trips.push(trip);
		}

		return trips;
	}

	/**
	 * Check if two dates are consecutive (within 3 days)
	 */
	private isConsecutiveDates(date1: string, date2: string): boolean {
		const d1 = new Date(date1);
		const d2 = new Date(date2);
		const dayDiff = Math.abs((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
		return dayDiff <= 3;
	}

	/**
	 * Create a trip from a sleep pattern
	 */
	private createTripFromSleepPattern(
		sleepStays: OvernightStay[],
		homeAddress: HomeAddress | null,
		config: TripDetectionConfig
	): SuggestedTrip | null {
		if (sleepStays.length === 0) return null;

		// Sort stays by date
		const sortedStays = sleepStays.sort(
			(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
		);

		const startDate = sortedStays[0].date;
		const endDate = sortedStays[sortedStays.length - 1].date;

		// Calculate total duration
		const totalDurationHours = this.calculateDurationHours(
			sortedStays[0].startTime,
			sortedStays[sortedStays.length - 1].endTime
		);

		if (totalDurationHours < config.minTripDurationHours) {
			return null;
		}

		// Calculate average confidence
		const avgConfidence =
			sleepStays.reduce((sum, stay) => sum + stay.confidence, 0) / sleepStays.length;

		if (avgConfidence < config.minConfidenceScore) {
			return null;
		}

		// Determine trip title based on locations visited
		const uniqueCities = [...new Set(sleepStays.map((stay) => stay.cityName))];
		const title =
			uniqueCities.length === 1
				? `Trip to ${uniqueCities[0]}`
				: `Multi-city trip: ${uniqueCities.slice(0, 2).join(' → ')}${uniqueCities.length > 2 ? '...' : ''}`;

		// Calculate distance from home
		let distanceFromHome = 0;
		if (homeAddress?.coordinates) {
			distanceFromHome =
				haversineDistance(
					homeAddress.coordinates.lat,
					homeAddress.coordinates.lng,
					sleepStays[0].location.coordinates[1],
					sleepStays[0].location.coordinates[0]
				) / 1000; // Convert to km
		}

		return {
			id: '', // Will be set when saved to database
			user_id: '', // Will be set when saved to database
			startDate,
			endDate,
			title,
			description: `Trip detected from sleep patterns: ${uniqueCities.length} location${uniqueCities.length !== 1 ? 's' : ''} visited`,
			location: sleepStays[0].location,
			cityName: uniqueCities[0],
			confidence: avgConfidence,
			dataPoints: sleepStays.reduce((sum, stay) => sum + stay.dataPoints, 0),
			overnightStays: sleepStays.length,
			distanceFromHome,
			status: 'pending',
			metadata: {
				totalDurationHours,
				averageConfidence: avgConfidence,
				visitedCities: uniqueCities,
				sleepDetails: sleepStays.map((stay) => ({
					date: stay.date,
					cityName: stay.cityName,
					durationHours: stay.durationHours,
					confidence: stay.confidence
				})),
				isSleepBasedTrip: true
			},
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};
	}

	/**
	 * Check if two stays are consecutive (within 3 days)
	 */
	private isConsecutiveStay(prevStay: OvernightStay, currentStay: OvernightStay): boolean {
		const prevDate = new Date(prevStay.date);
		const currentDate = new Date(currentStay.date);
		const dayDiff = (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

		return dayDiff <= 3; // Allow up to 3 days gap
	}

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

	private calculateDurationHours(startTime: string, endTime: string): number {
		const start = new Date(startTime);
		const end = new Date(endTime);
		return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
	}

		private getCityNameFromGeocodeData(dataPoints: TrackerDataPoint[]): string {
		// Debug: Log the first few geocode structures to understand the data format
		console.log('🔍 Debug: Analyzing geocode data structure...');
		for (let i = 0; i < Math.min(3, dataPoints.length); i++) {
			const point = dataPoints[i];
			console.log(`🔍 Point ${i} geocode:`, JSON.stringify(point.geocode, null, 2));
		}

		// Extract city names from geocode data
		const cityNames = dataPoints
			.map((point) => {
				// Handle geocode data that might be a string or object
				const geocode = typeof point.geocode === 'string'
					? JSON.parse(point.geocode)
					: point.geocode;

				// Try to extract city name from various possible locations in the geocode data
				return geocode?.address?.city ||
					   geocode?.city ||
					   geocode?.address?.town ||
					   geocode?.town ||
					   geocode?.address?.village ||
					   geocode?.village ||
					   geocode?.address?.municipality ||
					   geocode?.municipality ||
					   geocode?.address?.suburb ||
					   geocode?.suburb ||
					   geocode?.name ||
					   null;
			})
			.filter((city) => city) as string[];

		console.log('🔍 Found city names:', cityNames);

		if (cityNames.length > 0) {
			const mostCommon = this.getMostCommonValue(cityNames);
			console.log('🔍 Most common city name:', mostCommon);
			return mostCommon || 'Unknown City';
		}

		console.log('🔍 No city/town/village found, returning Unknown Location');
		return 'Unknown Location';
	}
}
