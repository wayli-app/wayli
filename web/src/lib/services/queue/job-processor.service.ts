import type { Job, JobType } from '$lib/types/job-queue.types';
import type {
	TripGenerationData,
	TripExclusion,
	TrackerDataPoint,
	DetectedTrip,
	HomeAddress,
	SuggestedTrip
} from '$lib/types/trip-generation.types';
import { reverseGeocode, forwardGeocode } from '../external/nominatim.service';
import { supabase } from '$lib/core/supabase/worker';
import { JobQueueService } from './job-queue.service.worker';
import { EnhancedPoiDetectionService } from '../enhanced-poi-detection.service';
import { EnhancedTripDetectionService } from '../enhanced-trip-detection.service';
// Import TripLocationsService but we'll create our own instance with worker client
import { TripLocationsService } from '../../services/trip-locations.service';
import { UserProfileService } from '../user-profile.service';
import { haversineDistance } from '../../utils';
import {
	getCountryForPoint,
	normalizeCountryCode
} from '../external/country-reverse-geocoding.service';
import { ExportProcessorService } from '../export-processor.service';

export class JobProcessorService {
	/**
	 * Check if a job has been cancelled
	 */
	private static async isJobCancelled(jobId: string): Promise<boolean> {
		const { data: job, error } = await supabase
			.from('jobs')
			.select('status')
			.eq('id', jobId)
			.single();

		if (error || !job) {
			console.error('Error checking job status:', error);
			return false;
		}

		return job.status === 'cancelled';
	}

	/**
	 * Throw an error if the job has been cancelled
	 */
	private static async checkJobCancellation(jobId: string): Promise<void> {
		if (await this.isJobCancelled(jobId)) {
			throw new Error('Job was cancelled');
		}
	}

	static async processJob(job: Job): Promise<void> {
		const processor = this.getJobProcessor(job.type);
		if (!processor) {
			throw new Error(`No processor found for job type: ${job.type}`);
		}

		await processor(job);
	}

	private static getJobProcessor(jobType: JobType) {
		const processors: Record<JobType, (job: Job) => Promise<void>> = {
			reverse_geocoding_missing: this.processReverseGeocodingMissing.bind(this),
			trip_cover_generation: this.processTripCoverGeneration.bind(this),
			data_import: this.processDataImport.bind(this),
			poi_visit_detection: this.processPoiVisitDetection.bind(this),
			trip_generation: this.processTripGeneration.bind(this),
			data_export: this.processDataExport.bind(this)
		};

		return processors[jobType];
	}

	private static async processReverseGeocodingMissing(job: Job): Promise<void> {
		console.log(`🌍 Processing reverse geocoding missing job ${job.id}`);

		const startTime = Date.now();
		const BATCH_SIZE = 1000;
		const userId = job.created_by;
		let totalProcessed = 0;
		let totalSuccess = 0;
		let totalErrors = 0;

		try {
			// Check for cancellation before starting
			await this.checkJobCancellation(job.id);

			// Get total count of tracker data points that need geocoding
			// Include both null geocode and empty JSON object {} geocode
			const { count: trackerDataCount, error: trackerDataCountError } = await supabase
				.from('tracker_data')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.not('location', 'is', null)
				.or('geocode.is.null,geocode.eq.{}');

			if (trackerDataCountError) throw trackerDataCountError;

			const totalPoints = trackerDataCount || 0;
			console.log(`📊 Found ${totalPoints} tracker data points needing geocoding`);

			// Update initial progress
			await JobQueueService.updateJobProgress(job.id, 0, {
				message: `Found ${totalPoints.toLocaleString()} tracker data points needing geocoding. Starting processing...`,
				totalProcessed: 0,
				totalSuccess: 0,
				totalErrors: 0,
				totalPoints,
				processedCount: 0,
				successCount: 0,
				errorCount: 0,
				totalCount: totalPoints
			});

			if (totalPoints === 0) {
				await JobQueueService.updateJobProgress(job.id, 100, {
					totalProcessed: 0,
					totalSuccess: 0,
					totalErrors: 0,
					message: 'No tracker data points found needing geocoding',
					processedCount: 0,
					successCount: 0,
					errorCount: 0,
					totalCount: 0
				});
				return;
			}

			// Process tracker data in batches
			await this.processTrackerDataInBatches(
				userId,
				BATCH_SIZE,
				job.id,
				totalPoints,
				startTime,
				(processed, success, errors) => {
					totalProcessed += processed;
					totalSuccess += success;
					totalErrors += errors;
					const progress = Math.round((totalProcessed / totalPoints) * 100);

					// Update job progress with detailed information
					JobQueueService.updateJobProgress(job.id, progress, {
						totalProcessed,
						totalSuccess,
						totalErrors,
						totalPoints,
						currentBatch: Math.ceil(totalProcessed / BATCH_SIZE),
						totalBatches: Math.ceil(totalPoints / BATCH_SIZE),
						message: `Processed ${totalProcessed.toLocaleString()}/${totalPoints.toLocaleString()} points (${totalErrors} errors)`,
						estimatedTimeRemaining: this.calculateEstimatedTimeRemaining(
							totalProcessed,
							totalPoints,
							processed,
							1
						),
						// Add fields for frontend display
						processedCount: totalProcessed,
						successCount: totalSuccess,
						errorCount: totalErrors,
						totalCount: totalPoints
					});
				}
			);

			console.log(
				`✅ Reverse geocoding completed: ${totalSuccess} successful, ${totalErrors} errors out of ${totalProcessed} total`
			);

			// Update final progress with completion details
			await JobQueueService.updateJobProgress(job.id, 100, {
				totalProcessed,
				totalSuccess,
				totalErrors,
				totalPoints,
				message: `✅ Reverse geocoding completed: ${totalSuccess.toLocaleString()} successful, ${totalErrors.toLocaleString()} errors out of ${totalProcessed.toLocaleString()} total`,
				processedCount: totalProcessed,
				successCount: totalSuccess,
				errorCount: totalErrors,
				totalCount: totalPoints,
				completed: true
			});
		} catch (error: unknown) {
			// Check if the error is due to cancellation
			if (error instanceof Error && error.message === 'Job was cancelled') {
				console.log(`🛑 Reverse geocoding job ${job.id} was cancelled`);
				return;
			}
			console.error(`❌ Error in reverse geocoding missing job:`, error);
			throw error;
		}
	}

	private static async processTrackerDataInBatches(
		userId: string,
		batchSize: number,
		jobId: string,
		totalPoints: number,
		startTime: number,
		progressCallback: (processed: number, success: number, errors: number) => void
	): Promise<void> {
		let offset = 0;
		let totalProcessed = 0;
		const CONCURRENT_REQUESTS = 20; // Process 20 requests in parallel

		while (true) {
			// Check for cancellation before processing each batch
			await this.checkJobCancellation(jobId);

			// Get batch of tracker data points that need geocoding
			// Include both null geocode and empty JSON object {} geocode
			const { data: points, error } = await supabase
				.from('tracker_data')
				.select('user_id, location, geocode, recorded_at')
				.eq('user_id', userId)
				.not('location', 'is', null)
				.or('geocode.is.null,geocode.eq.{}')
				.range(offset, offset + batchSize - 1)
				.order('recorded_at', { ascending: false });

			if (error) throw error;

			if (!points || points.length === 0) {
				break; // No more points to process
			}

			console.log(
				`🔄 Processing batch of ${points.length} tracker data points (offset: ${offset})`
			);

			// Process points in parallel with controlled concurrency
			const results = await this.processPointsInParallel(
				points,
				CONCURRENT_REQUESTS,
				jobId,
				totalProcessed,
				totalPoints,
				startTime
			);

			// Update cumulative counters
			totalProcessed += results.processed;

			// Call progress callback (progress is already updated in parallel processing)
			progressCallback(results.processed, results.success, results.errors);

			// Move to next batch
			offset += batchSize;

			// If we got fewer points than batch size, we're done
			if (points.length < batchSize) {
				break;
			}
		}
	}

	private static async processPointsInParallel(
		points: Array<{
			user_id: string;
			location:
				| string
				| {
						type: string;
						coordinates: number[];
						crs?: { type: string; properties: { name: string } };
				  };
			geocode: unknown;
			recorded_at: string;
		}>,
		concurrency: number,
		jobId: string,
		totalProcessed: number,
		totalPoints: number,
		startTime: number
	): Promise<{ processed: number; success: number; errors: number }> {
		let processed = 0;
		let success = 0;
		let errors = 0;

		// Process points in chunks to control concurrency
		for (let i = 0; i < points.length; i += concurrency) {
			const chunk = points.slice(i, i + concurrency);

			// Process chunk in parallel
			const promises = chunk.map((point) => this.processSinglePoint(point));
			const results = await Promise.allSettled(promises);

			// Count results
			for (const result of results) {
				processed++;
				if (result.status === 'fulfilled' && result.value) {
					success++;
				} else {
					errors++;
				}

				// Send progress update every 50 points
				if (processed % 50 === 0 || processed === points.length) {
					const currentTotalProcessed = totalProcessed + processed;
					const progress = Math.round((currentTotalProcessed / totalPoints) * 100);
					const elapsedSeconds = (Date.now() - startTime) / 1000;
					const pointsPerSecond = elapsedSeconds > 0 ? currentTotalProcessed / elapsedSeconds : 0;
					const remainingPoints = totalPoints - currentTotalProcessed;
					const remainingSeconds = pointsPerSecond > 0 ? remainingPoints / pointsPerSecond : 0;
					let etaString = 'Calculating...';
					if (remainingSeconds < 60) {
						etaString = `${Math.round(remainingSeconds)} seconds`;
					} else if (remainingSeconds < 3600) {
						etaString = `${Math.round(remainingSeconds / 60)} minutes`;
					} else {
						etaString = `${Math.round(remainingSeconds / 3600)} hours`;
					}
					await JobQueueService.updateJobProgress(jobId, progress, {
						totalProcessed: currentTotalProcessed,
						totalSuccess: success,
						totalErrors: errors,
						totalPoints,
						currentBatch: Math.ceil(currentTotalProcessed / 1000),
						totalBatches: Math.ceil(totalPoints / 1000),
						message: `Processed ${currentTotalProcessed.toLocaleString()}/${totalPoints.toLocaleString()} points (${errors} errors)`,
						estimatedTimeRemaining: etaString,
						// Add fields for frontend display
						processedCount: currentTotalProcessed,
						successCount: success,
						errorCount: errors,
						totalCount: totalPoints
					});
				}
			}

			// Small delay between chunks to be respectful to the API
			if (i + concurrency < points.length) {
				await this.delay(50); // 50ms delay between chunks
			}
		}

		return { processed, success, errors };
	}

