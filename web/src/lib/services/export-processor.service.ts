import { supabase } from '$lib/core/supabase/worker';
import { ExportService } from './export.service.worker';
import JSZip from 'jszip';
import type { Job } from '$lib/types/job-queue.types';

// Add TrackerLocation interface at the top
interface TrackerLocation {
	location: { coordinates: [number, number] };
	recorded_at: string;
	altitude?: number;
	accuracy?: number;
	speed?: number;
	heading?: number;
	battery_level?: number;
	is_charging?: boolean;
	activity_type?: string;
	country_code?: string;
	geocode?: Record<string, unknown> | null;
}

export class ExportProcessorService {
	private static supabase = supabase;

	static async processExport(job: Job): Promise<void> {
		console.log(`[ExportWorker] Starting export job ${job.id}`);
		// Extract data from job - the actual structure from the export Edge Function
		const jobData = job.data as {
			format: string;
			includeLocationData: boolean;
			includeTripInfo: boolean;
			includeWantToVisit: boolean;
			includeTrips: boolean;
			dateRange?: string;
			startDate?: string | null;
			endDate?: string | null;
		};

		// Use the job creator as the userId
		const userId = job.created_by;
		console.log('[ExportWorker] Job data:', {
			userId,
			includeLocationData: jobData.includeLocationData,
			includeTripInfo: jobData.includeTripInfo,
			includeWantToVisit: jobData.includeWantToVisit,
			includeTrips: jobData.includeTrips,
			startDate: jobData.startDate,
			endDate: jobData.endDate
		});

		try {
			// Update job status to running
			await ExportService.updateExportJobProgress(job.id, 10, {
				message: 'Starting export process...'
			});

			// Add a small delay to make the "running" status visible
			await new Promise(resolve => setTimeout(resolve, 500));

			const zip = new JSZip();
			let totalFiles = 0;

			// Export location data if requested
			if (jobData.includeLocationData) {
				await ExportService.updateExportJobProgress(job.id, 20, {
					message: 'Exporting location data...'
				});
				// Add a small delay to make progress updates visible
				await new Promise(resolve => setTimeout(resolve, 1000));
				const locationData = await this.exportLocationData(userId, jobData.startDate, jobData.endDate);
				if (locationData) {
					zip.file('locations.geojson', locationData);
					totalFiles++;
				} else {
					console.log(`[ExportWorker] No location data found for user ${userId}`);
				}
			}

			// Export trip information if requested
			if (jobData.includeTripInfo) {
				console.log('[ExportWorker] Starting trip info export');
				await ExportService.updateExportJobProgress(job.id, 40, {
					message: 'Exporting trip information...'
				});
				// Add a small delay to make progress updates visible
				await new Promise(resolve => setTimeout(resolve, 1000));
				console.log('[ExportWorker] Calling exportTripInfo');
				const tripInfo = await this.exportTripInfo(userId, jobData.startDate, jobData.endDate);
				console.log('[ExportWorker] exportTripInfo returned', { hasData: !!tripInfo, dataLength: tripInfo?.length || 0 });
				if (tripInfo) {
					zip.file('trip-info.json', tripInfo);
					totalFiles++;
					console.log('[ExportWorker] Added trip info to zip');
				} else {
					console.log(`[ExportWorker] No trip info found for user ${userId}`);
				}
			}

			// Export want-to-visit data if requested
			if (jobData.includeWantToVisit) {
				console.log('[ExportWorker] Starting want-to-visit export');
				await ExportService.updateExportJobProgress(job.id, 60, {
					message: 'Exporting want-to-visit data...'
				});
				// Add a small delay to make progress updates visible
				await new Promise(resolve => setTimeout(resolve, 1000));
				console.log('[ExportWorker] Calling exportWantToVisit');
				const wantToVisitData = await this.exportWantToVisit(userId, jobData.startDate, jobData.endDate);
				console.log('[ExportWorker] exportWantToVisit returned', { hasData: !!wantToVisitData, dataLength: wantToVisitData?.length || 0 });
				if (wantToVisitData) {
					zip.file('want-to-visit.json', wantToVisitData);
					totalFiles++;
					console.log('[ExportWorker] Added want-to-visit data to zip');
				} else {
					console.log(`[ExportWorker] No want-to-visit data found for user ${userId}`);
				}
			}

			// Export trips data if requested
			if (jobData.includeTrips) {
				console.log(`[ExportWorker] Starting trips export for job ${job.id}`);
				await ExportService.updateExportJobProgress(job.id, 80, {
					message: 'Exporting trips data...'
				});
				// Add a small delay to make progress updates visible
				await new Promise(resolve => setTimeout(resolve, 1000));
				const tripsData = await this.exportTrips(userId, jobData.startDate, jobData.endDate);
				console.log(`[ExportWorker] Trips export completed for job ${job.id}, data length: ${tripsData?.length || 0}`);
				if (tripsData) {
					zip.file('trips.json', tripsData);
					totalFiles++;
				} else {
					console.log(`[ExportWorker] No trips data found for user ${userId}`);
				}
			}

			// Generate zip file
			console.log(`[ExportWorker] Generating zip file for job ${job.id} with ${totalFiles} files`);
			const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
			console.log(`[ExportWorker] Zip file generated, size: ${zipBuffer.length} bytes`);

			// Upload to storage
			const fileName = `export_${userId}_${Date.now()}.zip`;
			const filePath = `${userId}/${fileName}`;
			console.log(`[ExportWorker] Uploading zip file to storage: ${filePath}`);

			// Before uploading, delete old export files (keep only 5 most recent)
			const exportJobs = await ExportService.getUserExportJobs(userId);
			const oldJobs = exportJobs.filter((job, idx) => idx >= 5 && job.file_path);
			if (oldJobs.length > 0) {
				const oldPaths = oldJobs.map(job => job.file_path).filter((p): p is string => typeof p === 'string');
				if (oldPaths.length > 0) {
					console.log(`[ExportWorker] Deleting old export files:`, oldPaths);
					await this.supabase.storage.from('exports').remove(oldPaths);
				}
			}

			const { error: uploadError } = await this.supabase.storage
				.from('exports')
				.upload(filePath, zipBuffer, {
					contentType: 'application/zip',
					upsert: false
				});

			if (uploadError) {
				console.error(`[ExportWorker] Failed to upload export file: ${uploadError.message}`);
				throw new Error(`Failed to upload export file: ${uploadError.message}`);
			}

			// Update progress to 100% before completing
			await ExportService.updateExportJobProgress(job.id, 100, {
				message: 'Finalizing export...'
			});

			// Complete the export job
			console.log(`[ExportWorker] Completing export job ${job.id} with ${totalFiles} files`);
			await ExportService.completeExportJob(job.id, filePath, zipBuffer.length, {
				totalFiles,
				format: jobData.format,
				exportedAt: new Date().toISOString(),
				file_path: filePath,
				file_size: zipBuffer.length
			});
			console.log(`[ExportWorker] Export job ${job.id} completed successfully.`);
		} catch (error) {
			console.error(`[ExportWorker] Export processing failed for job ${job.id}:`, error);
			await ExportService.failExportJob(
				job.id,
				error instanceof Error ? error.message : 'Unknown error'
			);
		}
	}

