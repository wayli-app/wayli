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
		const { userId, options } = job.data as {
			userId: string;
			options: {
				format: string;
				includeLocationData: boolean;
				includeTripInfo: boolean;
				includeWantToVisit: boolean;
				includeTrips: boolean;
				startDate?: string | null;
				endDate?: string | null;
			};
		};

		try {
			// Update job status to running
			await ExportService.updateExportJobProgress(job.id, 10, {
				message: 'Starting export process...'
			});

			const zip = new JSZip();
			let totalFiles = 0;

			// Export location data if requested
			if (options.includeLocationData) {
				await ExportService.updateExportJobProgress(job.id, 20, {
					message: 'Exporting location data...'
				});
				const locationData = await this.exportLocationData(userId, options.startDate, options.endDate);
				if (locationData) {
					zip.file('locations.geojson', locationData);
					totalFiles++;
				} else {
					console.log(`[ExportWorker] No location data found for user ${userId}`);
				}
			}

			// Export trip information if requested
			if (options.includeTripInfo) {
				await ExportService.updateExportJobProgress(job.id, 40, {
					message: 'Exporting trip information...'
				});
				const tripInfo = await this.exportTripInfo(userId, options.startDate, options.endDate);
				if (tripInfo) {
					zip.file('trips.json', tripInfo);
					totalFiles++;
				} else {
					console.log(`[ExportWorker] No trip info found for user ${userId}`);
				}
			}

			// Export want-to-visit data if requested
			if (options.includeWantToVisit) {
				await ExportService.updateExportJobProgress(job.id, 60, {
					message: 'Exporting want-to-visit data...'
				});
				const wantToVisitData = await this.exportWantToVisit(userId, options.startDate, options.endDate);
				if (wantToVisitData) {
					zip.file('want-to-visit.json', wantToVisitData);
					totalFiles++;
				} else {
					console.log(`[ExportWorker] No want-to-visit data found for user ${userId}`);
				}
			}

			// Export trips data if requested
			if (options.includeTrips) {
				await ExportService.updateExportJobProgress(job.id, 80, {
					message: 'Exporting trips data...'
				});
				const tripsData = await this.exportTrips(userId, options.startDate, options.endDate);
				if (tripsData) {
					zip.file('trips.json', tripsData);
					totalFiles++;
				} else {
					console.log(`[ExportWorker] No trips data found for user ${userId}`);
				}
			}

			// Generate zip file
			const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

			// Upload to storage
			const fileName = `export_${userId}_${Date.now()}.zip`;
			const filePath = `${userId}/${fileName}`;

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

			// Complete the export job
			await ExportService.completeExportJob(job.id, filePath, zipBuffer.length, {
				totalFiles,
				format: options.format,
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
		let query = this.supabase
			.from('trips')
			.select('*')
			.eq('user_id', userId);
		if (startDate) query = query.gte('start_date', startDate);
		if (endDate) query = query.lte('end_date', endDate);
		query = query.order('start_date', { ascending: true });
		const { data: trips, error } = await query;
		if (error || !trips || trips.length === 0) {
			return null;
		}
		return JSON.stringify(trips, null, 2);
	}

	private static async exportWantToVisit(userId: string, startDate?: string | null, endDate?: string | null): Promise<string | null> {
		let query = this.supabase
			.from('want_to_visit_places')
			.select('*')
			.eq('user_id', userId);
		if (startDate) query = query.gte('created_at', startDate);
		if (endDate) query = query.lte('created_at', endDate);
		query = query.order('created_at', { ascending: true });
		const { data: wantToVisit, error } = await query;
		if (error || !wantToVisit || wantToVisit.length === 0) {
			return null;
		}
		return JSON.stringify(wantToVisit, null, 2);
	}

	private static async exportTrips(userId: string, startDate?: string | null, endDate?: string | null): Promise<string | null> {
		let query = this.supabase
			.from('trips')
			.select('*')
			.eq('user_id', userId);
		if (startDate) query = query.gte('start_date', startDate);
		if (endDate) query = query.lte('end_date', endDate);
		query = query.order('start_date', { ascending: true });
		const { data: trips, error } = await query;
		if (error || !trips || trips.length === 0) {
			return null;
		}
		return JSON.stringify(trips, null, 2);
	}
}