	private static async processSinglePoint(point: {
		user_id: string;
		location:
			| string
			| {
					type: string;
					coordinates: number[];
					crs?: { type: string; properties: { name: string } };
			  };
		geocode: unknown;
		recorded_at: string;
	}): Promise<boolean> {
		try {
			// Extract lat/lon from GeoJSON point
			let lat: number, lon: number;

			if (point.location && typeof point.location === 'object' && 'coordinates' in point.location) {
				// GeoJSON format: { type: "Point", coordinates: [lon, lat] }
				const coords = point.location.coordinates;
				if (Array.isArray(coords) && coords.length >= 2) {
					[lon, lat] = coords;
				} else {
					console.warn(`⚠️ Invalid coordinates format for tracker data point:`, point.location);
					// Store error in geocode field
					await this.updateGeocodeWithError(point, 'Invalid coordinates format');
					return false;
				}
			} else if (typeof point.location === 'string') {
				// PostGIS POINT format: "POINT(lon lat)"
				const locationMatch = point.location.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
				if (!locationMatch) {
					console.warn(`⚠️ Invalid location format for tracker data point: ${point.location}`);
					// Store error in geocode field
					await this.updateGeocodeWithError(point, 'Invalid location format');
					return false;
				}
				[lon, lat] = locationMatch.slice(1).map(Number);
			} else {
				console.warn(`⚠️ Unknown location format for tracker data point:`, point.location);
				// Store error in geocode field
				await this.updateGeocodeWithError(point, 'Unknown location format');
				return false;
			}

			// Validate coordinates
			if (
				typeof lat !== 'number' ||
				typeof lon !== 'number' ||
				isNaN(lat) ||
				isNaN(lon) ||
				lat < -90 ||
				lat > 90 ||
				lon < -180 ||
				lon > 180
			) {
				console.warn(`⚠️ Invalid coordinates for tracker data point: lat=${lat}, lon=${lon}`);
				// Store error in geocode field
				await this.updateGeocodeWithError(point, `Invalid coordinates: lat=${lat}, lon=${lon}`);
				return false;
			}

			// Call Nominatim
			const geocodeResult = await reverseGeocode(lat, lon);

			// Update the tracker_data table with the geocoding result
			const { error: updateError } = await supabase
				.from('tracker_data')
				.update({
					geocode: geocodeResult,
					updated_at: new Date().toISOString()
				})
				.eq('user_id', point.user_id)
				.eq('recorded_at', point.recorded_at);

			if (updateError) {
				console.error(`❌ Database update error:`, updateError);
				// Store error in geocode field
				await this.updateGeocodeWithError(point, `Database update error: ${updateError.message}`);
				return false;
			}

			console.log(`✅ Geocoded tracker data point: ${geocodeResult.display_name}`);
			return true;
		} catch (error: unknown) {
			console.error(`❌ Error processing tracker data point:`, (error as Error).message);
			// Store error in geocode field
			await this.updateGeocodeWithError(point, `Geocoding error: ${(error as Error).message}`);
			return false;
		}
	}

	private static async updateGeocodeWithError(
		point: {
			user_id: string;
			location:
				| string
				| {
						type: string;
						coordinates: number[];
						crs?: { type: string; properties: { name: string } };
				  };
			geocode: unknown;
			recorded_at: string;
		},
		errorMessage: string
	): Promise<void> {
		try {
			const errorGeocode = {
				error: true,
				error_message: errorMessage,
				timestamp: new Date().toISOString(),
				display_name: 'Error occurred during geocoding'
			};

			const { error: updateError } = await supabase
				.from('tracker_data')
				.update({
					geocode: errorGeocode,
					updated_at: new Date().toISOString()
				})
				.eq('user_id', point.user_id)
				.eq('recorded_at', point.recorded_at);

			if (updateError) {
				console.error(`❌ Failed to update geocode with error:`, updateError);
			} else {
				console.log(`⚠️ Updated geocode with error: ${errorMessage}`);
			}
		} catch (error) {
			console.error(`❌ Error updating geocode with error:`, error);
		}
	}

	private static delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private static calculateEstimatedTimeRemaining(
		processed: number,
		totalPoints: number,
		processedInLastBatch: number,
		concurrency: number
	): string {
		if (processed === 0 || processedInLastBatch === 0) {
			return 'Calculating...';
		}

		const remainingPoints = totalPoints - processed;
		const pointsPerSecond = (processedInLastBatch * concurrency) / 0.05; // 50ms per batch = 0.05 seconds
		const remainingSeconds = remainingPoints / pointsPerSecond;

		if (remainingSeconds < 60) {
			return `${Math.round(remainingSeconds)} seconds`;
		} else if (remainingSeconds < 3600) {
			return `${Math.round(remainingSeconds / 60)} minutes`;
		} else {
			return `${Math.round(remainingSeconds / 3600)} hours`;
		}
	}

	private static async processTripCoverGeneration(job: Job): Promise<void> {
		console.log(`🖼️ Processing trip cover generation job ${job.id}`);
		// Implementation would go here
	}

