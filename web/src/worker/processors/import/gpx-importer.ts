// web/src/lib/services/queue/processors/import/gpx-importer.ts

import { supabase } from '../../supabase';
import {
	getCountryForPoint as getCountryForPointExternal,
	normalizeCountryCode as normalizeCountryCodeExternal,
	applyTimezoneCorrectionToTimestamp,
	getTimezoneDifferenceForPoint
} from '../../../lib/services/external/country-reverse-geocoding.service';
import { JobQueueService } from '../../job-queue.service.worker';
import { checkJobCancellation } from '../../../lib/utils/job-cancellation';

export async function importGPXWithProgress(
	content: string,
	userId: string,
	jobId: string,
	fileName: string
): Promise<{ importedCount: number; totalItems: number }> {
	try {
		console.log('🗺️ Starting GPX import with progress tracking');

		const parser = new (await import('fast-xml-parser')).XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: '@_'
		});

		const gpxData = parser.parse(content);
		const tracks = ensureArray(gpxData.gpx?.trk ?? []);
		const waypoints = ensureArray(gpxData.gpx?.wpt ?? []);

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

		// Waypoints
		console.log(`🎯 Processing ${waypoints.length.toLocaleString()} waypoints...`);
		for (let i = 0; i < waypoints.length; i++) {
			if (i % 5 === 0) await checkJobCancellation(jobId);

			const waypoint = waypoints[i];
			const lat = parseFloat(waypoint['@_lat']);
			const lon = parseFloat(waypoint['@_lon']);

			// Skip points with null or invalid coordinates
			if (isNaN(lat) || isNaN(lon) || lat === null || lon === null) {
				skippedCount++;
				console.log(`⚠️ Skipping waypoint ${i + 1}: invalid coordinates (lat: ${lat}, lon: ${lon})`);
				continue;
			}

			const countryCode = safeNormalizeCountryCode(safeGetCountryForPoint(lat, lon));

			let recordedAt = waypoint.time || new Date().toISOString();

			// Apply timezone correction if we have a timestamp
			if (waypoint.time) {
				recordedAt = applyTimezoneCorrectionToTimestamp(waypoint.time, lat, lon);
			}

			// Calculate timezone difference for this location
			const tzDiff = getTimezoneDifferenceForPoint(lat, lon);

			// Create GeoJSON feature for the waypoint
			const geocodeFeature = {
				type: 'Feature',
				geometry: {
					type: 'Point',
					coordinates: [lon, lat]
				},
				properties: {
					name: waypoint.name || `GPX Waypoint ${i + 1}`,
					description: waypoint.desc || `Imported from ${fileName}`,
					category: 'waypoint',
					import_source: 'gpx',
					data_type: 'waypoint',
					imported_at: new Date().toISOString()
				}
			};

			const { error } = await supabase.from('tracker_data').insert({
				user_id: userId,
				tracker_type: 'import',
				location: `POINT(${lon} ${lat})`,
				recorded_at: recordedAt,
				country_code: countryCode,
				tz_diff: tzDiff,  // Add timezone difference
				geocode: geocodeFeature,
				created_at: new Date().toISOString()
			} as any);

			if (!error) {
				importedCount++;
			} else {
				const err = error as { code?: string };
				if (err.code === '23505') skippedCount++;
				else {
					errorCount++;
					console.error(`❌ Error inserting waypoint ${i}:`, error);
				}
			}

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

		// Tracks
		console.log(`🛤️ Processing ${tracks.length.toLocaleString()} tracks...`);
		for (let i = 0; i < tracks.length; i++) {
			await checkJobCancellation(jobId);

			const track = tracks[i];
			const trackSegments = ensureArray(track?.trkseg ?? []);
			const trackPoints = trackSegments.flatMap((seg: { trkpt?: unknown[] }) =>
				ensureArray(seg?.trkpt ?? [])
			);
			console.log(
				`🛤️ Track ${i + 1}/${tracks.length}: ${trackPoints.length.toLocaleString()} points`
			);

			for (let j = 0; j < trackPoints.length; j++) {
				const point = trackPoints[j] as { '@_lat': string; '@_lon': string; time?: string };
				const lat = parseFloat(point['@_lat']);
				const lon = parseFloat(point['@_lon']);

				// Skip points with null or invalid coordinates
				if (isNaN(lat) || isNaN(lon) || lat === null || lon === null) {
					skippedCount++;
					console.log(`⚠️ Skipping waypoint ${i + 1}: invalid coordinates (lat: ${lat}, lon: ${lon})`);
					continue;
				}

				const countryCode = safeNormalizeCountryCode(safeGetCountryForPoint(lat, lon));

				let recordedAt = point.time || new Date().toISOString();

				// Apply timezone correction if we have a timestamp
				if (point.time) {
					recordedAt = applyTimezoneCorrectionToTimestamp(point.time, lat, lon);
				}

				// Calculate timezone difference for this location
				const tzDiff = getTimezoneDifferenceForPoint(lat, lon);

				// Create GeoJSON feature for the track point
				const geocodeFeature = {
					type: 'Feature',
					geometry: {
						type: 'Point',
						coordinates: [lon, lat]
					},
					properties: {
						import_source: 'gpx',
						data_type: 'track_point',
						imported_at: new Date().toISOString()
					}
				};

				const { error } = await supabase.from('tracker_data').upsert(
					{
						user_id: userId,
						tracker_type: 'import',
						location: `POINT(${lon} ${lat})`,
						recorded_at: recordedAt,
						country_code: countryCode,
						tz_diff: tzDiff,  // Add timezone difference
						geocode: geocodeFeature,
						created_at: new Date().toISOString()
					} as any,
					{ onConflict: 'user_id,recorded_at', ignoreDuplicates: false, defaultToNull: false }
				);

				if (!error) importedCount++;
				else {
					const err = error as { code?: string };
					if (err.code === '23505') skippedCount++;
					else {
						errorCount++;
						console.error(`❌ Error inserting track point ${j} in track ${i}:`, error);
					}
				}
			}

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

		return { importedCount, totalItems };
	} catch (error) {
		if (error instanceof Error && error.message === 'Job was cancelled') {
			console.log(`🛑 GPX import was cancelled`);
			return { importedCount: 0, totalItems: 0 };
		}
		console.error('❌ Error in GPX import:', error);
		throw error;
	}
}

function safeGetCountryForPoint(lat: number, lon: number): string | null {
	try {
		return getCountryForPointExternal(lat, lon);
	} catch (e) {
		console.warn('Failed to get country for point:', e);
		return null;
	}
}

function safeNormalizeCountryCode(countryCode: string | null): string | null {
	try {
		return normalizeCountryCodeExternal(countryCode);
	} catch (e) {
		console.warn('Failed to normalize country code:', e);
		return null;
	}
}

function ensureArray<T>(value: T | T[] | undefined | null): T[] {
	if (value == null) return [] as T[];
	return Array.isArray(value) ? value : [value];
}
