import { supabase } from '$lib/core/supabase/worker';
import { ExportService } from './export.service.worker';
import JSZip from 'jszip';
import type { Job } from '$lib/types/job-queue.types';

interface LocationData {
	location: {
		coordinates: [number, number];
	};
	recorded_at: string;
	altitude?: number;
	accuracy?: number;
	speed?: number;
	heading?: number;
	battery_level?: number;
	is_charging?: boolean;
	activity_type?: string;
	country_code?: string;
}

interface TripData {
	id: string;
	title: string;
	description?: string;
	start_date: string;
	end_date: string;
	status: string;
	image_url?: string;
	labels?: string[];
	metadata?: Record<string, unknown>;
}

interface WantToVisitData {
	id: string;
	title: string;
	type: string;
	coordinates: string;
	description?: string;
	address?: string;
	location?: string;
	marker_type?: string;
	marker_color?: string;
	labels?: string[];
	favorite?: boolean;
	created_at: string;
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
				const locationData = await this.exportLocationData(userId, options.format);
				if (locationData) {
					zip.file(`locations.${this.getFileExtension(options.format)}`, locationData);
					totalFiles++;
				}
			}

			// Export trip information if requested
			if (options.includeTripInfo) {
				await ExportService.updateExportJobProgress(job.id, 40, {
					message: 'Exporting trip information...'
				});
				const tripInfo = await this.exportTripInfo(userId, options.format);
				if (tripInfo) {
					zip.file(`trips.${this.getFileExtension(options.format)}`, tripInfo);
					totalFiles++;
				}
			}

			// Export want-to-visit places if requested
			if (options.includeWantToVisit) {
				await ExportService.updateExportJobProgress(job.id, 60, {
					message: 'Exporting want-to-visit places...'
				});
				const wantToVisit = await this.exportWantToVisit(userId, options.format);
				if (wantToVisit) {
					zip.file(`want-to-visit.${this.getFileExtension(options.format)}`, wantToVisit);
					totalFiles++;
				}
			}

			// Export trips if requested
			if (options.includeTrips) {
				await ExportService.updateExportJobProgress(job.id, 80, { message: 'Exporting trips...' });
				const trips = await this.exportTrips(userId, options.format);
				if (trips) {
					zip.file(`trips.${this.getFileExtension(options.format)}`, trips);
					totalFiles++;
				}
			}

			// Generate zip file
			await ExportService.updateExportJobProgress(job.id, 90, { message: 'Creating zip file...' });
			const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

			// Upload to storage
			const fileName = `export_${userId}_${Date.now()}.zip`;
			const filePath = `${userId}/${fileName}`;

			const { error: uploadError } = await this.supabase.storage
				.from('exports')
				.upload(filePath, zipBuffer, {
					contentType: 'application/zip',
					upsert: false
				});

			if (uploadError) {
				throw new Error(`Failed to upload export file: ${uploadError.message}`);
			}

			// Complete the export job
			await ExportService.completeExportJob(job.id, filePath, zipBuffer.length, {
				totalFiles,
				format: options.format,
				exportedAt: new Date().toISOString()
			});
		} catch (error) {
			console.error('Export processing failed:', error);
			await ExportService.failExportJob(
				job.id,
				error instanceof Error ? error.message : 'Unknown error'
			);
		}
	}

	private static async exportLocationData(userId: string, format: string): Promise<string | null> {
		const { data: locations, error } = await this.supabase
			.from('tracker_data')
			.select('*')
			.eq('user_id', userId)
			.order('recorded_at', { ascending: true });

		if (error || !locations || locations.length === 0) {
			return null;
		}

		const typedLocations = locations as LocationData[];

		switch (format) {
			case 'GeoJSON':
				return this.convertToGeoJSON(typedLocations, 'Location Data');
			case 'GPX':
				return this.convertToGPX(typedLocations, 'Location Data');
			case 'OwnTracks':
				return this.convertToOwnTracks(typedLocations);
			default:
				return JSON.stringify(typedLocations, null, 2);
		}
	}

	private static async exportTripInfo(userId: string, format: string): Promise<string | null> {
		const { data: trips, error } = await this.supabase
			.from('trips')
			.select('*')
			.eq('user_id', userId)
			.order('start_date', { ascending: true });

		if (error || !trips || trips.length === 0) {
			return null;
		}

		switch (format) {
			case 'GeoJSON':
				return this.convertTripsToGeoJSON(trips);
			case 'GPX':
				return this.convertTripsToGPX(trips);
			case 'OwnTracks':
				return this.convertTripsToOwnTracks(trips);
			default:
				return JSON.stringify(trips, null, 2);
		}
	}

	private static async exportWantToVisit(userId: string, format: string): Promise<string | null> {
		const { data: wantToVisit, error } = await this.supabase
			.from('want_to_visit_places')
			.select('*')
			.eq('user_id', userId)
			.order('created_at', { ascending: true });

		if (error || !wantToVisit || wantToVisit.length === 0) {
			return null;
		}

		switch (format) {
			case 'GeoJSON':
				return this.convertWantToVisitToGeoJSON(wantToVisit);
			case 'GPX':
				return this.convertWantToVisitToGPX(wantToVisit);
			case 'OwnTracks':
				return this.convertWantToVisitToOwnTracks(wantToVisit);
			default:
				return JSON.stringify(wantToVisit, null, 2);
		}
	}

	private static async exportTrips(userId: string, format: string): Promise<string | null> {
		const { data: trips, error } = await this.supabase
			.from('trips')
			.select('*')
			.eq('user_id', userId)
			.order('start_date', { ascending: true });

		if (error || !trips || trips.length === 0) {
			return null;
		}

		switch (format) {
			case 'GeoJSON':
				return this.convertTripsToGeoJSON(trips);
			case 'GPX':
				return this.convertTripsToGPX(trips);
			case 'OwnTracks':
				return this.convertTripsToOwnTracks(trips);
			default:
				return JSON.stringify(trips, null, 2);
		}
	}

	private static convertToGeoJSON(locations: any[], name: string): string {
		const features = locations.map((location) => ({
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
				country_code: location.country_code
			}
		}));

		const geojson = {
			type: 'FeatureCollection',
			name,
			features
		};

		return JSON.stringify(geojson, null, 2);
	}

	private static convertToGPX(locations: any[], name: string): string {
		let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Wayli Export" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>`;

		locations.forEach((location) => {
			const coords = location.location.coordinates;
			gpx += `
      <trkpt lat="${coords[1]}" lon="${coords[0]}">
        <time>${location.recorded_at}</time>
        ${location.altitude ? `<ele>${location.altitude}</ele>` : ''}
        ${location.speed ? `<speed>${location.speed}</speed>` : ''}
      </trkpt>`;
		});

		gpx += `
    </trkseg>
  </trk>
</gpx>`;

		return gpx;
	}

	private static convertToOwnTracks(locations: any[]): string {
		return locations
			.map((location) => {
				const coords = location.location.coordinates;
				const timestamp = Math.floor(new Date(location.recorded_at).getTime() / 1000);
				return `${timestamp},${coords[1]},${coords[0]},${location.altitude || 0},${location.accuracy || 0},${location.speed || 0},${location.heading || 0},${location.battery_level || 0},${location.is_charging ? 1 : 0},${location.activity_type || ''}`;
			})
			.join('\n');
	}

	private static convertTripsToGeoJSON(trips: any[]): string {
		const features = trips.map((trip) => ({
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: [0, 0] // Placeholder - trips don't have specific coordinates
			},
			properties: {
				id: trip.id,
				title: trip.title,
				description: trip.description,
				start_date: trip.start_date,
				end_date: trip.end_date,
				status: trip.status,
				image_url: trip.image_url,
				labels: trip.labels,
				metadata: trip.metadata
			}
		}));

		const geojson = {
			type: 'FeatureCollection',
			name: 'Trips',
			features
		};

		return JSON.stringify(geojson, null, 2);
	}

	private static convertTripsToGPX(trips: any[]): string {
		let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Wayli Export" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Trips</name>
    <time>${new Date().toISOString()}</time>
  </metadata>`;

		trips.forEach((trip) => {
			gpx += `
  <wpt lat="0" lon="0">
    <name>${trip.title}</name>
    <desc>${trip.description || ''}</desc>
    <time>${trip.start_date}</time>
  </wpt>`;
		});

		gpx += `
</gpx>`;

		return gpx;
	}

	private static convertTripsToOwnTracks(trips: any[]): string {
		return trips
			.map((trip) => {
				const startTimestamp = Math.floor(new Date(trip.start_date).getTime() / 1000);
				return `${startTimestamp},0,0,0,0,0,0,0,0,trip:${trip.title}`;
			})
			.join('\n');
	}

	private static convertWantToVisitToGeoJSON(wantToVisit: any[]): string {
		const features = wantToVisit.map((place) => {
			const [lat, lng] = place.coordinates.split(',').map(Number);
			return {
				type: 'Feature',
				geometry: {
					type: 'Point',
					coordinates: [lng, lat]
				},
				properties: {
					id: place.id,
					title: place.title,
					type: place.type,
					description: place.description,
					address: place.address,
					location: place.location,
					marker_type: place.marker_type,
					marker_color: place.marker_color,
					labels: place.labels,
					favorite: place.favorite
				}
			};
		});

		const geojson = {
			type: 'FeatureCollection',
			name: 'Want to Visit Places',
			features
		};

		return JSON.stringify(geojson, null, 2);
	}

	private static convertWantToVisitToGPX(wantToVisit: any[]): string {
		let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Wayli Export" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Want to Visit Places</name>
    <time>${new Date().toISOString()}</time>
  </metadata>`;

		wantToVisit.forEach((place) => {
			const [lat, lng] = place.coordinates.split(',').map(Number);
			gpx += `
  <wpt lat="${lat}" lon="${lng}">
    <name>${place.title}</name>
    <desc>${place.description || ''}</desc>
    <type>${place.type}</type>
  </wpt>`;
		});

		gpx += `
</gpx>`;

		return gpx;
	}

	private static convertWantToVisitToOwnTracks(wantToVisit: any[]): string {
		return wantToVisit
			.map((place) => {
				const [lat, lng] = place.coordinates.split(',').map(Number);
				const timestamp = Math.floor(new Date(place.created_at).getTime() / 1000);
				return `${timestamp},${lat},${lng},0,0,0,0,0,0,want-to-visit:${place.title}`;
			})
			.join('\n');
	}

	private static getFileExtension(format: string): string {
		switch (format) {
			case 'GeoJSON':
				return 'geojson';
			case 'GPX':
				return 'gpx';
			case 'OwnTracks':
				return 'rec';
			default:
				return 'json';
		}
	}
}