	private static async processTripGeneration(job: Job): Promise<void> {
		console.log(`🗺️ Processing sleep-based trip generation job ${job.id}`);
		console.log(`👤 Job created by user: ${job.created_by}`);
		console.log(`📋 Job data:`, JSON.stringify(job.data, null, 2));

		const startTime = Date.now();
		const userId = job.created_by;
		const {
			startDate,
			endDate,
			useCustomHomeAddress,
			customHomeAddress,
			minTripDurationHours,
			maxDistanceFromHomeKm,
			minDataPointsPerDay,
			overnightHoursStart,
			overnightHoursEnd,
			minOvernightHours
		} = job.data as unknown as TripGenerationData;

		console.log(`📅 Job parameters:`);
		console.log(`  - startDate: ${startDate || 'not specified'}`);
		console.log(`  - endDate: ${endDate || 'not specified'}`);
		console.log(`  - useCustomHomeAddress: ${useCustomHomeAddress}`);
		console.log(`  - customHomeAddress: ${customHomeAddress || 'not specified'}`);

		try {
			// Check for cancellation before starting
			await this.checkJobCancellation(job.id);

			// Determine date ranges - if not provided, find available ranges automatically
			let dateRanges: Array<{ startDate: string; endDate: string }> = [];

			if (!startDate || !endDate) {
				console.log(
					`🔍 No start/end dates provided, finding available date ranges automatically...`
				);
				await JobQueueService.updateJobProgress(job.id, 5, {
					message: 'Determining available date ranges for sleep-based trip generation...'
				});

				dateRanges = await this.findAvailableDateRanges(userId, startDate, endDate);
				console.log(`📊 findAvailableDateRanges returned ${dateRanges.length} date ranges`);

				if (dateRanges.length === 0) {
					console.log(`❌ No available date ranges found, completing job with error`);
					await JobQueueService.updateJobProgress(job.id, 100, {
						message: 'No available date ranges found for sleep-based trip generation',
						tripsGenerated: 0
					});
					return;
				}

				const dateRangeMessage =
					startDate || endDate
						? `Found ${dateRanges.length} available date ranges for sleep-based trip generation${startDate ? ` (from ${startDate})` : ''}${endDate ? ` (until ${endDate})` : ''}`
						: `Found ${dateRanges.length} available date ranges for sleep-based trip generation`;

				await JobQueueService.updateJobProgress(job.id, 10, {
					message: dateRangeMessage,
					dateRangesCount: dateRanges.length,
					dateRanges: dateRanges.map((range) => `${range.startDate} to ${range.endDate}`),
					userStartDate: startDate,
					userEndDate: endDate
				});
			} else {
				console.log(`📅 Using provided date range: ${startDate} to ${endDate}`);
				// Use provided date range, but exclude existing trip dates to find available ranges
				await JobQueueService.updateJobProgress(job.id, 8, {
					message: 'Finding available date ranges within the provided date range...',
					startDate,
					endDate
				});

				// Instead of checking for overlap, use the same logic as automatic detection
				// but constrained to the provided date range
				dateRanges = await this.findAvailableDateRanges(userId, startDate, endDate);
				console.log(
					`📊 findAvailableDateRanges returned ${dateRanges.length} date ranges within provided range`
				);

				if (dateRanges.length === 0) {
					console.log(
						`❌ No available date ranges found within the provided range, completing job with error`
					);
					await JobQueueService.updateJobProgress(job.id, 100, {
						message:
							'No available date ranges found within the provided date range. All dates are already covered by existing trips.',
						tripsGenerated: 0,
						providedStartDate: startDate,
						providedEndDate: endDate
					});
					return;
				}

				const dateRangeMessage = `Found ${dateRanges.length} available date ranges within the provided range (${startDate} to ${endDate})`;
				await JobQueueService.updateJobProgress(job.id, 10, {
					message: dateRangeMessage,
					dateRangesCount: dateRanges.length,
					dateRanges: dateRanges.map((range) => `${range.startDate} to ${range.endDate}`),
					userStartDate: startDate,
					userEndDate: endDate
				});
			}

			console.log(`✅ Date ranges determined: ${dateRanges.length} ranges to process`);
			dateRanges.forEach((range, index) => {
				console.log(`  Range ${index + 1}: ${range.startDate} to ${range.endDate}`);
			});

			// Get user's home address
			let homeAddress: HomeAddress | null = null;
			if (useCustomHomeAddress && customHomeAddress) {
				// Geocode the custom home address to get coordinates
				console.log(`🏠 Geocoding custom home address: ${customHomeAddress}`);

				// Update progress to show geocoding is in progress
				await JobQueueService.updateJobProgress(job.id, 8, {
					message: `Geocoding custom home address: ${customHomeAddress}...`,
					homeAddress: 'geocoding in progress'
				});

				try {
					const geocodeResult = await forwardGeocode(customHomeAddress);
					if (geocodeResult) {
						homeAddress = {
							display_name: geocodeResult.display_name,
							coordinates: {
								lat: parseFloat(geocodeResult.lat),
								lng: parseFloat(geocodeResult.lon)
							}
						};
						console.log(
							`✅ Successfully geocoded custom home address: ${geocodeResult.display_name} (${geocodeResult.lat}, ${geocodeResult.lon})`
						);
					} else {
						console.warn(`⚠️ Could not geocode custom home address: ${customHomeAddress}`);
						// Fallback to string-only address
						homeAddress = {
							display_name: customHomeAddress,
							coordinates: undefined
						};
					}
				} catch (error) {
					console.error(`❌ Error geocoding custom home address: ${customHomeAddress}`, error);
					// Fallback to string-only address
					homeAddress = {
						display_name: customHomeAddress,
						coordinates: undefined
					};
				}
			} else {
				// Get user's stored home address from user_profiles table
				const userProfile = await UserProfileService.getUserProfile(userId);
				if (userProfile?.home_address) {
					// Convert GeocodedLocation to HomeAddress format
					if (typeof userProfile.home_address === 'string') {
						// If it's a string, it might be a display name without coordinates
						homeAddress = {
							display_name: userProfile.home_address,
							coordinates: undefined
						};
					} else {
						// If it's a GeocodedLocation object, convert to HomeAddress
						homeAddress = {
							display_name: userProfile.home_address.display_name,
							coordinates: userProfile.home_address.coordinates,
							address: userProfile.home_address.address
						};
					}
				}
			}

			await JobQueueService.updateJobProgress(job.id, 10, {
				message: 'Retrieved home address, fetching GPS data for sleep pattern analysis...',
				homeAddress: homeAddress
					? `configured (${homeAddress.display_name}${homeAddress.coordinates ? ` - ${homeAddress.coordinates.lat.toFixed(4)}, ${homeAddress.coordinates.lng.toFixed(4)}` : ' - no coordinates'})`
					: 'not configured'
			});

			// Configure UserProfileService for worker environment
			UserProfileService.useNodeEnvironmentConfig();

			// Get user's trip exclusions from user profile
			const { data: userProfile, error: userProfileError } = await supabase
				.from('user_profiles')
				.select('trip_exclusions')
				.eq('id', userId)
				.single();

			let exclusions: TripExclusion[] = [];
			if (userProfileError) {
				console.error('Error fetching user profile for trip exclusions:', userProfileError);
				// Fallback to empty array if profile not found
			} else {
				exclusions = userProfile?.trip_exclusions || [];
			}

			// Use enhanced trip detection service
			const enhancedTripService = new EnhancedTripDetectionService();

			// Configure detection parameters
			const config = {
				minTripDurationHours: minTripDurationHours || 12,
				maxDistanceFromHomeKm: maxDistanceFromHomeKm || 50,
				minDataPointsPerDay: minDataPointsPerDay || 3,
				overnightHoursStart: overnightHoursStart || 20,
				overnightHoursEnd: overnightHoursEnd || 8,
				minOvernightHours: minOvernightHours || 6
			};

			const allSuggestedTrips: SuggestedTrip[] = [];
			let totalDataPoints = 0;

			// Process each date range
			for (let i = 0; i < dateRanges.length; i++) {
				// Check for cancellation before processing each range
				await this.checkJobCancellation(job.id);

				const range = dateRanges[i];
				const rangeStartTime = Date.now();

				console.log(
					`🔄 Starting to process date range ${i + 1}/${dateRanges.length}: ${range.startDate} to ${range.endDate}`
				);

				const rangeMessage =
					startDate || endDate
						? `Processing date range ${i + 1}/${dateRanges.length}: ${range.startDate} to ${range.endDate}${startDate ? ` (filtered from ${startDate})` : ''}${endDate ? ` (filtered until ${endDate})` : ''}`
						: `Processing date range ${i + 1}/${dateRanges.length}: ${range.startDate} to ${range.endDate}`;

				await JobQueueService.updateJobProgress(
					job.id,
					Math.min(100, Math.round(15 + (i * 60) / dateRanges.length)),
					{
						message: rangeMessage,
						currentRange: i + 1,
						totalRanges: dateRanges.length,
						currentRangeDates: `${range.startDate} to ${range.endDate}`,
						userStartDate: startDate,
						userEndDate: endDate
					}
				);

				// Fetch GPS data for this date range with sleep hours filtering applied during the database query
				console.log(
					`📊 Starting to fetch GPS data for range ${range.startDate} to ${range.endDate} with sleep hours filtering`
				);
				const fetchStartTime = Date.now();

				// Use the optimized fetch method that filters data during the database query
				const {
					data: trackerData,
					totalFetched,
					totalFiltered,
					pageCount
				} = await this.fetchTrackerDataForRange(userId, range, {
					overnightHoursStart: config.overnightHoursStart,
					overnightHoursEnd: config.overnightHoursEnd
				});

				const fetchTime = Date.now() - fetchStartTime;
				console.log(
					`📊 Sleep hours data fetch completed: ${totalFetched} total points → ${totalFiltered} sleep hours points in ${fetchTime}ms (${pageCount} pages)`
				);

				totalDataPoints += trackerData?.length || 0;

				if (!trackerData || trackerData.length === 0) {
					console.log(
						`⚠️ No sleep hours data found for range ${range.startDate} to ${range.endDate}`
					);
					continue;
				}

				await JobQueueService.updateJobProgress(
					job.id,
					Math.min(100, Math.round(20 + (i * 60) / dateRanges.length)),
					{
						message: `Fetched ${totalFetched} GPS data points, filtered to ${trackerData.length} sleep hours data points for range ${i + 1}/${dateRanges.length}`,
						dataPoints: totalFetched,
						sleepHoursDataPoints: trackerData.length,
						totalDataPoints,
						currentRange: i + 1,
						totalRanges: dateRanges.length
					}
				);

				// Detect sleep locations for this range (new approach)
				console.log(
					`😴 Starting sleep location detection for ${trackerData.length} sleep hours data points`
				);
				const sleepDetectionStartTime = Date.now();

				const sleepLocations = await enhancedTripService.detectSleepLocations(
					trackerData,
					homeAddress,
					exclusions,
					config,
					job.id,
					i + 1,
					dateRanges.length
				);

				const sleepDetectionTime = Date.now() - sleepDetectionStartTime;
				console.log(
					`😴 Sleep location detection completed: ${sleepLocations.length} locations found in ${sleepDetectionTime}ms`
				);

				await JobQueueService.updateJobProgress(
					job.id,
					Math.min(100, Math.round(40 + (i * 60) / dateRanges.length)),
					{
						message: `Detected ${sleepLocations.length} sleep locations in range ${i + 1}/${dateRanges.length}`,
						sleepLocationsDetected: sleepLocations.length,
						currentRange: i + 1,
						totalRanges: dateRanges.length
					}
				);

				// Generate suggested trips from sleep patterns for this range
				console.log(`🎯 Starting trip generation from ${sleepLocations.length} sleep locations`);
				const tripGenerationStartTime = Date.now();

				const suggestedTrips = await enhancedTripService.generateSuggestedTrips(
					sleepLocations,
					homeAddress,
					exclusions,
					config
				);

				const tripGenerationTime = Date.now() - tripGenerationStartTime;
				console.log(
					`🎯 Trip generation completed: ${suggestedTrips.length} trips generated in ${tripGenerationTime}ms`
				);

				allSuggestedTrips.push(...suggestedTrips);

				const rangeTime = Date.now() - rangeStartTime;
				console.log(
					`✅ Completed processing range ${i + 1}/${dateRanges.length}: ${range.startDate} to ${range.endDate} in ${rangeTime}ms`
				);

				await JobQueueService.updateJobProgress(
					job.id,
					Math.min(100, Math.round(60 + (i * 60) / dateRanges.length)),
					{
						message: `Generated ${suggestedTrips.length} trip patterns for range ${i + 1}/${dateRanges.length}`,
						suggestedTripsCount: suggestedTrips.length,
						totalSuggestedTrips: allSuggestedTrips.length,
						currentRange: i + 1,
						totalRanges: dateRanges.length
					}
				);
			}

			console.log(`💾 Starting to save ${allSuggestedTrips.length} suggested trips to database`);
			const saveStartTime = Date.now();

			await JobQueueService.updateJobProgress(job.id, 80, {
				message: `Generated ${allSuggestedTrips.length} total trip patterns, saving for review...`,
				suggestedTripsCount: allSuggestedTrips.length,
				totalDataPoints,
				dateRangesProcessed: dateRanges.length
			});

			// Save all suggested trips to database for review
			const savedTripIds = await enhancedTripService.saveSuggestedTrips(allSuggestedTrips, userId);

			const saveTime = Date.now() - saveStartTime;
			console.log(
				`💾 Database save completed: ${savedTripIds.length} trips saved in ${saveTime}ms`
			);

			await JobQueueService.updateJobProgress(job.id, 90, {
				message: `Saved ${savedTripIds.length} trip patterns for review`,
				suggestedTripsCount: savedTripIds.length,
				totalDataPoints,
				dateRangesProcessed: dateRanges.length
			});

			const totalTime = Date.now() - startTime;
			console.log(
				`✅ Sleep-based trip generation completed: ${savedTripIds.length} trip patterns created in ${totalTime}ms`
			);

			await JobQueueService.updateJobProgress(job.id, 100, {
				message: `Successfully created ${savedTripIds.length} trip patterns for review`,
				suggestedTripsCount: savedTripIds.length,
				totalTime: `${Math.round(totalTime / 1000)}s`
			});
		} catch (error: unknown) {
			// Check if the error is due to cancellation
			if (error instanceof Error && error.message === 'Job was cancelled') {
				console.log(`🛑 Sleep-based trip generation job ${job.id} was cancelled`);
				return;
			}
			console.error(`❌ Error in sleep-based trip generation job:`, error);
			throw error;
		}
	}