	private static async exportLocationData(userId: string, startDate?: string | null, endDate?: string | null): Promise<string | null> {
		console.log('[ExportWorker] exportLocationData', { userId, startDate, endDate });
		const batchSize = 1000;
		let offset = 0;
		let totalFetched = 0;
		let batchNum = 0;
		let firstFeature = true;
		let geojson = '{"type":"FeatureCollection","features":[';
		const geocodeArray: (Record<string, unknown> | null)[] = [];

		while (true) {
			let query = this.supabase
				.from('tracker_data')
				.select('*')
				.eq('user_id', userId);
			if (startDate) query = query.gte('recorded_at', startDate);
			if (endDate) query = query.lte('recorded_at', endDate);
			query = query.order('recorded_at', { ascending: true }).range(offset, offset + batchSize - 1);
			const { data: locations, error } = await query;
			batchNum++;
			console.log(`[ExportWorker] exportLocationData batch ${batchNum}`, { offset, count: locations?.length, error });
			if (error) throw error;
			if (!locations || locations.length === 0) break;

			const features = locations.map((location: TrackerLocation) => {
				// Add geocode to the array (null if missing)
				geocodeArray.push(location.geocode ?? null);
				return JSON.stringify({
					type: 'Feature',
					geometry: {
						type: 'Point',
						coordinates: [location.location.coordinates[0], location.location.coordinates[1]]
					},
					properties: {
						recorded_at: location.recorded_at,
						altitude: location.altitude,
						accuracy: location.accuracy,
						speed: location.speed,
						heading: location.heading,
						battery_level: location.battery_level,
						is_charging: location.is_charging,
						activity_type: location.activity_type,
						country_code: location.country_code,
						geocode: location.geocode ?? null
					}
				});
			});

			if (!firstFeature) geojson += ',';
			geojson += features.join(',');
			firstFeature = false;

			totalFetched += locations.length;
			offset += batchSize;

			// If less than batchSize, this was the last batch
			if (locations.length < batchSize) break;
		}

		geojson += ']';
		// Add geocode array at the top level
		geojson += ',"geocode":' + JSON.stringify(geocodeArray);
		geojson += '}';
		console.log('[ExportWorker] exportLocationData done', { totalFetched, batches: batchNum });
		return geojson;
	}

