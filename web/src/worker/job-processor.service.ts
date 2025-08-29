import { supabase } from './supabase';

import { checkJobCancellation } from '../lib/utils/job-cancellation';
import { ExportProcessorService } from '../lib/services/export-processor.service';
import { forwardGeocode } from '../lib/services/external/nominatim.service';
import { TripDetectionService } from '../lib/services/trip-detection.service';
import { UserProfileService } from '../lib/services/user-profile.service';

import { findAvailableDateRanges as findAvailableDateRangesHelper } from './helpers/date-ranges';
import { JobQueueService } from './job-queue.service.worker';

import type { Job, JobType } from '../lib/types/job-queue.types';
import type { TripGenerationData, HomeAddress } from '../lib/types/trip-generation.types';

export class JobProcessorService {
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
			data_import: this.processDataImport.bind(this),
			trip_generation: this.processTripGeneration.bind(this),
			data_export: this.processDataExport.bind(this),
			geocoding: this.processGeocoding.bind(this),
			image_generation: this.processImageGeneration.bind(this),
			poi_detection: this.processPOIDetection.bind(this),
			trip_detection: this.processTripDetection.bind(this)
		};

		return processors[jobType];
	}

	private static async processReverseGeocodingMissing(job: Job): Promise<void> {
		const { processReverseGeocodingMissing } = await import(
			'./processors/reverse-geocoding-processor.service'
		);
		return processReverseGeocodingMissing(job);
	}

	private static async processTripGeneration(job: Job): Promise<void> {
		console.log(`🗺️ Processing sleep-based trip generation job ${job.id}`);
		console.log(`👤 Job created by user: ${job.created_by}`);
		console.log(`📋 Job data:`, JSON.stringify(job.data, null, 2));

		const startTime = Date.now();
		// Moving average ETA over the last 15 seconds
		const PROGRESS_WINDOW_MS = 15_000;
		const progressSamples: Array<{ time: number; progress: number }> = [];
		const formatEta = (seconds: number): string => {
			if (!seconds || seconds <= 0) return 'Calculating...';
			const s = Math.floor(seconds % 60);
			const m = Math.floor((seconds / 60) % 60);
			const h = Math.floor(seconds / 3600);
			if (h > 0) return `${h}h ${m}m ${s}s`;
			if (m > 0) return `${m}m ${s}s`;
			return `${s}s`;
		};
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
			await checkJobCancellation(job.id);

			// Determine date ranges - if not provided, find available ranges automatically
			let dateRanges: Array<{ startDate: string; endDate: string }> = [];

			if (!startDate || !endDate) {
				console.log(
					`🔍 No start/end dates provided, finding available date ranges automatically...`
				);
				await JobQueueService.updateJobProgress(job.id, 5, {
					message: 'Determining available date ranges for sleep-based trip generation...'
				});

				dateRanges = await findAvailableDateRangesHelper(userId, startDate, endDate);
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
				dateRanges = await findAvailableDateRangesHelper(userId, startDate, endDate);
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
			const { error: userPreferencesError } = await supabase
				.from('user_preferences')
				.select('trip_exclusions')
				.eq('id', userId)
				.single();

			if (userPreferencesError) {
				console.error('Error fetching user preferences for trip exclusions:', userPreferencesError);
				// Fallback to empty array if preferences not found
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
					// Track samples for moving-average ETA
					const now = Date.now();
					progressSamples.push({ time: now, progress });
					while (progressSamples.length > 1 && progressSamples[0].time < now - PROGRESS_WINDOW_MS) {
						progressSamples.shift();
					}

					// Compute rate (percentage points per second)
					let rate = 0;
					if (progressSamples.length >= 2) {
						const first = progressSamples[0];
						const last = progressSamples[progressSamples.length - 1];
						const dp = Math.max(0, last.progress - first.progress);
						const dt = (last.time - first.time) / 1000;
						if (dp > 0 && dt > 0) rate = dp / dt;
					}
					if (rate === 0 && progress > 0) {
						const elapsed = (now - startTime) / 1000;
						if (elapsed > 0) rate = progress / elapsed;
					}

					const remainingPct = Math.max(0, 100 - progress);
					const remainingSeconds = rate > 0 ? Math.round(remainingPct / rate) : 0;
					const etaDisplay = formatEta(remainingSeconds);

					await JobQueueService.updateJobProgress(job.id, progress, {
						message,
						userStartDate: startDate,
						userEndDate: endDate,
						estimatedTimeRemaining: etaDisplay,
						etaSeconds: remainingSeconds
					});
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
			await checkJobCancellation(job.id);

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
				case 'GeoJSON': {
					const { importGeoJSONWithProgress } = await import(
						'./processors/import/geojson-importer'
					);
					importedCount = await importGeoJSONWithProgress(fileContent, userId, job.id, fileName);
					break;
				}
				case 'GPX': {
					const { importGPXWithProgress } = await import('./processors/import/gpx-importer');
					const result = await importGPXWithProgress(fileContent, userId, job.id, fileName);
					importedCount = result.importedCount;
					totalItems = result.totalItems;
					break;
				}
				case 'OwnTracks':
					{
						const { importOwnTracksWithProgress } = await import(
							'./processors/import/owntracks-importer'
						);
						importedCount = await importOwnTracksWithProgress(
							fileContent,
							userId,
							job.id,
							fileName
						);
					}
					break;
				default:
					throw new Error(`Unsupported format: ${format}`);
			}

			// Calculate distance and time_spent for imported data
			console.log(`🧮 [IMPORT] Calculating distance and time_spent for imported data...`);

			await JobQueueService.updateJobProgress(job.id, 95, {
				message: `🧮 Calculating distances and time spent...`,
				fileName,
				format,
				totalProcessed: importedCount,
				totalItems: totalItems || importedCount,
				importedCount
			});

			try {
				// Use the optimized batch calculation for this user's data
				// Start with a smaller batch size to avoid timeouts
				let batchSize = 500; // Reduced from 1000 to avoid timeouts
				const maxRetries = 3;
				let retryCount = 0;
				let totalUpdated = 0;

				while (retryCount < maxRetries) {
					try {
						console.log(`🧮 [IMPORT] Attempting distance calculation with batch size ${batchSize} (attempt ${retryCount + 1}/${maxRetries})`);

						// Try the small batch function first for better performance
						const { data: distanceResult, error: distanceError } = await supabase.rpc(
							'update_tracker_distances_small_batch',
							{ target_user_id: userId, max_records: batchSize }
						);

						if (distanceError) {
							throw distanceError;
						}

						totalUpdated = distanceResult || 0;
						console.log(`✅ [IMPORT] Distance calculation completed: ${totalUpdated} records updated`);
						break; // Success, exit retry loop

					} catch (distanceError: any) {
						retryCount++;
						console.warn(`⚠️ [IMPORT] Distance calculation attempt ${retryCount} failed:`, distanceError);

						// If it's a timeout error, reduce batch size and retry
						if (distanceError?.code === '57014' && retryCount < maxRetries) {
							batchSize = Math.max(50, Math.floor(batchSize * 0.5)); // Reduce batch size by half, minimum 50
							console.log(`🔄 [IMPORT] Reducing batch size to ${batchSize} and retrying...`);

							// If we're still getting timeouts, try the regular batch function
							if (batchSize <= 100) {
								console.log(`🔄 [IMPORT] Trying regular batch function with smaller batch size...`);
							}
							continue;
						}

						// If it's not a timeout error, try the regular batch function as fallback
						if (retryCount === 1) {
							console.log(`🔄 [IMPORT] Trying regular batch function as fallback...`);
							try {
								const { data: fallbackResult, error: fallbackError } = await supabase.rpc(
									'update_tracker_distances_batch',
									{ target_user_id: userId, batch_size: Math.min(batchSize, 250) }
								);

								if (!fallbackError) {
									totalUpdated = fallbackResult || 0;
									console.log(`✅ [IMPORT] Fallback distance calculation completed: ${totalUpdated} records updated`);
									break; // Success with fallback
								}
							} catch (fallbackError) {
								console.warn(`⚠️ [IMPORT] Fallback distance calculation also failed:`, fallbackError);
							}
						}

						// If we've exhausted retries or it's not a timeout, log and continue
						if (retryCount >= maxRetries) {
							console.error('❌ [IMPORT] Distance calculation failed after all retries:', distanceError);
						} else {
							console.error('❌ [IMPORT] Distance calculation failed with non-timeout error:', distanceError);
						}
						break;
					}
				}

				if (totalUpdated > 0) {
					console.log(`✅ [IMPORT] Successfully updated distances for ${totalUpdated} records`);
				} else {
					// If no records were updated, create a background job for distance calculation
					console.log('🔄 [IMPORT] No distances calculated, creating background distance calculation job...');
					try {
						// Use the new function to safely create the job with correct column names
						const { data: jobResult, error: backgroundJobError } = await supabase.rpc(
							'create_distance_calculation_job',
							{
								target_user_id: userId,
								job_reason: 'import_fallback'
							}
						);

						if (backgroundJobError) {
							console.warn('⚠️ Failed to create background distance calculation job:', backgroundJobError);
						} else {
							console.log('✅ Background distance calculation job created successfully');
						}
					} catch (error) {
						console.warn('⚠️ Failed to create background distance calculation job:', error);
					}
				}
			} catch (distanceError) {
				console.error('❌ [IMPORT] Distance calculation error:', distanceError);
				// Don't fail the import, just log the error
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
		const { error: reverseGeocodingError } = await supabase.from('jobs').insert({
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

	private static async processDataExport(job: Job): Promise<void> {
		console.log(`📦 Processing data export job ${job.id}`);

		try {
			await ExportProcessorService.processExport(job);
		} catch (error) {
			console.error(`❌ Error in data export job:`, error);
			throw error;
		}
	}

	private static async processGeocoding(job: Job): Promise<void> {
		console.log(`🌍 Processing geocoding job ${job.id}`);
		// TODO: Implement geocoding processor
		throw new Error('Geocoding processor not yet implemented');
	}

	private static async processImageGeneration(job: Job): Promise<void> {
		console.log(`🖼️ Processing image generation job ${job.id}`);
		// TODO: Implement image generation processor
		throw new Error('Image generation processor not yet implemented');
	}

	private static async processPOIDetection(job: Job): Promise<void> {
		console.log(`📍 Processing POI detection job ${job.id}`);
		// TODO: Implement POI detection processor
		throw new Error('POI detection processor not yet implemented');
	}



	private static async processTripDetection(job: Job): Promise<void> {
		console.log(`🗺️ Processing trip detection job ${job.id}`);
		// TODO: Implement trip detection processor
		throw new Error('Trip detection processor not yet implemented');
	}
}