	private static async processDataImport(job: Job): Promise<void> {
		console.log(`📥 Processing data import job ${job.id}`);

		const startTime = Date.now();
		const userId = job.created_by;

		try {
			// Check for cancellation before starting
			await this.checkJobCancellation(job.id);

			// Extract job data
			const { storagePath, format, fileName } = job.data as {
				storagePath: string;
				format: string;
				fileName: string;
			};

			if (!storagePath || !format) {
				throw new Error('Missing storage path or format in job data');
			}

			// Download file content from Supabase Storage
			const { data: fileData, error: downloadError } = await supabase.storage
				.from('temp-files')
				.download(storagePath);

			if (downloadError || !fileData) {
				throw new Error(
					`Failed to download file from storage: ${downloadError?.message || 'Unknown error'}`
				);
			}

			// Convert blob to text
			const fileContent = await fileData.text();

			console.log(
				`📁 Processing import: ${fileName}, format: ${format}, content length: ${fileContent.length}`
			);

			// Update initial progress
			await JobQueueService.updateJobProgress(job.id, 0, {
				message: `Starting ${format} import...`,
				fileName,
				format,
				totalProcessed: 0,
				totalItems: 0
			});

			let importedCount = 0;
			let totalItems = 0;

			// Process based on format
			switch (format) {
				case 'GeoJSON':
					importedCount = await this.importGeoJSONWithProgress(
						fileContent,
						userId,
						job.id,
						fileName
					);
					break;
				case 'GPX': {
					const result = await this.importGPXWithProgress(fileContent, userId, job.id, fileName);
					importedCount = result.importedCount;
					totalItems = result.totalItems;
					break;
				}
				case 'OwnTracks':
					importedCount = await this.importOwnTracksWithProgress(
						fileContent,
						userId,
						job.id,
						fileName
					);
					break;
				default:
					throw new Error(`Unsupported format: ${format}`);
			}

			// Update final progress
			const elapsedSeconds = (Date.now() - startTime) / 1000;
			await JobQueueService.updateJobProgress(job.id, 100, {
				message: `✅ Import completed successfully!`,
				fileName,
				format,
				totalProcessed: importedCount,
				totalItems: totalItems || importedCount,
				importedCount,
				elapsedSeconds: elapsedSeconds.toFixed(1)
			});

			// Clean up temporary file from storage after successful processing
			await supabase.storage.from('temp-files').remove([storagePath]);

			console.log(
				`✅ Data import completed: ${importedCount} items imported in ${elapsedSeconds.toFixed(1)}s`
			);
		} catch (error: unknown) {
			// Check if the error is due to cancellation
			if (error instanceof Error && error.message === 'Job was cancelled') {
				console.log(`🛑 Data import job ${job.id} was cancelled`);
				// Clean up temporary file on cancellation
				try {
					const { storagePath } = job.data as { storagePath: string };
					if (storagePath) {
						await supabase.storage.from('temp-files').remove([storagePath]);
					}
				} catch (cleanupError) {
					console.error('Failed to cleanup temporary file on cancellation:', cleanupError);
				}
				return;
			}
			console.error(`❌ Error in data import job:`, error);
			// Clean up temporary file on error as well
			try {
				const { storagePath } = job.data as { storagePath: string };
				if (storagePath) {
					await supabase.storage.from('temp-files').remove([storagePath]);
				}
			} catch (cleanupError) {
				console.error('Failed to cleanup temporary file:', cleanupError);
			}
			throw error;
		}
	}

	private static async importGeoJSONWithProgress(
		content: string,
		userId: string,
		jobId: string,
		fileName: string
	): Promise<number> {
		try {
			console.log('🗺️ Starting GeoJSON import with progress tracking');
			const geojson = JSON.parse(content);
			let importedCount = 0;
			let skippedCount = 0;
			let errorCount = 0;

			if (geojson.type === 'FeatureCollection' && geojson.features) {
				const totalFeatures = geojson.features.length;
				console.log(`📊 Processing ${totalFeatures.toLocaleString()} features from ${fileName}`);

				// Update progress with total items
				await JobQueueService.updateJobProgress(jobId, 0, {
					message: `🗺️ Processing ${totalFeatures.toLocaleString()} GeoJSON features...`,
					fileName,
					format: 'GeoJSON',
					totalProcessed: 0,
					totalItems: totalFeatures
				});

				const startTime = Date.now();
				let lastLogTime = startTime;

				for (let i = 0; i < geojson.features.length; i++) {
					// Check for cancellation every 10 features
					if (i % 10 === 0) {
						await this.checkJobCancellation(jobId);
					}

					const feature = geojson.features[i];
					const currentTime = Date.now();

					// Log progress every 1000 features or every 30 seconds
					if (i % 1000 === 0 || currentTime - lastLogTime > 30000) {
						const progress = Math.round((i / geojson.features.length) * 100);
						const elapsedSeconds = (currentTime - startTime) / 1000;
						const rate = i > 0 ? (i / elapsedSeconds).toFixed(1) : '0';
						const eta =
							i > 0 ? ((geojson.features.length - i) / (i / elapsedSeconds)).toFixed(0) : '0';

						console.log(
							`📈 Progress: ${i.toLocaleString()}/${totalFeatures.toLocaleString()} (${progress}%) - Rate: ${rate} features/sec - ETA: ${eta}s - Imported: ${importedCount.toLocaleString()} - Skipped: ${skippedCount.toLocaleString()} - Errors: ${errorCount.toLocaleString()}`
						);

						await JobQueueService.updateJobProgress(jobId, progress, {
							message: `🗺️ Processing GeoJSON features... ${i.toLocaleString()}/${totalFeatures.toLocaleString()} (${progress}%)`,
							fileName,
							format: 'GeoJSON',
							totalProcessed: importedCount,
							totalItems: totalFeatures,
							currentFeature: i + 1,
							rate: `${rate} features/sec`,
							eta: `${eta}s`,
							skipped: skippedCount,
							errors: errorCount
						});

						lastLogTime = currentTime;
					}

					// Log milestone achievements
					if (importedCount > 0 && importedCount % 5000 === 0) {
						console.log(`🎉 Milestone: Imported ${importedCount.toLocaleString()} points!`);
						await JobQueueService.updateJobProgress(
							jobId,
							Math.round((i / geojson.features.length) * 100),
							{
								message: `🎉 Imported ${importedCount.toLocaleString()} points!`,
								fileName,
								format: 'GeoJSON',
								totalProcessed: importedCount,
								totalItems: totalFeatures,
								currentFeature: i + 1
							}
						);
					}

					if (feature.geometry?.type === 'Point' && feature.geometry.coordinates) {
						const [longitude, latitude] = feature.geometry.coordinates;
						const properties = feature.properties || {};

						// Extract timestamp from properties - handle both seconds and milliseconds
						let recordedAt = new Date().toISOString();
						if (properties.timestamp) {
							// Check if timestamp is in seconds (Unix timestamp) or milliseconds
							const timestamp = properties.timestamp;
							if (timestamp < 10000000000) {
								// Timestamp is in seconds, convert to milliseconds
								recordedAt = new Date(timestamp * 1000).toISOString();
							} else {
								// Timestamp is already in milliseconds
								recordedAt = new Date(timestamp).toISOString();
							}
						} else if (properties.time) {
							recordedAt = new Date(properties.time).toISOString();
						} else if (properties.date) {
							recordedAt = new Date(properties.date).toISOString();
						}

						// Extract country code from properties first, then from coordinates if not available
						let countryCode =
							properties.countrycode || properties.country_code || properties.country || null;

						// If no country code in properties, determine it from coordinates
						if (!countryCode) {
							countryCode = this.getCountryForPoint(latitude, longitude);
						}

						// Normalize the country code to ensure it's a valid 2-character ISO code
						countryCode = this.normalizeCountryCode(countryCode);

						// Use geodata for geocode if available
						let reverseGeocode = null;
						if (properties.geodata) {
							reverseGeocode = properties.geodata;
						}

						const { error } = await supabase.from('tracker_data').upsert(
							{
								user_id: userId,
								tracker_type: 'import',
								location: `POINT(${longitude} ${latitude})`,
								recorded_at: recordedAt,
								country_code: countryCode,
								geocode: reverseGeocode,
								altitude: properties.altitude || properties.elevation || null,
								accuracy: properties.accuracy || null,
								speed: properties.speed || properties.velocity || null,
								heading: properties.heading || properties.bearing || properties.course || null,
								activity_type: properties.activity_type || null,
								raw_data: { ...properties, import_source: 'geojson' }, // Store all original properties plus import source
								created_at: new Date().toISOString()
							},
							{
								onConflict: 'user_id,location,recorded_at',
								ignoreDuplicates: false
							}
						);

						if (!error) {
							importedCount++;
						} else {
							if (error.code === '23505') {
								// Unique constraint violation
								skippedCount++;
							} else {
								errorCount++;
								console.error(`❌ Error inserting feature ${i}:`, error);
							}
						}
					} else {
						skippedCount++;
					}
				}

				const totalTime = (Date.now() - startTime) / 1000;
				console.log(`✅ GeoJSON import completed!`);
				console.log(`📊 Final stats:`);
				console.log(`   📥 Imported: ${importedCount.toLocaleString()} points`);
				console.log(`   ⏭️ Skipped: ${skippedCount.toLocaleString()} points`);
				console.log(`   ❌ Errors: ${errorCount.toLocaleString()} points`);
				console.log(`   ⏱️ Total time: ${totalTime.toFixed(1)}s`);
				console.log(`   🚀 Average rate: ${(importedCount / totalTime).toFixed(1)} points/sec`);
			}

			return importedCount;
		} catch (error) {
			// Check if the error is due to cancellation
			if (error instanceof Error && error.message === 'Job was cancelled') {
				console.log(`🛑 GeoJSON import was cancelled`);
				return 0;
			}
			console.error('❌ Error in GeoJSON import:', error);
			throw error;
		}
	}