	private static async exportTripInfo(userId: string, startDate?: string | null, endDate?: string | null): Promise<string | null> {
		console.log('[ExportWorker] exportTripInfo starting', { userId, startDate, endDate });
		let query = this.supabase
			.from('trips')
			.select('*')
			.eq('user_id', userId);
		if (startDate) query = query.gte('start_date', startDate);
		if (endDate) query = query.lte('end_date', endDate);
		query = query.order('start_date', { ascending: true });
		const { data: trips, error } = await query;
		console.log('[ExportWorker] exportTripInfo query result', {
			count: trips?.length || 0,
			error: error?.message
		});
		if (error || !trips || trips.length === 0) {
			console.log('[ExportWorker] exportTripInfo returning null');
			return null;
		}
		const result = JSON.stringify(trips, null, 2);
		console.log('[ExportWorker] exportTripInfo completed', {
			resultLength: result.length
		});
		return result;
	}

	private static async exportWantToVisit(userId: string, startDate?: string | null, endDate?: string | null): Promise<string | null> {
		console.log('[ExportWorker] exportWantToVisit starting', { userId, startDate, endDate });
		let query = this.supabase
			.from('want_to_visit_places')
			.select('*')
			.eq('user_id', userId);
		if (startDate) query = query.gte('created_at', startDate);
		if (endDate) query = query.lte('created_at', endDate);
		query = query.order('created_at', { ascending: true });
		const { data: wantToVisit, error } = await query;
		console.log('[ExportWorker] exportWantToVisit query result', {
			count: wantToVisit?.length || 0,
			error: error?.message
		});
		if (error || !wantToVisit || wantToVisit.length === 0) {
			console.log('[ExportWorker] exportWantToVisit returning null');
			return null;
		}
		const result = JSON.stringify(wantToVisit, null, 2);
		console.log('[ExportWorker] exportWantToVisit completed', {
			resultLength: result.length
		});
		return result;
	}

	private static async exportTrips(userId: string, startDate?: string | null, endDate?: string | null): Promise<string | null> {
		console.log('[ExportWorker] exportTrips starting', { userId, startDate, endDate });
		let query = this.supabase
			.from('trips')
			.select('*')
			.eq('user_id', userId);
		if (startDate) query = query.gte('start_date', startDate);
		if (endDate) query = query.lte('end_date', endDate);
		query = query.order('start_date', { ascending: true });
		const { data: trips, error } = await query;
		console.log('[ExportWorker] exportTrips query result', {
			count: trips?.length || 0,
			error: error?.message
		});
		if (error || !trips || trips.length === 0) {
			console.log('[ExportWorker] exportTrips returning null');
			return null;
		}
		const result = JSON.stringify(trips, null, 2);
		console.log('[ExportWorker] exportTrips completed', {
			resultLength: result.length
		});
		return result;
	}
}
