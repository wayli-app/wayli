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
import { TripDetectionService } from '../trip-detection.service';
// Import TripLocationsService but we'll create our own instance with worker client
import { TripLocationsService } from '../../services/trip-locations.service';
import { UserProfileService } from '../user-profile.service';
import { haversineDistance } from '../../utils';
import {
	getCountryForPoint,
	normalizeCountryCode
} from '../external/country-reverse-geocoding.service';
import { ExportProcessorService } from '../export-processor.service';
import { needsGeocoding, isRetryableError, createPermanentError, createRetryableError } from '../../utils/geocoding-utils';
import { createWorkerClient } from '$lib/core/supabase/worker-client';
import { cpus } from 'node:os';

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
			trip_generation: this.processTripGeneration.bind(this),
			data_export: this.processDataExport.bind(this)
			// Note: Removed image_generation since images are now generated during trip approval
		};

		return processors[jobType];
	}

	private static async processReverseGeocodingMissing(job: Job): Promise<void> {
		console.log(`🌍 Processing reverse geocoding missing job ${job.id}`);

		const startTime = Date.now();
		const BATCH_SIZE = 1000;
		const userId = job.created_by;

		// Initialize cumulative totals from job metadata or start at 0
		let totalProcessed = 0;
		let totalSuccess = 0;
		let totalErrors = 0;

		// Try to restore cumulative totals from job metadata
		if (job.result && typeof job.result === 'object') {
			const metadata = job.result as Record<string, unknown>;
			totalProcessed = (metadata.totalProcessed as number) || 0;
			totalSuccess = (metadata.totalSuccess as number) || 0;
			totalErrors = (metadata.totalErrors as number) || 0;


		}

		try {
			// Check for cancellation before starting
			await this.checkJobCancellation(job.id);

			// Initialize cache with current database state at job start
			console.log(`🔄 Initializing geocoding cache with current database state...`);
			try {
				// Get the actual total points in the database for this user
				const { count: actualTotalPoints, error: countError } = await supabase
					.from('tracker_data')
					.select('*', { count: 'exact', head: true })
					.eq('user_id', userId)
					.not('location', 'is', null);

				if (countError) {
					console.error(`❌ Failed to get total points count:`, countError);
				} else {
					// Get the actual total geocoded points in the database
					const { count: actualGeocodedPoints, error: geocodedCountError } = await supabase
						.from('tracker_data')
						.select('*', { count: 'exact', head: true })
						.eq('user_id', userId)
						.not('location', 'is', null)
						.not('geocode', 'is', null)
						.neq('geocode', '{}');

					if (geocodedCountError) {
						console.error(`❌ Failed to get geocoded points count:`, geocodedCountError);
					} else {
						const totalPointsInDB = actualTotalPoints || 0;
						const totalGeocodedInDB = actualGeocodedPoints || 0;
						const pointsNeedingGeocoding = totalPointsInDB - totalGeocodedInDB;



						const { error: cacheUpdateError } = await supabase.rpc('update_geocoding_stats_cache', {
							p_user_id: userId,
							p_total_points: totalPointsInDB,
							p_geocoded_points: totalGeocodedInDB,
							p_points_needing_geocoding: pointsNeedingGeocoding,
							p_null_or_empty_geocodes: 0, // Will be recalculated by statistics API
							p_retryable_errors: 0, // Will be recalculated by statistics API
							p_non_retryable_errors: 0
						});

						if (cacheUpdateError) {
							console.error(`❌ Failed to initialize geocoding cache:`, cacheUpdateError);
						} else {
							console.log(`✅ Initialized geocoding statistics cache with current database state`);

							// Verify the cache was updated correctly
							const { data: verifyCache, error: verifyError } = await supabase
								.from('user_profiles')
								.select('geocoding_stats')
								.eq('id', userId)
								.single();

							if (verifyError) {
								console.error(`❌ Failed to verify cache update:`, verifyError);
							} else {
								console.log(`🔍 Cache verification:`, verifyCache?.geocoding_stats);
							}
						}
					}
				}
			} catch (cacheError) {
				console.error(`❌ Error initializing geocoding cache:`, cacheError);
			}

			// Get ALL points first, then filter in code to understand what's happening
			// Use pagination to fetch all points, not just the first 1000
			let allPoints: any[] = [];
			let offset = 0;
			const limit = 1000;
			let hasMore = true;

			while (hasMore) {
				const { data: batchPoints, error: batchError } = await supabase
					.from('tracker_data')
					.select('geocode')
					.eq('user_id', userId)
					.not('location', 'is', null)
					.range(offset, offset + limit - 1);

				if (batchError) throw batchError;

				if (!batchPoints || batchPoints.length === 0) {
					hasMore = false;
				} else {
					allPoints = allPoints.concat(batchPoints);
					offset += limit;

					// Safety check to prevent infinite loops
					if (offset > 1000000) {
						console.warn('⚠️ Too many records, stopping at 1M');
						break;
					}
				}
			}

			// Debug: Log the breakdown of all points
			let nullGeocodes = 0;
			let emptyGeocodes = 0;
			let errorGeocodes = 0;
			let validGeocodes = 0;
			let noGeocodeField = 0;
			let debugRetryableErrors = 0;
			let debugNonRetryableErrors = 0;

			if (allPoints) {
				for (const point of allPoints) {
					const geocode = point.geocode;
					if (!geocode) {
						nullGeocodes++;
					} else if (typeof geocode === 'object' && geocode !== null && Object.keys(geocode).length === 0) {
						emptyGeocodes++;
					} else if (typeof geocode === 'object' && geocode !== null && 'error' in geocode && geocode.error) {
						errorGeocodes++;

												// Debug: Check if this is retryable
						const isRetryable = this.isRetryableError(geocode);
						if (isRetryable) {
							debugRetryableErrors++;
						} else {
							debugNonRetryableErrors++;
						}

						// Debug: Log the first few error messages
						if (debugRetryableErrors + debugNonRetryableErrors <= 5) {
							const errorMessage = String((geocode as any).error_message || 'no message');
							console.log(`🔍 Error geocode ${debugRetryableErrors + debugNonRetryableErrors}: "${errorMessage}" (retryable: ${isRetryable})`);
						}
					} else {
						validGeocodes++;
					}
				}
			}

			console.log(`🔍 Total points breakdown: ${allPoints?.length || 0} total`);
			console.log(`🔍 - Null geocodes: ${nullGeocodes}`);
			console.log(`🔍 - Empty geocodes: ${emptyGeocodes}`);
			console.log(`🔍 - Error geocodes: ${errorGeocodes}`);
			console.log(`🔍 - Valid geocodes: ${validGeocodes}`);
			console.log(`🔍 Error breakdown: ${debugRetryableErrors} retryable, ${debugNonRetryableErrors} non-retryable`);

			// Filter points that need geocoding using shared utility
			const pointsNeedingGeocoding = allPoints?.filter(point => needsGeocoding(point.geocode)) || [];

			const trackerDataCount = pointsNeedingGeocoding.length;

			const totalPoints = trackerDataCount || 0;

			// Calculate error breakdown from the main allPoints data
			let retryableErrors = 0;
			let nonRetryableErrors = 0;

			if (allPoints) {
				for (const point of allPoints) {
					const geocode = point.geocode;
					if (geocode && typeof geocode === 'object' && geocode !== null && 'error' in geocode && geocode.error) {
						if (isRetryableError(geocode)) {
							retryableErrors++;
						} else {
							nonRetryableErrors++;
						}
					}
				}
			}


			console.log(`🔍 Error breakdown: ${retryableErrors} retryable, ${nonRetryableErrors} non-retryable`);

			// Update initial progress and store metadata
			await JobQueueService.updateJobProgress(job.id, 0, {
				message: `Found ${totalPoints.toLocaleString()} tracker data points needing geocoding. Starting processing...`,
				// Store cumulative totals in metadata for persistence
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
					// Store cumulative totals in metadata for persistence
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

					// Cap progress at 100% to avoid database constraint violation
					const progress = Math.min(100, Math.round((totalProcessed / totalPoints) * 100));

					// Update job progress with detailed information and store cumulative totals in metadata
					JobQueueService.updateJobProgress(job.id, progress, {
						// Store cumulative totals in metadata for persistence across progress updates
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
							20, // CONCURRENT_REQUESTS
							Date.now() - startTime
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

			// Update the geocoding statistics cache with correct values
			// This ensures the frontend shows accurate numbers that match the actual database state

			// Update the geocoding statistics cache with correct values
			try {
				// Get the actual total points in the database for this user
				const { count: actualTotalPoints, error: countError } = await supabase
					.from('tracker_data')
					.select('*', { count: 'exact', head: true })
					.eq('user_id', userId)
					.not('location', 'is', null);

				if (countError) {
					console.error(`❌ Failed to get total points count:`, countError);
				} else {
					// Get the actual total geocoded points in the database
					const { count: actualGeocodedPoints, error: geocodedCountError } = await supabase
						.from('tracker_data')
						.select('*', { count: 'exact', head: true })
						.eq('user_id', userId)
						.not('location', 'is', null)
						.not('geocode', 'is', null)
						.neq('geocode', '{}');

					if (geocodedCountError) {
						console.error(`❌ Failed to get geocoded points count:`, geocodedCountError);
					} else {
						const totalPointsInDB = actualTotalPoints || 0;
						const totalGeocodedInDB = actualGeocodedPoints || 0;
						const pointsNeedingGeocoding = totalPointsInDB - totalGeocodedInDB;

						console.log(`📊 Cache update - Actual DB counts:`, {
							totalPointsInDB,
							totalGeocodedInDB,
							pointsNeedingGeocoding,
							jobProcessed: totalProcessed,
							jobSuccess: totalSuccess,
							jobErrors: totalErrors
						});

						const { error: cacheUpdateError } = await supabase.rpc('update_geocoding_stats_cache', {
							p_user_id: userId,
							p_total_points: totalPointsInDB,
							p_geocoded_points: totalGeocodedInDB,
							p_points_needing_geocoding: pointsNeedingGeocoding,
							p_null_or_empty_geocodes: 0, // Will be recalculated by statistics API
							p_retryable_errors: 0, // Will be recalculated by statistics API
							p_non_retryable_errors: totalErrors
						});

						if (cacheUpdateError) {
							console.error(`❌ Failed to update geocoding cache:`, cacheUpdateError);
						} else {
							console.log(`✅ Updated geocoding statistics cache with correct values`);
						}
					}
				}
			} catch (cacheError) {
				console.error(`❌ Error updating geocoding cache:`, cacheError);
			}

			// Update final progress with completion details and ensure cumulative totals are stored
			await JobQueueService.updateJobProgress(job.id, 100, {
				// Store cumulative totals in metadata for persistence
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
		const actualTotalPoints = totalPoints; // Track actual total as it may change
		// Use all available CPU cores for maximum parallelization
		// For I/O-bound tasks (API calls, database queries), use more than CPU cores
		const CONCURRENT_REQUESTS = Math.max(8, Math.min(50, cpus().length * 4)); // 4x CPU cores for I/O-bound tasks
		console.log(`🚀 Using ${CONCURRENT_REQUESTS} concurrent requests (${cpus().length} CPU cores available, 4x for I/O-bound tasks)`);
		let hasMoreData = true;

		while (hasMoreData) {
			// Check for cancellation before processing each batch
			await this.checkJobCancellation(jobId);

			// Get batch of tracker data points that need geocoding
			// Use the same filtering logic as the initial count
			const { data: allBatchPoints, error } = await supabase
				.from('tracker_data')
				.select('user_id, location, geocode, recorded_at, raw_data')
				.eq('user_id', userId)
				.not('location', 'is', null)
				.range(offset, offset + batchSize - 1)
				.order('recorded_at', { ascending: false });

			if (error) throw error;

			// If no data returned, we've processed all points
			if (!allBatchPoints || allBatchPoints.length === 0) {
				hasMoreData = false;
				break;
			}

			// Filter points that need geocoding using shared utility
			const points = allBatchPoints?.filter(point => needsGeocoding(point.geocode)) || [];

			console.log(
				`🔄 Processing batch of ${points.length} tracker data points (offset: ${offset}, total in batch: ${allBatchPoints.length})`
			);

			// Process points in parallel with controlled concurrency
			if (points.length > 0) {
				const results = await this.processPointsInParallel(
					points,
					CONCURRENT_REQUESTS
				);

				// Update cumulative counters
				totalProcessed += results.processed;

				// Call progress callback with updated logic
				progressCallback(results.processed, results.success, results.errors);
			}

			// Move to next batch
			offset += batchSize;

			// Safety check to prevent infinite loops
			if (offset > 1000000) {
				console.warn('⚠️ Too many records processed, stopping at 1M');
				hasMoreData = false;
			}
		}

		console.log(`✅ Finished processing all batches. Total processed: ${totalProcessed}`);
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
			raw_data?: unknown;
		}>,
		concurrency: number
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

				// Note: Progress updates are handled by the main function to ensure proper accumulation
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
		raw_data?: unknown;
	}): Promise<boolean> {
		try {
			// First, check if raw_data already contains geocode information
			if (point.raw_data && typeof point.raw_data === 'object' && point.raw_data !== null) {
				const rawData = point.raw_data as Record<string, unknown>;

				// Check if raw_data has a geocode field
				if ('geocode' in rawData && rawData.geocode) {
					console.log(`📋 Using existing geocode from raw_data for point at ${point.recorded_at}`);

					// Update the tracker_data table with the existing geocode data
					const { error: updateError } = await supabase
						.from('tracker_data')
						.update({
							geocode: rawData.geocode,
							updated_at: new Date().toISOString()
						})
						.eq('user_id', point.user_id)
						.eq('recorded_at', point.recorded_at);

					if (updateError) {
						console.error(`❌ Database update error:`, updateError);
						await this.updateGeocodeWithError(point, `Database update error: ${updateError.message}`);
						return false;
					}

					console.log(`✅ Used existing geocode from raw_data`);
					return true;
				}
			}

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
			raw_data?: unknown;
		},
		errorMessage: string
	): Promise<void> {
		try {
			// Determine if this is a retryable error
			const isRetryable = this.isRetryableError({ error: true, error_message: errorMessage });
			const errorGeocode = isRetryable ? createRetryableError(errorMessage) : createPermanentError(errorMessage);

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
				console.log(`⚠️ Updated geocode with ${isRetryable ? 'retryable' : 'permanent'} error: ${errorMessage}`);
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
		concurrency: number,
		elapsedTimeMs?: number
	): string {
		if (processed === 0 || processedInLastBatch === 0) {
			return 'Calculating...';
		}

		const remainingPoints = totalPoints - processed;

		// Use actual elapsed time if available, otherwise fall back to estimated timing
		let pointsPerSecond: number;

		if (elapsedTimeMs && elapsedTimeMs > 0) {
			// Calculate based on actual elapsed time
			pointsPerSecond = (processed * 1000) / elapsedTimeMs;
		} else {
			// Fallback to estimated timing based on concurrency
			// Assume each point takes ~200ms (including API call and database update)
			const estimatedMsPerPoint = 200;
			pointsPerSecond = (concurrency * 1000) / estimatedMsPerPoint;
		}

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
			minDataPointsPerDay
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

			// Get user's trip exclusions from user preferences
			const { data: userPreferences, error: userPreferencesError } = await supabase
				.from('user_preferences')
				.select('trip_exclusions')
				.eq('id', userId)
				.single();

			let exclusions: TripExclusion[] = [];
			if (userPreferencesError) {
				console.error('Error fetching user preferences for trip exclusions:', userPreferencesError);
				// Fallback to empty array if preferences not found
			} else {
				exclusions = userPreferences?.trip_exclusions || [];
			}

					// Use trip detection service
		const tripDetectionService = new TripDetectionService();

			// Configure detection parameters
			const config = {
				minTripDurationHours: minTripDurationHours || 24,
				maxDistanceFromHomeKm: maxDistanceFromHomeKm || 50,
				minDataPointsPerDay: minDataPointsPerDay || 3,
				homeRadiusKm: 10,
				clusteringRadiusMeters: 1000,
				minHomeDurationHours: 1, // User must be home for at least 1 hour to end a trip
				minHomeDataPoints: 5 // User must have at least 5 "home" data points to end a trip
			};

			// Use the new trip detection service with the determined date ranges
			const detectedTrips = await tripDetectionService.detectTrips(
				userId,
				config,
				job.id,
				async (progress: number, message: string) => {
					await JobQueueService.updateJobProgress(
						job.id,
						progress,
						{
							message,
							userStartDate: startDate,
							userEndDate: endDate
						}
					);
				},
				dateRanges
			);

			console.log(`✅ Trip detection completed: ${detectedTrips.length} trips detected`);

			// The trips are already saved to the database by the TripDetectionService
			const totalTime = Date.now() - startTime;
			console.log(
				`✅ Trip detection completed: ${detectedTrips.length} trips detected in ${totalTime}ms`
			);

			await JobQueueService.updateJobProgress(job.id, 100, {
				message: `Successfully detected ${detectedTrips.length} trips`,
				suggestedTripsCount: detectedTrips.length,
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
			console.log('📥 Downloading file from storage:', storagePath);

			const { data: fileData, error: downloadError } = await supabase.storage
				.from('temp-files')
				.download(storagePath);

			if (downloadError || !fileData) {
				console.error('File download failed:', {
					storagePath,
					downloadError,
					fileData: fileData ? 'exists' : 'null'
				});
				throw new Error(`Failed to download file from storage: ${JSON.stringify(downloadError)}`);
			}

			// Get file size for memory management
			const fileSize = fileData.size;
			console.log(`📁 File size: ${fileSize} bytes (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

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

					// Create auto-reverse geocoding job for newly imported data
		try {
			console.log('🔄 Creating auto-reverse geocoding job for imported data...');
			const { error: reverseGeocodingError } = await supabase
				.from('jobs')
				.insert({
					created_by: userId,
					type: 'reverse_geocoding_missing',
					status: 'queued',
					priority: 'normal',
					data: {
						type: 'reverse_geocoding_missing',
						created_by: userId
					}
				});

			if (reverseGeocodingError) {
				console.warn('⚠️ Failed to create auto-reverse geocoding job:', reverseGeocodingError);
			} else {
				console.log('✅ Auto-reverse geocoding job created successfully');
			}
		} catch (error) {
			console.warn('⚠️ Failed to create auto-reverse geocoding job:', error);
		}
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

				// Use parallel processing for better performance
				const results = await this.processFeaturesInParallel(
					geojson.features,
					userId,
					jobId,
					fileName,
					startTime,
					lastLogTime
				);

				importedCount = results.importedCount;
				skippedCount = results.skippedCount;
				errorCount = results.errorCount;

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

	/**
	 * Process GeoJSON features in parallel using all available CPU cores
	 */
	private static async processFeaturesInParallel(
		features: any[],
		userId: string,
		jobId: string,
		fileName: string,
		startTime: number,
		lastLogTime: number
	): Promise<{ importedCount: number; skippedCount: number; errorCount: number }> {
		const totalFeatures = features.length;
		let importedCount = 0;
		let skippedCount = 0;
		let errorCount = 0;

		// Determine optimal chunk size based on CPU cores - smaller chunks for better progress updates
		const cpuCores = cpus().length;
		const CHUNK_SIZE = Math.max(50, Math.min(500, Math.floor(totalFeatures / (cpuCores * 8)))); // Smaller chunks, more concurrent
		const CONCURRENT_CHUNKS = Math.min(cpuCores * 2, 8); // Limit concurrent chunks to prevent DB overload

		console.log(`🔄 Parallel processing: ${cpuCores} CPU cores, ${CHUNK_SIZE} features per chunk, ${CONCURRENT_CHUNKS} concurrent chunks (optimized for progress updates)`);

		// Process features in chunks
		for (let i = 0; i < features.length; i += CHUNK_SIZE * CONCURRENT_CHUNKS) {
			// Check for cancellation
			await this.checkJobCancellation(jobId);

			const chunkPromises: Promise<{ imported: number; skipped: number; errors: number }>[] = [];

			// Create concurrent chunks
			for (let j = 0; j < CONCURRENT_CHUNKS && i + j * CHUNK_SIZE < features.length; j++) {
				const chunkStart = i + j * CHUNK_SIZE;
				const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, features.length);
				const chunk = features.slice(chunkStart, chunkEnd);

				chunkPromises.push(this.processFeatureChunk(chunk, userId, chunkStart, jobId, totalFeatures, fileName));
			}

			// Wait for all chunks to complete
			const chunkResults = await Promise.allSettled(chunkPromises);

			// Aggregate results
			for (const result of chunkResults) {
				if (result.status === 'fulfilled') {
					importedCount += result.value.imported;
					skippedCount += result.value.skipped;
					errorCount += result.value.errors;
				} else {
					errorCount += CHUNK_SIZE; // Count failed chunks as errors
					console.error('❌ Chunk processing failed:', result.reason);
				}
			}

			// Update progress more frequently
			const currentTime = Date.now();
			const processed = Math.min(i + CHUNK_SIZE * CONCURRENT_CHUNKS, totalFeatures);
			const progress = Math.round((processed / totalFeatures) * 100);

			// Log progress every 100 features or every 10 seconds for better user feedback
			if (processed % 100 === 0 || currentTime - lastLogTime > 10000) {
				const elapsedSeconds = (currentTime - startTime) / 1000;
				const rate = processed > 0 ? (processed / elapsedSeconds).toFixed(1) : '0';
				const eta = processed > 0 ? ((totalFeatures - processed) / (processed / elapsedSeconds)).toFixed(0) : '0';

				console.log(
					`📈 Progress: ${processed.toLocaleString()}/${totalFeatures.toLocaleString()} (${progress}%) - Rate: ${rate} features/sec - ETA: ${eta}s - Imported: ${importedCount.toLocaleString()} - Skipped: ${skippedCount.toLocaleString()} - Errors: ${errorCount.toLocaleString()}`
				);

				await JobQueueService.updateJobProgress(jobId, progress, {
					message: `🗺️ Processing GeoJSON features... ${processed.toLocaleString()}/${totalFeatures.toLocaleString()} (${progress}%)`,
					fileName,
					format: 'GeoJSON',
					totalProcessed: importedCount,
					totalItems: totalFeatures,
					currentFeature: processed + 1,
					rate: `${rate} features/sec`,
					eta: `${eta}s`,
					skipped: skippedCount,
					errors: errorCount
				});

				lastLogTime = currentTime;
			}

			// Log milestone achievements more frequently
			if (importedCount > 0 && importedCount % 1000 === 0) {
				console.log(`🎉 Milestone: Imported ${importedCount.toLocaleString()} points!`);
				await JobQueueService.updateJobProgress(
					jobId,
					progress,
					{
						message: `🎉 Imported ${importedCount.toLocaleString()} points!`,
						fileName,
						format: 'GeoJSON',
						totalProcessed: importedCount,
						totalItems: totalFeatures,
						currentFeature: processed + 1
					}
				);
			}
		}

		return { importedCount, skippedCount, errorCount };
	}

	/**
	 * Process a chunk of GeoJSON features
	 */
	private static async processFeatureChunk(
		features: any[],
		userId: string,
		chunkStart: number,
		jobId?: string,
		totalFeatures?: number,
		fileName?: string
	): Promise<{ imported: number; skipped: number; errors: number }> {
		let imported = 0;
		let skipped = 0;
		let errors = 0;

		// Prepare batch insert data
		const trackerData: any[] = [];

		for (let i = 0; i < features.length; i++) {
			const feature = features[i];

			// Skip invalid features
			if (!feature || !feature.geometry) {
				skipped++;
				continue;
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

				trackerData.push({
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
				});
			} else {
				skipped++;
			}
		}

		// Batch insert to database
		if (trackerData.length > 0) {
			try {
				const { error } = await supabase.from('tracker_data').upsert(
					trackerData,
					{
						onConflict: 'user_id,location,recorded_at',
						ignoreDuplicates: false
					}
				);

				if (!error) {
					imported = trackerData.length;

					// Update progress if we have job tracking info
					if (jobId && totalFeatures) {
						const processedFeatures = chunkStart + features.length;
						const progress = Math.round((processedFeatures / totalFeatures) * 100);

						// Update progress every 50 features or so
						if (processedFeatures % 50 === 0) {
							await JobQueueService.updateJobProgress(jobId, progress, {
								message: `🗺️ Processing features... ${processedFeatures.toLocaleString()}/${totalFeatures.toLocaleString()} (${progress}%)`,
								fileName,
								format: 'GeoJSON',
								totalProcessed: processedFeatures,
								totalItems: totalFeatures,
								currentFeature: processedFeatures + 1
							});
						}
					}
				} else {
					// Handle individual errors by processing one by one
					for (const data of trackerData) {
						try {
							const { error: singleError } = await supabase.from('tracker_data').upsert(
								data,
								{
									onConflict: 'user_id,location,recorded_at',
									ignoreDuplicates: false
								}
							);

							if (!singleError) {
								imported++;
							} else if (singleError.code === '23505') {
								// Unique constraint violation
								skipped++;
							} else {
								errors++;
							}
						} catch (singleError) {
							errors++;
						}
					}
				}
			} catch (batchError) {
				// If batch insert fails, process individually
				for (const data of trackerData) {
					try {
						const { error: singleError } = await supabase.from('tracker_data').upsert(
							data,
							{
								onConflict: 'user_id,location,recorded_at',
								ignoreDuplicates: false
							}
						);

						if (!singleError) {
							imported++;
						} else if (singleError.code === '23505') {
							// Unique constraint violation
							skipped++;
						} else {
							errors++;
						}
					} catch (singleError) {
						errors++;
					}
				}
			}
		}

		return { imported, skipped, errors };
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

	// Note: Removed processImageGeneration method since images are now generated during trip approval

	private static async processPoiVisitDetection(job: Job): Promise<void> {
		console.log(`📍 Processing POI visit detection job ${job.id}`);

		const startTime = Date.now();

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

				// TODO: Implement POI visit detection
				// For now, return a stub result
				const userResult = { totalDetected: 0, visits: [] };

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

				// TODO: Implement POI visit detection for all users
				// For now, return a stub result
				const allUsersResults = [];

				await JobQueueService.updateJobProgress(job.id, 75, {
					message: `Found 0 visits for all users`,
					totalProcessed: 0,
					totalDetected: 0
				});

				// Complete the job
				const elapsedSeconds = (Date.now() - startTime) / 1000;

				await JobQueueService.updateJobProgress(job.id, 100, {
					message: `✅ POI visit detection completed for all users`,
					totalProcessed: 0,
					totalDetected: 0,
					elapsedSeconds: elapsedSeconds.toFixed(1)
				});

				console.log(`✅ POI visit detection completed in ${elapsedSeconds.toFixed(1)}s`);
			}
		} catch (error) {
			console.error(`❌ Error in POI visit detection job:`, error);
			throw error;
		}
	}

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
						distance += haversineDistance(prev[1], prev[0], curr[1], curr[0]); // [lng, lat] -> [lat, lng]
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

			                        // Get all existing trip date ranges (from trips table with different statuses)
                        // Include all active, completed, rejected, and pending trips
                        const { data: existingTrips, error: tripsError } = await supabase
                                .from('trips')
                                .select('start_date, end_date')
                                .eq('user_id', userId)
                                .in('status', ['active', 'completed', 'rejected', 'pending']);

                        if (tripsError) {
                                console.error('Error fetching existing trips:', tripsError);
                                return [];
                        }

			console.log('📋 Found existing trips:', existingTrips?.length || 0);
			if (existingTrips && existingTrips.length > 0) {
				console.log('📋 Existing trips details:');
				existingTrips.forEach((trip, index) => {
					console.log(`  Trip ${index + 1}: ${trip.start_date} to ${trip.end_date}`);
				});
			}

			// Create a set of all dates that are already covered by existing trips
			const excludedDates = new Set();

			// Add dates from all existing trips (including pending/suggested trips)
			let tripsDatesAdded = 0;
			existingTrips?.forEach((trip) => {
				const start = new Date(trip.start_date);
				const end = new Date(trip.end_date);
				for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
					excludedDates.add(d.toISOString().split('T')[0]);
					tripsDatesAdded++;
				}
			});

			console.log('📅 Excluded dates count:', excludedDates.size);
			console.log('📅 Dates added from existing trips:', tripsDatesAdded);

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
	 * Process large files (>100MB) using streaming approach to avoid memory issues
	 */
	private static async processLargeFileImport(
		fileData: Blob,
		format: string,
		userId: string,
		jobId: string,
		fileName: string
	): Promise<void> {
		console.log(`🔄 Processing large file import: ${fileName} (${format})`);

		const startTime = Date.now();

		try {
			// Update initial progress
			await JobQueueService.updateJobProgress(jobId, 0, {
				message: `Processing large ${format} file...`,
				fileName,
				format,
				totalProcessed: 0,
				totalItems: 0
			});

			let importedCount = 0;
			let totalItems = 0;

			// Process based on format using streaming
			switch (format) {
				case 'GeoJSON':
					importedCount = await this.importLargeGeoJSON(fileData, userId, jobId, fileName);
					break;
				case 'GPX': {
					const result = await this.importLargeGPX(fileData, userId, jobId, fileName);
					importedCount = result.importedCount;
					totalItems = result.totalItems;
					break;
				}
				case 'OwnTracks':
					importedCount = await this.importLargeOwnTracks(fileData, userId, jobId, fileName);
					break;
				default:
					throw new Error(`Unsupported format for large files: ${format}`);
			}

			// Update final progress
			const elapsedSeconds = (Date.now() - startTime) / 1000;
			await JobQueueService.updateJobProgress(jobId, 100, {
				message: `✅ Large file import completed successfully!`,
				fileName,
				format,
				totalProcessed: importedCount,
				totalItems: totalItems || importedCount,
				importedCount,
				elapsedSeconds: elapsedSeconds.toFixed(1)
			});

			console.log(
				`✅ Large file import completed: ${importedCount} items imported in ${elapsedSeconds.toFixed(1)}s`
			);

			// Automatically start reverse geocoding job for newly imported data
			try {
				await JobQueueService.createJob(
					'reverse_geocoding_missing',
					{
						message: `Auto-generated reverse geocoding job for imported data from ${fileName}`
					},
					'normal',
					userId
				);
				console.log('🔄 Auto-created reverse geocoding job for imported data');
			} catch (geocodingError) {
				console.error('⚠️ Failed to create auto-reverse geocoding job:', geocodingError);
			}
		} catch (error) {
			console.error('❌ Large file import failed:', error);
			await JobQueueService.updateJobProgress(jobId, 0, {
				message: `❌ Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				fileName,
				format,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
			throw error;
		}
	}

	/**
	 * Import large GeoJSON files
	 */
	private static async importLargeGeoJSON(
		fileData: Blob,
		userId: string,
		jobId: string,
		fileName: string
	): Promise<number> {
		console.log('🔄 Starting large GeoJSON import...');
		const text = await fileData.text();
		console.log('📄 File size:', text.length, 'characters');

		// Parse as a single JSON object (FeatureCollection)
		let json;
		try {
			json = JSON.parse(text);
		} catch (parseError) {
			console.error('❌ Failed to parse JSON:', parseError);
			throw new Error(`Failed to parse JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
		}

		if (json.type === 'FeatureCollection' && json.features && Array.isArray(json.features)) {
			console.log(`📊 Found FeatureCollection with ${json.features.length} features`);

			// Debug: Show the first few features to identify the problematic one
			console.log('🔍 First 3 features for debugging:');
			for (let i = 0; i < Math.min(3, json.features.length); i++) {
				const feature = json.features[i];
				console.log(`🔍 Feature ${i + 1}:`, {
					type: feature.type,
					properties: feature.properties,
					geometry: feature.geometry
				});
			}

			// Update progress to show we're starting
			await JobQueueService.updateJobProgress(jobId, 5, {
				message: `Processing ${json.features.length} GeoJSON features...`,
				fileName,
				format: 'GeoJSON',
				totalProcessed: 0,
				totalItems: json.features.length
			});

			try {
				// Process features in batches to avoid database timeouts
				const BATCH_SIZE = 5; // Process 5 features at a time for easier debugging
				let totalImported = 0;

				for (let i = 0; i < json.features.length; i += BATCH_SIZE) {
					const batch = json.features.slice(i, i + BATCH_SIZE);
					const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
					const totalBatches = Math.ceil(json.features.length / BATCH_SIZE);
					console.log(`🔄 Processing batch ${batchNumber}/${totalBatches} (features ${i + 1}-${Math.min(i + BATCH_SIZE, json.features.length)})`);
					console.log(`🔍 Batch ${batchNumber} contains ${batch.length} features`);

					try {
						const batchImported = await this.processGeoJSONFeatureBatch(batch, userId, jobId, fileName);
						totalImported += batchImported;

						// Update progress after each batch
						const progress = Math.min(((i + BATCH_SIZE) / json.features.length) * 100, 95);
						await JobQueueService.updateJobProgress(jobId, progress, {
							message: `Processed ${i + BATCH_SIZE}/${json.features.length} features (${totalImported} imported)...`,
							fileName,
							format: 'GeoJSON',
							totalProcessed: i + BATCH_SIZE,
							totalItems: json.features.length
						});
					} catch (batchError) {
						console.error(`❌ BATCH ${batchNumber} FAILED:`, batchError);
						console.error(`❌ This batch contained features ${i + 1}-${Math.min(i + BATCH_SIZE, json.features.length)}`);
						console.error(`❌ Batch ${batchNumber} had ${batch.length} features`);

						// TEMPORARY DEBUGGING: Show ALL features in the failed batch
						console.error('🔍 ALL FEATURES IN THE FAILED BATCH:');
						console.error(`🔍 Batch ${batchNumber} contained ${batch.length} features:`);

						for (let j = 0; j < batch.length; j++) {
							console.error(`🔍 FEATURE ${j + 1} (original index ${i + j + 1}):`);
							console.error(JSON.stringify(batch[j], null, 2));
							console.error('---');
						}

						throw batchError; // Re-throw to stop processing
					}

					// Check for cancellation between batches
					await this.checkJobCancellation(jobId);
				}

				// Update progress to show completion
				await JobQueueService.updateJobProgress(jobId, 100, {
					message: `Successfully imported ${totalImported} features`,
					fileName,
					format: 'GeoJSON',
					totalProcessed: totalImported,
					totalItems: json.features.length
				});

				return totalImported;
			} catch (processingError) {
				console.error('❌ Failed to process GeoJSON features:', processingError);
				throw new Error(`Failed to process GeoJSON features: ${processingError instanceof Error ? processingError.message : 'Unknown error'}`);
			}
		} else {
			throw new Error('Not a valid FeatureCollection');
		}
	}

	/**
	 * Import large GPX files using streaming
	 */
	private static async importLargeGPX(
		fileData: Blob,
		userId: string,
		jobId: string,
		fileName: string
	): Promise<{ importedCount: number; totalItems: number }> {
		// For now, fall back to regular processing for GPX
		const content = await fileData.text();
		return await this.importGPXWithProgress(content, userId, jobId, fileName);
	}

	/**
	 * Import large OwnTracks files using streaming
	 */
	private static async importLargeOwnTracks(
		fileData: Blob,
		userId: string,
		jobId: string,
		fileName: string
	): Promise<number> {
		// For now, fall back to regular processing for OwnTracks
		const content = await fileData.text();
		return await this.importOwnTracksWithProgress(content, userId, jobId, fileName);
	}



	/**
	 * Process a batch of GeoJSON features (from FeatureCollection)
	 */
	private static async processGeoJSONFeatureBatch(
		features: any[],
		userId: string,
		jobId?: string,
		fileName?: string
	): Promise<number> {
		const trackerData = [];
		const totalFeatures = features.length;
		let processedCount = 0;

		for (const feature of features) {
			try {
				if (feature.type === 'Feature' && feature.geometry) {
					const coordinates = feature.geometry.coordinates;
					const properties = feature.properties || {};

					if (coordinates && coordinates.length >= 2) {
						const [lng, lat] = coordinates;

						// TEMPORARY DEBUGGING: Check coordinate values
						console.log(`🔍 Coordinates for feature ${processedCount + 1}: lng=${lng}, lat=${lat}`);
						console.log(`🔍 lng type: ${typeof lng}, lat type: ${typeof lat}`);
						if (lng.toString().includes('0.001822522735971131') || lat.toString().includes('0.001822522735971131')) {
							console.error(`🔍 PROBLEMATIC VALUE FOUND in coordinates! lng=${lng}, lat=${lat}`);
						}

						// Extract timestamp from properties
						let recordedAt = new Date().toISOString();
						if (properties.timestamp) {
							recordedAt = new Date(properties.timestamp * 1000).toISOString(); // Convert Unix timestamp
						} else if (properties.time) {
							recordedAt = new Date(properties.time).toISOString();
						}

						// Convert numeric fields to proper types with better error handling
						let batteryLevel = null;
						if (properties.battery_level !== undefined && properties.battery_level !== null) {
							try {
								const batteryValue = parseFloat(properties.battery_level);
								if (!isNaN(batteryValue)) {
									batteryLevel = Math.round(batteryValue);
								}
							} catch (error) {
								console.error('Error converting battery_level:', properties.battery_level, error);
							}
						}

						// Convert other numeric fields with error handling
						let altitude = null;
						try {
							altitude = properties.altitude ? parseFloat(properties.altitude) : null;
						} catch (error) {
							console.error('Error converting altitude:', properties.altitude, error);
						}

						let accuracy = null;
						try {
							accuracy = properties.accuracy ? parseFloat(properties.accuracy) : null;
						} catch (error) {
							console.error('Error converting accuracy:', properties.accuracy, error);
						}

						let speed = null;
						try {
							speed = properties.speed ? parseFloat(properties.speed) : null;
						} catch (error) {
							console.error('Error converting speed:', properties.speed, error);
						}

						let heading = null;
						try {
							heading = properties.heading ? parseFloat(properties.heading) : null;
						} catch (error) {
							console.error('Error converting heading:', properties.heading, error);
						}

						// Validate all numeric fields are properly converted
						if (batteryLevel !== null && !Number.isInteger(batteryLevel)) {
							console.error('Invalid battery_level after conversion:', batteryLevel);
							batteryLevel = null;
						}
						if (altitude !== null && typeof altitude !== 'number') {
							console.error('Invalid altitude after conversion:', altitude);
							altitude = null;
						}
						if (accuracy !== null && typeof accuracy !== 'number') {
							console.error('Invalid accuracy after conversion:', accuracy);
							accuracy = null;
						}
						if (speed !== null && typeof speed !== 'number') {
							console.error('Invalid speed after conversion:', speed);
							speed = null;
						}
						if (heading !== null && typeof heading !== 'number') {
							console.error('Invalid heading after conversion:', heading);
							heading = null;
						}

						// TEMPORARY DEBUGGING: Check batteryLevel value before assignment
						console.log(`🔍 batteryLevel value for feature ${processedCount + 1}:`, batteryLevel);
						console.log(`🔍 batteryLevel type:`, typeof batteryLevel);
						if (batteryLevel !== null) {
							console.log(`🔍 batteryLevel as string:`, batteryLevel.toString());
						}

						const trackerDataItem = {
							user_id: userId,
							tracker_type: 'imported',
							recorded_at: recordedAt,
							location: {
								type: 'Point',
								coordinates: [lng, lat]
							},
							country_code: this.getCountryForPoint(lat, lng),
							battery_level: batteryLevel,
							raw_data: properties
						};

						// TEMPORARY DEBUGGING: Check for problematic decimal values in ALL fields
						const allFields = {
							user_id: trackerDataItem.user_id,
							tracker_type: trackerDataItem.tracker_type,
							recorded_at: trackerDataItem.recorded_at,
							location_coordinates: trackerDataItem.location.coordinates,
							country_code: trackerDataItem.country_code,
							battery_level: trackerDataItem.battery_level
						};

						for (const [fieldName, value] of Object.entries(allFields)) {
							if (value !== null && value !== undefined) {
								const valueStr = JSON.stringify(value);
								if (valueStr.includes('0.001822522735971131')) {
									console.error(`🔍 PROBLEMATIC VALUE FOUND in field ${fieldName}:`, value);
									console.error(`🔍 This value is being set for feature ${processedCount + 1}`);
									console.error(`🔍 Field type:`, typeof value);
									console.error(`🔍 Value as string:`, valueStr);
								}
							}
						}

						// Also check raw_data for the problematic value
						const rawDataStr = JSON.stringify(trackerDataItem.raw_data);
						if (rawDataStr.includes('0.001822522735971131')) {
							console.error(`🔍 PROBLEMATIC VALUE FOUND in raw_data for feature ${processedCount + 1}`);
							console.error(`🔍 Raw data contains the problematic value`);
						}

						trackerData.push(trackerDataItem);
					}
				}
			} catch (error) {
				console.error('Error processing GeoJSON feature:', error);
			}

			processedCount++;
		}

		// Insert batch into database
		if (trackerData.length > 0) {
			try {
				console.log(`🔍 Inserting batch of ${trackerData.length} tracker data items...`);

				// TEMPORARY TEST: Try inserting a single record first
				console.log('🔍 TESTING: Inserting single record manually...');
				const testRecord = {
					user_id: userId,
					tracker_type: 'imported',
					recorded_at: new Date().toISOString(),
					location: {
						type: 'Point',
						coordinates: [0, 0]
					},
					country_code: 'XX',
					battery_level: null,
					raw_data: {}
				};

				const { error: testError } = await supabase
					.from('tracker_data')
					.insert(testRecord);

				if (testError) {
					console.error('❌ Single record insert failed:', testError);
				} else {
					console.log('✅ Single record insert succeeded');
				}

				// TEMPORARY DEBUGGING: Show the exact data being inserted
				console.log('🔍 EXACT DATA BEING INSERTED INTO DATABASE:');
				for (let i = 0; i < trackerData.length; i++) {
					console.log(`🔍 TRACKER DATA ITEM ${i + 1}:`);
					console.log(JSON.stringify(trackerData[i], null, 2));
					console.log('---');
				}

				const { error } = await supabase
					.from('tracker_data')
					.upsert(trackerData, {
						onConflict: 'user_id,location,recorded_at',
						ignoreDuplicates: true
					});

				if (error) {
					console.error('❌ Database insertion error:', error);
					console.error('❌ Error details:', {
						code: error.code,
						message: error.message,
						details: error.details,
						hint: error.hint
					});

					// TEMPORARY DEBUGGING: Show ALL records in the batch that failed
					console.error('🔍 ALL RECORDS IN THE FAILED BATCH:');
					console.error(`🔍 This batch contained ${trackerData.length} records:`);

					for (let i = 0; i < trackerData.length; i++) {
						console.error(`🔍 RECORD ${i + 1}:`);
						console.error(JSON.stringify(trackerData[i], null, 2));
						console.error('---');
					}

					return 0;
				}
			} catch (insertError) {
				console.error('❌ Exception during database insert:', insertError);

				// TEMPORARY DEBUGGING: Show ALL records in the batch that caused the exception
				console.error('🔍 ALL RECORDS IN THE BATCH THAT CAUSED EXCEPTION:');
				console.error(`🔍 This batch contained ${trackerData.length} records:`);

				for (let i = 0; i < trackerData.length; i++) {
					console.error(`🔍 RECORD ${i + 1}:`);
					console.error(JSON.stringify(trackerData[i], null, 2));
					console.error('---');
				}

				return 0;
			}
		}

		return trackerData.length;
	}

	// Helper method to determine if a geocoding error is retryable
	private static isRetryableError(geocode: unknown): boolean {
		if (!geocode || typeof geocode !== 'object' || geocode === null) {
			return false;
		}

		const geocodeObj = geocode as Record<string, unknown>;

		// Check if it has an error
		if (!('error' in geocodeObj) || !geocodeObj.error) {
			return false;
		}

		// If it has a "permanent" flag set to true, it's not retryable
		if ('permanent' in geocodeObj && geocodeObj.permanent === true) {
			return false;
		}

		// If it has a "retryable" flag set to true, it is retryable
		if ('retryable' in geocodeObj && geocodeObj.retryable === true) {
			return true;
		}

		// Check error message to determine if retryable
		const errorMessage = String(geocodeObj.error_message || '');

		// Retryable errors (temporary issues)
		const retryablePatterns = [
			'rate limit',
			'timeout',
			'network',
			'connection',
			'temporary',
			'service unavailable',
			'too many requests',
			'quota exceeded',
			'deadlock',
			'database update error'
		];

		// Non-retryable errors (permanent issues)
		const nonRetryablePatterns = [
			'invalid coordinates',
			'coordinates out of bounds',
			'no results found',
			'address not found',
			'invalid address',
			'unable to geocode',
			'all nominatim endpoints failed'
		];

		const lowerError = errorMessage.toLowerCase();

		// Check for non-retryable patterns first
		for (const pattern of nonRetryablePatterns) {
			if (lowerError.includes(pattern)) {
				return false;
			}
		}

		// Check for retryable patterns
		for (const pattern of retryablePatterns) {
			if (lowerError.includes(pattern)) {
				return true;
			}
		}

		// Default: assume non-retryable for unknown errors (more conservative)
		return false;
	}
}