	private static async importGPXWithProgress(
		content: string,
		userId: string,
		jobId: string,
		fileName: string
	): Promise<{ importedCount: number; totalItems: number }> {
		try {
			console.log('🗺️ Starting GPX import with progress tracking');

			// Parse GPX content
			const parser = new (await import('fast-xml-parser')).XMLParser({
				ignoreAttributes: false,
				attributeNamePrefix: '@_'
			});

			const gpxData = parser.parse(content);
			const tracks = gpxData.gpx?.trk || [];
			const waypoints = gpxData.gpx?.wpt || [];

			const totalItems = tracks.length + waypoints.length;
			let importedCount = 0;
			let skippedCount = 0;
			let errorCount = 0;

			console.log(`📊 GPX file contains:`);
			console.log(`   🎯 Waypoints: ${waypoints.length.toLocaleString()}`);
			console.log(`   🛤️ Tracks: ${tracks.length.toLocaleString()}`);
			console.log(`   📍 Total items: ${totalItems.toLocaleString()}`);

			await JobQueueService.updateJobProgress(jobId, 0, {
				message: `🗺️ Processing ${totalItems.toLocaleString()} GPX items...`,
				fileName,
				format: 'GPX',
				totalProcessed: 0,
				totalItems
			});

			const startTime = Date.now();

			// Process waypoints
			console.log(`🎯 Processing ${waypoints.length.toLocaleString()} waypoints...`);
			for (let i = 0; i < waypoints.length; i++) {
				// Check for cancellation every 5 waypoints
				if (i % 5 === 0) {
					await this.checkJobCancellation(jobId);
				}

				const waypoint = waypoints[i];
				const lat = parseFloat(waypoint['@_lat']);
				const lon = parseFloat(waypoint['@_lon']);

				if (!isNaN(lat) && !isNaN(lon)) {
					// Determine country code from coordinates
					const countryCode = await this.normalizeCountryCode(this.getCountryForPoint(lat, lon));

					const { error } = await supabase.from('tracker_data').upsert(
						{
							user_id: userId,
							tracker_type: 'import',
							location: `POINT(${lon} ${lat})`,
							recorded_at: waypoint.time || new Date().toISOString(),
							country_code: countryCode,
							raw_data: {
								name: waypoint.name || `GPX Waypoint ${i + 1}`,
								description: waypoint.desc || `Imported from ${fileName}`,
								category: 'waypoint',
								import_source: 'gpx',
								data_type: 'waypoint'
							},
							created_at: new Date().toISOString()
						},
						{
							onConflict: 'user_id,location,recorded_at',
							ignoreDuplicates: false
						}
					);

					if (!error) {
						importedCount++;
					} else {
						if (error.code === '23505') {
							// Unique constraint violation
							skippedCount++;
						} else {
							errorCount++;
							console.error(`❌ Error inserting waypoint ${i}:`, error);
						}
					}
				} else {
					skippedCount++;
				}

				// Update progress every 10 waypoints or at the end
				if (i % 10 === 0 || i === waypoints.length - 1) {
					const progress = Math.round((i / totalItems) * 100);
					console.log(
						`📈 Waypoints progress: ${i.toLocaleString()}/${waypoints.length.toLocaleString()} - Imported: ${importedCount.toLocaleString()} - Skipped: ${skippedCount.toLocaleString()} - Errors: ${errorCount.toLocaleString()}`
					);

					await JobQueueService.updateJobProgress(jobId, progress, {
						message: `🎯 Processing GPX waypoints... ${i.toLocaleString()}/${waypoints.length.toLocaleString()}`,
						fileName,
						format: 'GPX',
						totalProcessed: importedCount,
						totalItems
					});
				}
			}

			// Process tracks
			console.log(`🛤️ Processing ${tracks.length.toLocaleString()} tracks...`);
			for (let i = 0; i < tracks.length; i++) {
				// Check for cancellation before processing each track
				await this.checkJobCancellation(jobId);

				const track = tracks[i];
				const trackPoints = track.trkseg?.trkpt || [];

				console.log(
					`🛤️ Track ${i + 1}/${tracks.length}: ${trackPoints.length.toLocaleString()} points`
				);

				for (let j = 0; j < trackPoints.length; j++) {
					const point = trackPoints[j];
					const lat = parseFloat(point['@_lat']);
					const lon = parseFloat(point['@_lon']);

					if (!isNaN(lat) && !isNaN(lon)) {
						// Determine country code from coordinates
						const countryCode = this.normalizeCountryCode(this.getCountryForPoint(lat, lon));

						const { error } = await supabase.from('tracker_data').upsert(
							{
								user_id: userId,
								tracker_type: 'import',
								location: `POINT(${lon} ${lat})`,
								recorded_at: point.time || new Date().toISOString(),
								country_code: countryCode,
								raw_data: {
									import_source: 'gpx',
									data_type: 'track_point'
								},
								created_at: new Date().toISOString()
							},
							{
								onConflict: 'user_id,location,recorded_at',
								ignoreDuplicates: false
							}
						);

						if (!error) {
							importedCount++;
						} else {
							if (error.code === '23505') {
								// Unique constraint violation
								skippedCount++;
							} else {
								errorCount++;
								console.error(`❌ Error inserting track point ${j} in track ${i}:`, error);
							}
						}
					} else {
						skippedCount++;
					}
				}

				// Update progress every track
				const progress = Math.round(((waypoints.length + i + 1) / totalItems) * 100);
				console.log(
					`📈 Tracks progress: ${(i + 1).toLocaleString()}/${tracks.length.toLocaleString()} - Total imported: ${importedCount.toLocaleString()} - Skipped: ${skippedCount.toLocaleString()} - Errors: ${errorCount.toLocaleString()}`
				);

				await JobQueueService.updateJobProgress(jobId, progress, {
					message: `🛤️ Processing GPX tracks... ${(i + 1).toLocaleString()}/${tracks.length.toLocaleString()}`,
					fileName,
					format: 'GPX',
					totalProcessed: importedCount,
					totalItems
				});
			}

			const totalTime = (Date.now() - startTime) / 1000;
			console.log(`✅ GPX import completed!`);
			console.log(`📊 Final stats:`);
			console.log(`   📥 Imported: ${importedCount.toLocaleString()} points`);
			console.log(`   ⏭️ Skipped: ${skippedCount.toLocaleString()} points`);
			console.log(`   ❌ Errors: ${errorCount.toLocaleString()} points`);
			console.log(`   ⏱️ Total time: ${totalTime.toFixed(1)}s`);
			console.log(`   🚀 Average rate: ${(importedCount / totalTime).toFixed(1)} points/sec`);

			return { importedCount, totalItems };
		} catch (error) {
			// Check if the error is due to cancellation
			if (error instanceof Error && error.message === 'Job was cancelled') {
				console.log(`🛑 GPX import was cancelled`);
				return { importedCount: 0, totalItems: 0 };
			}
			console.error('❌ Error in GPX import:', error);
			throw error;
		}
	}

