// web/src/lib/services/queue/processors/reverse-geocoding-processor.service.ts

import { cpus } from 'node:os';

import { supabase } from '$lib/core/supabase/worker';
import { reverseGeocode } from '$lib/services/external/nominatim.service';
import { JobQueueService } from '$lib/services/queue/job-queue.service.worker';
import {
	needsGeocoding,
	isRetryableError,
	createPermanentError,
	createRetryableError
} from '$lib/utils/geocoding-utils';
import { checkJobCancellation } from '$lib/utils/job-cancellation';

import { delay } from '../helpers/concurrency';

import type { Job } from '$lib/types/job-queue.types';

export async function processReverseGeocodingMissing(job: Job): Promise<void> {
	console.log(`🌍 Processing reverse geocoding missing job ${job.id}`);

	const startTime = Date.now();
	const BATCH_SIZE = 1000;
	const userId = job.created_by;

	let totalProcessed = 0;
	let totalSuccess = 0;
	let totalErrors = 0;
	let totalScanned = 0; // count of all tracker_data rows scanned in this job
	let totalToScan = 0; // total tracker_data rows that will be scanned (with non-null location)

	// Moving-average window for ETA (based on scanned rows throughput)
	const RATE_WINDOW_MS = 15_000; // 15s window per requirement
	const scanSamples: Array<{ time: number; scanned: number }> = [];

	if (job.result && typeof job.result === 'object') {
		const metadata = job.result as Record<string, unknown>;
		totalProcessed = (metadata.totalProcessed as number) || 0;
		totalSuccess = (metadata.totalSuccess as number) || 0;
		totalErrors = (metadata.totalErrors as number) || 0;
	}

	try {
		await checkJobCancellation(job.id);

		console.log(`🔄 Initializing geocoding cache with current database state...`);
		try {
			const { count: actualTotalPoints, error: countError } = await supabase
				.from('tracker_data')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.not('location', 'is', null);

			if (!countError) {
				const { count: actualGeocodedPoints, error: geocodedCountError } = await supabase
					.from('tracker_data')
					.select('*', { count: 'exact', head: true })
					.eq('user_id', userId)
					.not('location', 'is', null)
					.not('geocode', 'is', null)
					.not('geocode', 'eq', '{}');

				if (!geocodedCountError) {
					const totalPointsInDB = actualTotalPoints || 0;
					const totalGeocodedInDB = actualGeocodedPoints || 0;
					const pointsNeedingGeocoding = totalPointsInDB - totalGeocodedInDB;
					totalToScan = totalPointsInDB;

					const { error: cacheUpdateError } = await supabase.rpc('update_geocoding_stats_cache', {
						p_user_id: userId,
						p_total_points: totalPointsInDB,
						p_geocoded_points: totalGeocodedInDB,
						p_points_needing_geocoding: pointsNeedingGeocoding,
						p_null_or_empty_geocodes: 0,
						p_retryable_errors: 0,
						p_non_retryable_errors: 0
					});

					if (cacheUpdateError) {
						console.error(`❌ Failed to initialize geocoding cache:`, cacheUpdateError);
					} else {
						console.log(`✅ Initialized geocoding statistics cache with current database state`);
					}
				}
			}
		} catch (cacheError) {
			console.error(`❌ Error initializing geocoding cache:`, cacheError);
		}

		// Fetch and analyze points that need geocoding (debug breakdown)
		let allPoints: Array<{ geocode: unknown }> = [];
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
				if (offset > 1000000) {
					console.warn('⚠️ Too many records, stopping at 1M');
					break;
				}
			}
		}

		const pointsNeedingGeocoding =
			allPoints?.filter((point) => needsGeocoding(point.geocode)) || [];
		const trackerDataCount = pointsNeedingGeocoding.length;
		const totalPoints = trackerDataCount || 0;

		await JobQueueService.updateJobProgress(job.id, 0, {
			message: `Found ${totalPoints.toLocaleString()} tracker data points needing geocoding. Starting processing...`,
			totalProcessed: 0,
			totalSuccess: 0,
			totalErrors: 0,
			totalPoints,
			totalToScan: totalToScan || 0,
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

		await processTrackerDataInBatches(
			userId,
			BATCH_SIZE,
			job.id,
			totalPoints,
			startTime,
			(scanned, processed, success, errors) => {
				totalScanned += scanned;
				totalProcessed += processed;
				totalSuccess += success;
				totalErrors += errors;

				// Progress is based on scan coverage so it reflects actual job completion reliably
				const denominator = Math.max(totalToScan || 0, 1);
				const progress = Math.min(100, Math.round((totalScanned / denominator) * 100));

				// ETA based on moving-average scan throughput to avoid noisy estimates
				const now = Date.now();
				scanSamples.push({ time: now, scanned: totalScanned });
				// Trim samples to window
				while (scanSamples.length > 1 && scanSamples[0].time < now - RATE_WINDOW_MS) {
					scanSamples.shift();
				}

				let scanRate = 0;
				if (scanSamples.length >= 2) {
					const first = scanSamples[0];
					const last = scanSamples[scanSamples.length - 1];
					const deltaScanned = last.scanned - first.scanned;
					const deltaSeconds = (last.time - first.time) / 1000;
					if (deltaSeconds > 0 && deltaScanned >= 0) {
						scanRate = deltaScanned / deltaSeconds; // rows per second
					}
				}
				// Fallback to global average if window is insufficient
				if (scanRate === 0) {
					const elapsedSeconds = (now - startTime) / 1000;
					scanRate = totalScanned > 0 && elapsedSeconds > 0 ? totalScanned / elapsedSeconds : 0;
				}
				const remainingScans = Math.max(denominator - totalScanned, 0);
				const remainingSeconds = scanRate > 0 ? Math.round(remainingScans / scanRate) : 0;
				const etaDisplay = formatEta(remainingSeconds);

				JobQueueService.updateJobProgress(job.id, progress, {
					totalProcessed,
					totalSuccess,
					totalErrors,
					totalPoints,
					totalScanned,
					totalToScan: denominator,
					currentBatch: Math.ceil(totalProcessed / BATCH_SIZE),
					totalBatches: Math.ceil(totalPoints / BATCH_SIZE),
					message: `Processed ${totalProcessed.toLocaleString()}/${totalPoints.toLocaleString()} points (${totalErrors} errors)`,
					processedCount: totalProcessed,
					successCount: totalSuccess,
					errorCount: totalErrors,
					totalCount: totalPoints,
					estimatedTimeRemaining: etaDisplay
				});
			}
		);

		console.log(
			`✅ Reverse geocoding completed: ${totalSuccess} successful, ${totalErrors} errors out of ${totalProcessed} total`
		);

		try {
			const { count: actualTotalPoints, error: countError } = await supabase
				.from('tracker_data')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.not('location', 'is', null);

			if (!countError) {
				const { count: actualGeocodedPoints, error: geocodedCountError } = await supabase
					.from('tracker_data')
					.select('*', { count: 'exact', head: true })
					.eq('user_id', userId)
					.not('location', 'is', null)
					.not('geocode', 'is', null)
					.not('geocode', 'eq', '{}');

				if (!geocodedCountError) {
					const totalPointsInDB = actualTotalPoints || 0;
					const totalGeocodedInDB = actualGeocodedPoints || 0;
					const pointsNeedingGeocoding = totalPointsInDB - totalGeocodedInDB;

					const { error: cacheUpdateError } = await supabase.rpc('update_geocoding_stats_cache', {
						p_user_id: userId,
						p_total_points: totalPointsInDB,
						p_geocoded_points: totalGeocodedInDB,
						p_points_needing_geocoding: pointsNeedingGeocoding,
						p_null_or_empty_geocodes: 0,
						p_retryable_errors: 0,
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
		if (error instanceof Error && error.message === 'Job was cancelled') {
			console.log(`🛑 Reverse geocoding job ${job.id} was cancelled`);
			return;
		}
		console.error(`❌ Error in reverse geocoding missing job:`, error);
		throw error;
	}
}

async function processTrackerDataInBatches(
	userId: string,
	batchSize: number,
	jobId: string,
	totalPoints: number,
	startTime: number,
	progressCallback: (scanned: number, processed: number, success: number, errors: number) => void
): Promise<void> {
	let offset = 0;
	let totalProcessed = 0;

	const CONCURRENT_REQUESTS = Math.max(8, Math.min(50, cpus().length * 4));
	console.log(
		`🚀 Using ${CONCURRENT_REQUESTS} concurrent requests (${cpus().length} CPU cores available, 4x for I/O-bound tasks)`
	);
	let hasMoreData = true;

	while (hasMoreData) {
		await checkJobCancellation(jobId);

		const { data: allBatchPoints, error } = await supabase
			.from('tracker_data')
			.select('user_id, location, geocode, recorded_at, raw_data')
			.eq('user_id', userId)
			.not('location', 'is', null)
			.range(offset, offset + batchSize - 1)
			.order('recorded_at', { ascending: false });

		if (error) throw error;

		if (!allBatchPoints || allBatchPoints.length === 0) {
			hasMoreData = false;
			break;
		}

		const points = allBatchPoints?.filter((point) => needsGeocoding(point.geocode)) || [];
		console.log(
			`🔄 Processing batch of ${points.length} tracker data points (offset: ${offset}, total in batch: ${allBatchPoints.length})`
		);

		let batchProcessed = 0;
		let batchSuccess = 0;
		let batchErrors = 0;
		if (points.length > 0) {
			const results = await processPointsInParallel(points, CONCURRENT_REQUESTS, jobId);
			batchProcessed = results.processed;
			batchSuccess = results.success;
			batchErrors = results.errors;
			totalProcessed += results.processed;
		}
		// Always emit progress, even if none needed geocoding
		progressCallback(allBatchPoints.length, batchProcessed, batchSuccess, batchErrors);

		offset += batchSize;
		if (offset > 1000000) {
			console.warn('⚠️ Too many records processed, stopping at 1M');
			hasMoreData = false;
		}
	}

	console.log(`✅ Finished processing all batches. Total processed: ${totalProcessed}`);
}

async function processPointsInParallel(
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
	concurrency: number,
	jobId: string
): Promise<{ processed: number; success: number; errors: number }> {
	let processed = 0;
	let success = 0;
	let errors = 0;

	for (let i = 0; i < points.length; i += concurrency) {
		await checkJobCancellation(jobId);

		const chunk = points.slice(i, i + concurrency);
		const results = await Promise.allSettled(chunk.map((p) => processSinglePoint(p)));
		for (const result of results) {
			processed++;
			if (result.status === 'fulfilled' && result.value) success++;
			else errors++;
		}
		if (i + concurrency < points.length) await delay(50);
	}
	return { processed, success, errors };
}

async function processSinglePoint(point: {
	user_id: string;
	location:
		| string
		| { type: string; coordinates: number[]; crs?: { type: string; properties: { name: string } } };
	geocode: unknown;
	recorded_at: string;
	raw_data?: unknown;
}): Promise<boolean> {
	try {
		if (point.raw_data && typeof point.raw_data === 'object' && point.raw_data !== null) {
			const rawData = point.raw_data as Record<string, unknown>;
			if ('geocode' in rawData && rawData.geocode) {
				console.log(`📋 Using existing geocode from raw_data for point at ${point.recorded_at}`);
				const { error: updateError } = await supabase
					.from('tracker_data')
					.update({ geocode: rawData.geocode, updated_at: new Date().toISOString() })
					.eq('user_id', point.user_id)
					.eq('recorded_at', point.recorded_at);
				if (updateError) {
					console.error(`❌ Database update error:`, updateError);
					await updateGeocodeWithError(point, `Database update error: ${updateError.message}`);
					return false;
				}
				console.log(`✅ Used existing geocode from raw_data`);
				return true;
			}
		}

		let lat: number, lon: number;
		if (point.location && typeof point.location === 'object' && 'coordinates' in point.location) {
			const coords = (point.location as { coordinates: number[] }).coordinates;
			if (!Array.isArray(coords) || coords.length < 2) {
				console.warn(`⚠️ Invalid coordinates format for tracker data point:`, point.location);
				await updateGeocodeWithError(point, 'Invalid coordinates format');
				return false;
			}
			[lon, lat] = coords;
		} else if (typeof point.location === 'string') {
			const locationMatch = point.location.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
			if (!locationMatch) {
				console.warn(`⚠️ Invalid location format for tracker data point: ${point.location}`);
				await updateGeocodeWithError(point, 'Invalid location format');
				return false;
			}
			[lon, lat] = locationMatch.slice(1).map(Number);
		} else {
			console.warn(`⚠️ Unknown location format for tracker data point:`, point.location);
			await updateGeocodeWithError(point, 'Unknown location format');
			return false;
		}

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
			await updateGeocodeWithError(point, `Invalid coordinates: lat=${lat}, lon=${lon}`);
			return false;
		}

		const geocodeResult = await reverseGeocode(lat, lon);
		const { error: updateError } = await supabase
			.from('tracker_data')
			.update({ geocode: geocodeResult, updated_at: new Date().toISOString() })
			.eq('user_id', point.user_id)
			.eq('recorded_at', point.recorded_at);

		if (updateError) {
			console.error(`❌ Database update error:`, updateError);
			await updateGeocodeWithError(point, `Database update error: ${updateError.message}`);
			return false;
		}

		console.log(`✅ Geocoded tracker data point: ${geocodeResult.display_name}`);
		return true;
	} catch (error: unknown) {
		console.error(`❌ Error processing tracker data point:`, (error as Error).message);
		await updateGeocodeWithError(point, `Geocoding error: ${(error as Error).message}`);
		return false;
	}
}

async function updateGeocodeWithError(
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
		const retryable = isRetryableError({ error: true, error_message: errorMessage });
		const errorGeocode = retryable
			? createRetryableError(errorMessage)
			: createPermanentError(errorMessage);
		const { error: updateError } = await supabase
			.from('tracker_data')
			.update({ geocode: errorGeocode, updated_at: new Date().toISOString() })
			.eq('user_id', point.user_id)
			.eq('recorded_at', point.recorded_at);
		if (updateError) {
			console.error(`❌ Failed to update geocode with error:`, updateError);
		} else {
			console.log(
				`⚠️ Updated geocode with ${retryable ? 'retryable' : 'permanent'} error: ${errorMessage}`
			);
		}
	} catch (error) {
		console.error(`❌ Error updating geocode with error:`, error);
	}
}

function formatEta(seconds: number): string {
	if (!seconds || seconds <= 0) return 'Calculating...';
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}m ${s}s`;
	}
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return `${h}h ${m}m ${s}s`;
}