	private static async importOwnTracksWithProgress(
		content: string,
		userId: string,
		jobId: string,
		fileName: string
	): Promise<number> {
		try {
			console.log('🗺️ Starting OwnTracks import with progress tracking');

			const lines = content.split('\n').filter((line) => line.trim());
			const totalLines = lines.length;
			let importedCount = 0;
			let skippedCount = 0;
			let errorCount = 0;

			console.log(`📊 OwnTracks file contains ${totalLines.toLocaleString()} data points`);

			await JobQueueService.updateJobProgress(jobId, 0, {
				message: `🗺️ Processing ${totalLines.toLocaleString()} OwnTracks lines...`,
				fileName,
				format: 'OwnTracks',
				totalProcessed: 0,
				totalItems: totalLines
			});

			const startTime = Date.now();
			let lastLogTime = startTime;

			for (let i = 0; i < lines.length; i++) {
				// Check for cancellation every 100 lines
				if (i % 100 === 0) {
					await this.checkJobCancellation(jobId);
				}

				const line = lines[i].trim();
				if (!line) {
					skippedCount++;
					continue;
				}

				const currentTime = Date.now();

				// Log progress every 1000 lines or every 30 seconds
				if (i % 1000 === 0 || currentTime - lastLogTime > 30000) {
					const progress = Math.round((i / totalLines) * 100);
					const elapsedSeconds = (currentTime - startTime) / 1000;
					const rate = i > 0 ? (i / elapsedSeconds).toFixed(1) : '0';
					const eta = i > 0 ? ((totalLines - i) / (i / elapsedSeconds)).toFixed(0) : '0';

					console.log(
						`📈 Progress: ${i.toLocaleString()}/${totalLines.toLocaleString()} (${progress}%) - Rate: ${rate} lines/sec - ETA: ${eta}s - Imported: ${importedCount.toLocaleString()} - Skipped: ${skippedCount.toLocaleString()} - Errors: ${errorCount.toLocaleString()}`
					);

					await JobQueueService.updateJobProgress(jobId, progress, {
						message: `🗺️ Processing OwnTracks data... ${i.toLocaleString()}/${totalLines.toLocaleString()} (${progress}%)`,
						fileName,
						format: 'OwnTracks',
						totalProcessed: importedCount,
						totalItems: totalLines,
						rate: `${rate} lines/sec`,
						eta: `${eta}s`,
						skipped: skippedCount,
						errors: errorCount
					});

					lastLogTime = currentTime;
				}

				// Log milestone achievements
				if (importedCount > 0 && importedCount % 5000 === 0) {
					console.log(`🎉 Milestone: Imported ${importedCount.toLocaleString()} OwnTracks points!`);
					await JobQueueService.updateJobProgress(jobId, Math.round((i / totalLines) * 100), {
						message: `🎉 Imported ${importedCount.toLocaleString()} OwnTracks points!`,
						fileName,
						format: 'OwnTracks',
						totalProcessed: importedCount,
						totalItems: totalLines
					});
				}

				// Parse OwnTracks format: timestamp,lat,lon,altitude,accuracy,vertical_accuracy,velocity,heading,event
				const parts = line.split(',');
				if (parts.length >= 3) {
					const timestamp = parseInt(parts[0]);
					const lat = parseFloat(parts[1]);
					const lon = parseFloat(parts[2]);

					if (!isNaN(timestamp) && !isNaN(lat) && !isNaN(lon)) {
						// Determine country code from coordinates
						const countryCode = this.normalizeCountryCode(this.getCountryForPoint(lat, lon));

						const { error } = await supabase.from('tracker_data').upsert(
							{
								user_id: userId,
								tracker_type: 'import',
								location: `POINT(${lon} ${lat})`,
								recorded_at: new Date(timestamp * 1000).toISOString(),
								country_code: countryCode,
								altitude: parts[3] ? parseFloat(parts[3]) : null,
								accuracy: parts[4] ? parseFloat(parts[4]) : null,
								speed: parts[6] ? parseFloat(parts[6]) : null,
								heading: parts[7] ? parseFloat(parts[7]) : null,
								raw_data: {
									import_source: 'owntracks',
									data_type: 'location_point',
									event: parts[8] || null,
									vertical_accuracy: parts[5] ? parseFloat(parts[5]) : null
								},
								created_at: new Date().toISOString()
							},
							{
								onConflict: 'user_id,location,recorded_at',
								ignoreDuplicates: false
							}
						);

						if (!error) {
							importedCount++;
						} else {
							if (error.code === '23505') {
								// Unique constraint violation
								skippedCount++;
							} else {
								errorCount++;
								console.error(`❌ Error inserting OwnTracks line ${i}:`, error);
							}
						}
					} else {
						skippedCount++;
					}
				} else {
					skippedCount++;
				}
			}

			const totalTime = (Date.now() - startTime) / 1000;
			console.log(`✅ OwnTracks import completed!`);
			console.log(`📊 Final stats:`);
			console.log(`   📥 Imported: ${importedCount.toLocaleString()} points`);
			console.log(`   ⏭️ Skipped: ${skippedCount.toLocaleString()} points`);
			console.log(`   ❌ Errors: ${errorCount.toLocaleString()} points`);
			console.log(`   ⏱️ Total time: ${totalTime.toFixed(1)}s`);
			console.log(`   🚀 Average rate: ${(importedCount / totalTime).toFixed(1)} points/sec`);

			return importedCount;
		} catch (error) {
			// Check if the error is due to cancellation
			if (error instanceof Error && error.message === 'Job was cancelled') {
				console.log(`🛑 OwnTracks import was cancelled`);
				return 0;
			}
			console.error('❌ Error in OwnTracks import:', error);
			throw error;
		}
	}

	private static getCountryForPoint(lat: number, lon: number): string | null {
		try {
			return getCountryForPoint(lat, lon);
		} catch (error) {
			console.warn('Failed to get country for point:', error);
			return null;
		}
	}

	private static normalizeCountryCode(countryCode: string | null): string | null {
		try {
			return normalizeCountryCode(countryCode);
		} catch (error) {
			console.warn('Failed to normalize country code:', error);
			return null;
		}
	}

	private static async processDataExport(job: Job): Promise<void> {
		console.log(`📦 Processing data export job ${job.id}`);

		try {
			await ExportProcessorService.processExport(job);
		} catch (error) {
			console.error(`❌ Error in data export job:`, error);
			throw error;
		}
	}

	private static async processPoiVisitDetection(job: Job): Promise<void> {
		console.log(`📍 Processing POI visit detection job ${job.id}`);

		const startTime = Date.now();
		const enhancedPoiService = new EnhancedPoiDetectionService();

		try {
			// Check for cancellation before starting
			await this.checkJobCancellation(job.id);

			// Update job progress to started
			await JobQueueService.updateJobProgress(job.id, 0, {
				message: 'Starting POI visit detection...',
				totalProcessed: 0,
				totalDetected: 0
			});

			// Get configuration from job data or use defaults
			const config = {
				minDwellMinutes: (job.data.minDwellMinutes as number) || 15,
				maxDistanceMeters: (job.data.maxDistanceMeters as number) || 100,
				minConsecutivePoints: (job.data.minConsecutivePoints as number) || 3,
				lookbackDays: (job.data.lookbackDays as number) || 7
			};

			// Check if this is for a specific user or all users
			const targetUserId = job.data.userId as string;

			if (targetUserId) {
				// Process for specific user
				await JobQueueService.updateJobProgress(job.id, 25, {
					message: `Detecting visits for user ${targetUserId}...`,
					totalProcessed: 0,
					totalDetected: 0
				});

				// Check for cancellation before processing user
				await this.checkJobCancellation(job.id);

				const userResult = await enhancedPoiService.detectVisitsForUser(targetUserId, config);

				await JobQueueService.updateJobProgress(job.id, 75, {
					message: `Found ${userResult.totalDetected} visits for user`,
					totalProcessed: 1,
					totalDetected: userResult.totalDetected
				});

				// Complete the job
				const elapsedSeconds = (Date.now() - startTime) / 1000;

				await JobQueueService.updateJobProgress(job.id, 100, {
					message: `✅ POI visit detection completed for user ${targetUserId}`,
					totalProcessed: 1,
					totalDetected: userResult.totalDetected,
					elapsedSeconds: elapsedSeconds.toFixed(1)
				});

				console.log(`✅ POI visit detection completed in ${elapsedSeconds.toFixed(1)}s`);
			} else {
				// Process for all users
				await JobQueueService.updateJobProgress(job.id, 25, {
					message: 'Detecting visits for all users...',
					totalProcessed: 0,
					totalDetected: 0
				});

				// Check for cancellation before processing all users
				await this.checkJobCancellation(job.id);

				// For automatic POI detection, we need to process users individually
				// since we don't have a separate POI table to query
				const { data: users, error: usersError } = await supabase
					.from('tracker_data')
					.select('user_id')
					.not('geocode', 'is', null);

				if (usersError) throw usersError;

				const uniqueUserIds = [...new Set(users.map((u) => u.user_id))];
				const allUsersResults = [];

				for (const userId of uniqueUserIds) {
					try {
						const result = await enhancedPoiService.detectVisitsForUser(userId, config);
						allUsersResults.push({
							userId,
							visits: result.visits,
							totalDetected: result.totalDetected
						});
					} catch (error) {
						console.error(`Error detecting visits for user ${userId}:`, error);
						allUsersResults.push({
							userId,
							visits: [],
							totalDetected: 0
						});
					}
				}

				const totalDetected = allUsersResults.reduce((sum, r) => sum + r.totalDetected, 0);
				const totalUsers = allUsersResults.length;

				await JobQueueService.updateJobProgress(job.id, 75, {
					message: `Found ${totalDetected} visits across ${totalUsers} users`,
					totalProcessed: totalUsers,
					totalDetected: totalDetected
				});

				// Complete the job
				const elapsedSeconds = (Date.now() - startTime) / 1000;

				await JobQueueService.updateJobProgress(job.id, 100, {
					message: `✅ POI visit detection completed for all users`,
					totalProcessed: totalUsers,
					totalDetected: totalDetected,
					elapsedSeconds: elapsedSeconds.toFixed(1)
				});

				console.log(`✅ POI visit detection completed in ${elapsedSeconds.toFixed(1)}s`);
			}
		} catch (error: unknown) {
			// Check if the error is due to cancellation
			if (error instanceof Error && error.message === 'Job was cancelled') {
				console.log(`🛑 POI visit detection job ${job.id} was cancelled`);
				return;
			}
			console.error(`❌ Error in POI visit detection job:`, error);
			throw error;
		}
	}

	// Trip Generation Helper Methods

	private static async analyzeTripsFromGPSData(
		trackerData: TrackerDataPoint[],
		homeAddress: HomeAddress | null,
		exclusions: TripExclusion[]
	): Promise<DetectedTrip[]> {
		const trips: DetectedTrip[] = [];
		const HOME_RADIUS_KM = 50; // Consider within 50km as "home"

		// Group data points by day
		const dailyGroups = this.groupDataByDay(trackerData);

		// Analyze each day to detect overnight stays
		for (const [date, dayData] of Object.entries(dailyGroups)) {
			if (dayData.length === 0) continue;

			// Check if user was away from home for an extended period
			const isAwayFromHome = this.isAwayFromHome(dayData, homeAddress, HOME_RADIUS_KM);

			if (isAwayFromHome) {
				// Check if this location is in the exclusion list
				const isExcluded = this.isLocationExcluded(dayData[0], exclusions);

				if (!isExcluded) {
					// This could be the start of a trip
					const trip = await this.createTripFromDayData(date, dayData);
					if (trip) {
						trips.push(trip);
					}
				}
			}
		}

		// Merge consecutive days into single trips
		return this.mergeConsecutiveTrips(trips);
	}

	private static groupDataByDay(
		trackerData: TrackerDataPoint[]
	): Record<string, TrackerDataPoint[]> {
		const groups: Record<string, TrackerDataPoint[]> = {};

		for (const point of trackerData) {
			const date = new Date(point.recorded_at).toISOString().split('T')[0];
			if (!groups[date]) {
				groups[date] = [];
			}
			groups[date].push(point);
		}

		return groups;
	}

	private static isAwayFromHome(
		dayData: TrackerDataPoint[],
		homeAddress: HomeAddress | null,
		radiusKm: number
	): boolean {
		if (!homeAddress || !homeAddress.coordinates) {
			// If no home address, assume user is always "away"
			return true;
		}

		const homeLat = homeAddress.coordinates.lat;
		const homeLng = homeAddress.coordinates.lng;

		// Check if any point in the day is away from home
		for (const point of dayData) {
			if (point.location && point.location.coordinates) {
				const distance = this.calculateDistance(
					homeLat,
					homeLng,
					point.location.coordinates[1], // lat
					point.location.coordinates[0] // lng
				);

				if (distance > radiusKm) {
					return true;
				}
			}
		}

		return false;
	}

	private static isLocationExcluded(point: TrackerDataPoint, exclusions: TripExclusion[]): boolean {
		if (!point.location || !point.location.coordinates) return false;

		for (const exclusion of exclusions) {
			if (exclusion.location && exclusion.location.coordinates) {
				const distance = this.calculateDistance(
					point.location.coordinates[1], // lat
					point.location.coordinates[0], // lng
					exclusion.location.coordinates.lat,
					exclusion.location.coordinates.lng
				);

				// If within 10km of exclusion, consider it excluded
				if (distance < 10) {
					return true;
				}
			}
		}

		return false;
	}

	private static async createTripFromDayData(
		date: string,
		dayData: TrackerDataPoint[]
	): Promise<DetectedTrip | null> {
		if (dayData.length === 0) return null;

		// Get the most common location for this day
		const location = this.getMostCommonLocation(dayData);
		if (!location) return null;

		// Try to get city name from reverse geocoding
		let cityName = 'Unknown Location';
		try {
			const geocodeResult = await reverseGeocode(location.coordinates[1], location.coordinates[0]);
			if (geocodeResult && geocodeResult.address) {
				cityName =
					geocodeResult.address.city ||
					geocodeResult.address.town ||
					geocodeResult.address.village ||
					'Unknown Location';
			}
		} catch (error) {
			console.warn('Failed to reverse geocode location:', error);
		}

		return {
			startDate: date,
			endDate: date,
			title: `Trip to ${cityName}`,
			description: `Automatically generated trip to ${cityName}`,
			location: location,
			cityName: cityName
		};
	}

	private static getMostCommonLocation(
		dayData: TrackerDataPoint[]
	): { type: string; coordinates: number[] } | null {
		// Simple implementation: return the first valid location
		for (const point of dayData) {
			if (point.location && point.location.coordinates) {
				return point.location;
			}
		}
		return null;
	}

	private static mergeConsecutiveTrips(trips: DetectedTrip[]): DetectedTrip[] {
		if (trips.length <= 1) return trips;

		const merged: DetectedTrip[] = [];
		let currentTrip = { ...trips[0] };

		for (let i = 1; i < trips.length; i++) {
			const nextTrip = trips[i];
			const currentEnd = new Date(currentTrip.endDate);
			const nextStart = new Date(nextTrip.startDate);

			// Check if trips are consecutive (within 1 day)
			const dayDiff = (nextStart.getTime() - currentEnd.getTime()) / (1000 * 60 * 60 * 24);

			if (dayDiff <= 1 && currentTrip.cityName === nextTrip.cityName) {
				// Merge trips
				currentTrip.endDate = nextTrip.endDate;
				currentTrip.title = `Trip to ${currentTrip.cityName}`;
			} else {
				// End current trip and start new one
				merged.push(currentTrip);
				currentTrip = { ...nextTrip };
			}
		}

		merged.push(currentTrip);
		return merged;
	}

	private static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
		const R = 6371; // Earth's radius in kilometers
		const dLat = this.deg2rad(lat2 - lat1);
		const dLng = this.deg2rad(lng2 - lng1);
		const a =
			Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos(this.deg2rad(lat1)) *
				Math.cos(this.deg2rad(lat2)) *
				Math.sin(dLng / 2) *
				Math.sin(dLng / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return R * c;
	}

	private static deg2rad(deg: number): number {
		return deg * (Math.PI / 180);
	}

	private static async generateTripBanners(trips: DetectedTrip[]): Promise<DetectedTrip[]> {
		const tripsWithBanners = [...trips];

		// Get unique city names
		const cities = [...new Set(trips.map((trip) => trip.cityName))];

		// Fetch banner images for cities
		try {
			const { getMultipleTripBannerImages } = await import('../external/pexels.service');
			const bannerImages = await getMultipleTripBannerImages(cities);

			// Assign banner images to trips
			for (const trip of tripsWithBanners) {
				trip.image_url = bannerImages[trip.cityName] || undefined;
			}
		} catch (error) {
			console.error('Error generating trip banners:', error);
			// Continue without banner images if there's an error
		}

		return tripsWithBanners;
	}

	private static async saveTripsToDatabase(
		trips: DetectedTrip[],
		userId: string,
		jobId: string
	): Promise<unknown[]> {
		const savedTrips = [];
		const tripLocationsService = new TripLocationsService();
		// Switch to worker client for this instance
		tripLocationsService.useWorkerClient();

		for (const trip of trips) {
			const { data: savedTrip, error } = await supabase
				.from('trips')
				.insert({
					user_id: userId,
					title: trip.title,
					description: trip.description,
					start_date: trip.startDate,
					end_date: trip.endDate,
					image_url: trip.image_url,
					labels: ['auto-generated'],
					status: 'approved',
					metadata: {
						distance_traveled: 0, // Will be calculated from tracker data
						visited_places_count: 1, // At least the destination city
						cityName: trip.cityName,
						location: trip.location,
						jobId: jobId
					}
				})
				.select()
				.single();

			if (error) {
				console.error('Error saving trip:', error);
			} else if (savedTrip && savedTrip.id) {
				// --- Calculate geopoints and distance, then update metadata ---
				try {
					const points = await tripLocationsService.getTripLocations(savedTrip.id);
					const pointCount = points.length;
					let distance = 0;
					for (let i = 1; i < points.length; i++) {
						const prev = points[i - 1].location.coordinates;
						const curr = points[i].location.coordinates;
						distance += haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
					}
					await supabase
						.from('trips')
						.update({
							metadata: {
								...savedTrip.metadata,
								point_count: pointCount,
								distance_traveled: distance
							}
						})
						.eq('id', savedTrip.id);
				} catch (err) {
					console.error('Error updating trip metadata (auto-generated):', err);
				}
				savedTrips.push(savedTrip);
			}
		}

		return savedTrips;
	}

	/**
	 * Find multiple available date ranges for trip generation, excluding rejected dates
	 */
	private static async findAvailableDateRanges(
		userId: string,
		userStartDate?: string,
		userEndDate?: string
	): Promise<Array<{ startDate: string; endDate: string }>> {
		try {
			console.log('🔍 Finding available date ranges for trip generation...');
			console.log(`👤 User ID: ${userId}`);
			if (userStartDate) console.log(`📅 User specified start date: ${userStartDate}`);
			if (userEndDate) console.log(`📅 User specified end date: ${userEndDate}`);

			// First, get the full date range of user's tracker data (without user constraints)
			// This gives us the complete range of available data
			const { data: earliestData, error: earliestError } = await supabase
				.from('tracker_data')
				.select('recorded_at')
				.eq('user_id', userId)
				.order('recorded_at', { ascending: true })
				.limit(1);

			const { data: latestData, error: latestError } = await supabase
				.from('tracker_data')
				.select('recorded_at')
				.eq('user_id', userId)
				.order('recorded_at', { ascending: false })
				.limit(1);

			if (earliestError || latestError) {
				console.error('Error fetching tracker data date range:', earliestError || latestError);
				return [];
			}

			if (!earliestData || earliestData.length === 0 || !latestData || latestData.length === 0) {
				console.log('❌ No tracker data found for user');

				return [];
			}

			const dataEarliestDate = new Date(earliestData[0].recorded_at).toISOString().split('T')[0];
			const dataLatestDate = new Date(latestData[0].recorded_at).toISOString().split('T')[0];

			console.log(`📅 Full data range from tracker data: ${dataEarliestDate} to ${dataLatestDate}`);

			// Now apply user constraints to determine the effective search range
			let earliestDate = dataEarliestDate;
			let latestDate = dataLatestDate;

			if (userStartDate) {
				const userStart = new Date(userStartDate);
				const dataStart = new Date(dataEarliestDate);

				if (userStart > dataStart) {
					earliestDate = userStartDate;
					console.log(`📅 Applied user start date constraint: earliest date now ${earliestDate}`);
				} else {
					console.log(
						`📅 User start date ${userStartDate} is before or equal to data start date ${dataEarliestDate}, using data start date`
					);
				}
			}

			if (userEndDate) {
				const userEnd = new Date(userEndDate);
				const dataEnd = new Date(dataLatestDate);

				if (userEnd < dataEnd) {
					latestDate = userEndDate;
					console.log(`📅 Applied user end date constraint: latest date now ${latestDate}`);
				} else {
					console.log(
						`📅 User end date ${userEndDate} is after or equal to data end date ${dataLatestDate}, using data end date`
					);
				}
			}

			console.log(
				`📅 Effective search range (after applying user constraints): ${earliestDate} to ${latestDate}`
			);

			// Get all existing trip date ranges (from both trips and suggested_trips tables)
			// Include all approved trips, active trips, completed trips, and rejected trips
			const { data: existingTrips, error: tripsError } = await supabase
				.from('trips')
				.select('start_date, end_date')
				.eq('user_id', userId)
				.in('status', ['approved', 'active', 'completed', 'rejected']);

			if (tripsError) {
				console.error('Error fetching existing trips:', tripsError);
				return [];
			}

			const { data: existingSuggestedTrips, error: suggestedTripsError } = await supabase
				.from('suggested_trips')
				.select('start_date, end_date')
				.eq('user_id', userId)
				.in('status', ['pending', 'approved']);

			if (suggestedTripsError) {
				console.error('Error fetching existing suggested trips:', suggestedTripsError);
				return [];
			}

			console.log('📋 Found existing trips:', existingTrips?.length || 0);
			if (existingTrips && existingTrips.length > 0) {
				console.log('📋 Existing trips details:');
				existingTrips.forEach((trip, index) => {
					console.log(`  Trip ${index + 1}: ${trip.start_date} to ${trip.end_date}`);
				});
			}

			console.log('📋 Found existing suggested trips:', existingSuggestedTrips?.length || 0);
			if (existingSuggestedTrips && existingSuggestedTrips.length > 0) {
				console.log('📋 Existing suggested trips details:');
				existingSuggestedTrips.forEach((trip, index) => {
					console.log(`  Suggested Trip ${index + 1}: ${trip.start_date} to ${trip.end_date}`);
				});
			}

			// Create a set of all dates that are already covered by existing trips
			const excludedDates = new Set();

			// Add dates from existing trips
			let tripsDatesAdded = 0;
			existingTrips?.forEach((trip) => {
				const start = new Date(trip.start_date);
				const end = new Date(trip.end_date);
				for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
					excludedDates.add(d.toISOString().split('T')[0]);
					tripsDatesAdded++;
				}
			});

			// Add dates from existing suggested trips
			let suggestedTripsDatesAdded = 0;
			existingSuggestedTrips?.forEach((trip) => {
				const start = new Date(trip.start_date);
				const end = new Date(trip.end_date);
				for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
					excludedDates.add(d.toISOString().split('T')[0]);
					suggestedTripsDatesAdded++;
				}
			});

			console.log('📅 Excluded dates count:', excludedDates.size);
			console.log('📅 Dates added from existing trips:', tripsDatesAdded);
			console.log('📅 Dates added from suggested trips:', suggestedTripsDatesAdded);

			const effectiveStartDate = new Date(earliestDate);
			const effectiveEndDate = new Date(latestDate);
			const availableRanges: Array<{ startDate: string; endDate: string }> = [];

			// For sleep-based trip detection, we need to find available date ranges
			// by excluding dates that are already covered by existing trips
			console.log('🔍 Finding available date ranges by excluding existing trip dates...');

			// Find all available date ranges (periods not covered by existing trips)
			let currentRangeStart: string | null = null;

			for (
				let d = new Date(effectiveStartDate);
				d <= effectiveEndDate;
				d.setDate(d.getDate() + 1)
			) {
				const dateStr = d.toISOString().split('T')[0];
				const isExcluded = excludedDates.has(dateStr);

				if (!isExcluded && currentRangeStart === null) {
					// Start of a new available range
					currentRangeStart = dateStr;
				} else if (isExcluded && currentRangeStart !== null) {
					// End of current available range
					const rangeEnd = new Date(d.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
					availableRanges.push({
						startDate: currentRangeStart,
						endDate: rangeEnd
					});
					currentRangeStart = null;
				}
			}

			// Handle case where the last available range extends to the end
			if (currentRangeStart !== null) {
				availableRanges.push({
					startDate: currentRangeStart,
					endDate: latestDate
				});
			}

			console.log(`📊 Found ${availableRanges.length} initial available ranges before filtering`);

			// Filter out ranges that are too short (less than 2 days for meaningful trip detection)
			const filteredRanges = availableRanges.filter((range) => {
				const start = new Date(range.startDate);
				const end = new Date(range.endDate);
				const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

				// Check minimum length
				if (daysDiff < 2) {
					console.log(
						`❌ Filtering out range ${range.startDate} to ${range.endDate}: too short (${daysDiff} days < 2)`
					);
					return false;
				}

				console.log(`✅ Keeping range ${range.startDate} to ${range.endDate} (${daysDiff} days)`);
				return true;
			});

			const rangesFilteredByLength = availableRanges.length - filteredRanges.length;

			console.log(`📊 Filtering summary:`);
			console.log(`   - Total ranges found: ${availableRanges.length}`);
			console.log(`   - Ranges filtered by length (< 2 days): ${rangesFilteredByLength}`);
			console.log(`   - Final ranges: ${filteredRanges.length}`);

			if (filteredRanges.length === 0) {
				console.log(
					'❌ No available date ranges found after filtering (all ranges too short or all dates excluded)'
				);
				return [];
			}

			console.log(
				`✅ Found ${filteredRanges.length} available date ranges for sleep pattern analysis:`
			);
			filteredRanges.forEach((range, index) => {
				const start = new Date(range.startDate);
				const end = new Date(range.endDate);
				const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
				console.log(
					`  Range ${index + 1}: ${range.startDate} to ${range.endDate} (${daysDiff} days)`
				);
			});

			console.log(
				`🎯 Found ${filteredRanges.length} available date ranges for sleep-based trip detection`
			);
			return filteredRanges;
		} catch (error) {
			console.error('❌ Error finding available date ranges:', error);
			return [];
		}
	}

	/**
	 * Fetch tracker data for a specific date range with sleep hours filtering applied during the database query
	 * This optimizes performance by filtering data as early as possible during the fetch operation
	 */
	private static async fetchTrackerDataForRange(
		userId: string,
		range: { startDate: string; endDate: string },
		config: {
			overnightHoursStart: number;
			overnightHoursEnd: number;
		},
		pageSize: number = 1000
	): Promise<{
		data: TrackerDataPoint[];
		totalFetched: number;
		totalFiltered: number;
		pageCount: number;
	}> {
		console.log(
			`📊 Fetching tracker data for range ${range.startDate} to ${range.endDate} with sleep hours filtering`
		);

		const allTrackerData: TrackerDataPoint[] = [];
		let hasMore = true;
		let offset = 0;
		let pageCount = 0;
		let totalFetched = 0;
		let totalFiltered = 0;

		// Instead of creating individual time ranges for each day, we'll use a more efficient approach
		// by fetching data in chunks and filtering by sleep hours in memory for smaller chunks
		const chunkSize = 30; // Process 30 days at a time to avoid URL length issues
		const startDate = new Date(range.startDate);
		const endDate = new Date(range.endDate);

		console.log(`📅 Processing date range in ${chunkSize}-day chunks to avoid URL length limits`);

		// Process the date range in chunks
		for (
			let chunkStart = new Date(startDate);
			chunkStart <= endDate;
			chunkStart.setDate(chunkStart.getDate() + chunkSize)
		) {
			const chunkEnd = new Date(chunkStart);
			chunkEnd.setDate(chunkEnd.getDate() + chunkSize - 1);

			// Don't exceed the original end date
			if (chunkEnd > endDate) {
				chunkEnd.setTime(endDate.getTime());
			}

			const chunkStartStr = chunkStart.toISOString().split('T')[0];
			const chunkEndStr = chunkEnd.toISOString().split('T')[0];

			console.log(`📅 Processing chunk: ${chunkStartStr} to ${chunkEndStr}`);

			// Reset pagination for each chunk
			let chunkOffset = 0;
			let chunkHasMore = true;
			let chunkPageCount = 0;

			while (chunkHasMore) {
				chunkPageCount++;
				console.log(
					`📄 Fetching page ${chunkPageCount} (offset: ${chunkOffset}) for chunk ${chunkStartStr} to ${chunkEndStr}`
				);

				// Build query for this chunk
				let query = supabase
					.from('tracker_data')
					.select('*')
					.eq('user_id', userId)
					.gte('recorded_at', `${chunkStartStr}T00:00:00Z`)
					.lte('recorded_at', `${chunkEndStr}T23:59:59Z`)
					.order('recorded_at', { ascending: true })
					.range(chunkOffset, chunkOffset + pageSize - 1);

				const { data: pageData, error: pageError } = await query;

				if (pageError) {
					console.error('Error fetching tracker data:', pageError);
					throw pageError;
				}

				if (!pageData || pageData.length === 0) {
					console.log(`📄 No more data found for chunk after ${chunkPageCount} pages`);
					chunkHasMore = false;
				} else {
					totalFetched += pageData.length;

					// Filter this page to sleep hours only
					const filteredPageData = pageData.filter((point) => {
						const recordedTime = new Date(point.recorded_at);
						const hour = recordedTime.getHours();

						// Handle overnight hours (e.g., 20:00 to 08:00)
						if (config.overnightHoursStart > config.overnightHoursEnd) {
							// Overnight period spans midnight (e.g., 20:00 to 08:00)
							return hour >= config.overnightHoursStart || hour < config.overnightHoursEnd;
						} else {
							// Normal period within same day (e.g., 22:00 to 06:00)
							return hour >= config.overnightHoursStart && hour < config.overnightHoursEnd;
						}
					});

					totalFiltered += filteredPageData.length;
					allTrackerData.push(...filteredPageData);

					console.log(
						`📄 Page ${chunkPageCount}: Got ${pageData.length} data points, filtered to ${filteredPageData.length} sleep hours points`
					);
					chunkOffset += pageSize;

					// If we got less than pageSize, we've reached the end of this chunk
					if (pageData.length < pageSize) {
						console.log(`📄 Reached end of chunk after ${chunkPageCount} pages`);
						chunkHasMore = false;
					}
				}
			}

			pageCount += chunkPageCount;
		}

		console.log(
			`📊 Sleep hours data fetch completed: ${totalFetched} total points → ${totalFiltered} sleep hours points (${pageCount} pages across all chunks)`
		);

		return {
			data: allTrackerData,
			totalFetched,
			totalFiltered,
			pageCount
		};
	}
}
