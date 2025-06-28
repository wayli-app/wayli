import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/utils/api/response';
import { XMLParser } from 'fast-xml-parser';
import { getCountryForPoint } from '$lib/services/external/country-reverse-geocoding.service';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Global progress tracking (shared with progress endpoint)
declare global {
	var importProgress: Map<string, { current: number; total: number; status: string }>;
}

if (!globalThis.importProgress) {
	globalThis.importProgress = new Map();
}

// Global error handler to prevent unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
	// Don't exit the process, just log the error
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		console.log('Import request started');
		const formData = await request.formData();
		const file = formData.get('file') as File;
		const format = formData.get('format') as string;

		if (!file) {
			return validationErrorResponse('No file provided');
		}

		if (!format) {
			return validationErrorResponse('No format specified');
		}

		console.log(`Processing import: ${file.name}, format: ${format}, size: ${file.size}`);

		// Get user ID using secure authentication
		const { data: { user }, error: userError } = await locals.supabase.auth.getUser();

		if (userError) {
			console.error('Authentication error:', userError);
			return errorResponse('Authentication error: ' + userError.message, 401);
		}

		if (!user?.id) {
			console.error('No authenticated user found');
			return errorResponse('No authenticated user found', 401);
		}

		const userId = user.id;
		// Use client-provided import ID or generate one if not provided
		const importId = (formData.get('importId') as string) || `${userId}-${Date.now()}`;
		console.log('🔐 Authenticated user:', userId, 'Import ID:', importId);

		// Initialize progress tracking
		globalThis.importProgress.set(importId, { current: 0, total: 0, status: 'Starting import...' });

		// Test database connection and permissions
		console.log('🧪 Testing database connection...');
		const { error: testError } = await locals.supabase
			.from('points_of_interest')
			.select('id')
			.limit(1);

		if (testError) {
			console.error('❌ Database connection test failed:', testError);
			return errorResponse('Database connection failed: ' + testError.message, 500);
		}
		console.log('✅ Database connection test passed');

		// Test insert permission
		console.log('🧪 Testing insert permission...');
		const { error: insertTestError } = await locals.supabase
			.from('points_of_interest')
			.insert({
				user_id: userId,
				location: 'POINT(0 0)',
				name: 'Test Point',
				description: 'Test insert',
				created_at: new Date()
			});

		if (insertTestError) {
			console.error('❌ Insert permission test failed:', insertTestError);
			return errorResponse('Database insert permission failed: ' + insertTestError.message, 500);
		}
		console.log('✅ Insert permission test passed');

		// Clean up test record
		await locals.supabase
			.from('points_of_interest')
			.delete()
			.eq('name', 'Test Point')
			.eq('user_id', userId);

		// Read the file content
		const fileContent = await file.text();
		console.log(`File content read, length: ${fileContent.length}`);

		// Process the import directly to avoid worker UUID issues
		let importedCount = 0;
		let totalItems = 0;

		console.log(`Starting import processing for format: ${format}`);
		switch (format) {
			case 'GeoJSON':
				importedCount = await importGeoJSON(fileContent, userId, locals.supabase, importId);
				break;
			case 'GPX': {
				const result = await importGPX(fileContent, userId, locals.supabase, importId);
				importedCount = result.importedCount;
				totalItems = result.totalItems;
				break;
			}
			case 'OwnTracks':
				importedCount = await importOwnTracks(fileContent, userId, locals.supabase, importId);
				break;
			default:
				return validationErrorResponse('Unsupported format');
		}

		// Update final progress
		globalThis.importProgress.set(importId, { current: importedCount, total: totalItems || importedCount, status: 'Import completed!' });

		// Verify the data was actually inserted
		console.log('🔍 Verifying data insertion...');

		// Check points_of_interest table
		const { error: poiVerifyError, count: poiCount } = await locals.supabase
			.from('points_of_interest')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', userId);

		// Check tracker_data table
		const { error: trackerVerifyError, count: trackerCount } = await locals.supabase
			.from('tracker_data')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', userId);

		if (poiVerifyError) {
			console.error('❌ Points of interest verification query failed:', poiVerifyError);
		} else {
			console.log(`✅ Points of interest verification: Found ${poiCount} records for user ${userId}`);
		}

		if (trackerVerifyError) {
			console.error('❌ Tracker data verification query failed:', trackerVerifyError);
		} else {
			console.log(`✅ Tracker data verification: Found ${trackerCount} records for user ${userId}`);
		}

		const totalRecords = (poiCount || 0) + (trackerCount || 0);
		console.log(`✅ Total verification: Found ${totalRecords} total records for user ${userId}`);

		return successResponse({
			importedCount,
			totalCount: totalItems || importedCount,
			message: `Successfully imported ${importedCount} items`,
			importId
		});

	} catch (error) {
		console.error('Import error:', error);
		return errorResponse(error);
	}
};

async function importGeoJSON(content: string, userId: string, supabase: any, importId: string): Promise<number> {
	try {
		console.log('Starting GeoJSON import');
		const geojson = JSON.parse(content);
		let importedCount = 0;

		if (geojson.type === 'FeatureCollection' && geojson.features) {
			console.log(`Processing ${geojson.features.length} features`);

			// Update progress with total items
			globalThis.importProgress.set(importId, { current: 0, total: geojson.features.length, status: 'Processing GeoJSON features...' });

			for (let i = 0; i < geojson.features.length; i++) {
				const feature = geojson.features[i];

				// Update progress every 10 features
				if (i % 10 === 0) {
					console.log(`Processing GeoJSON feature ${i + 1}/${geojson.features.length} (${Math.round((i / geojson.features.length) * 100)}%)`);
					globalThis.importProgress.set(importId, { current: importedCount, total: geojson.features.length, status: `Processing GeoJSON features... ${i + 1}/${geojson.features.length}` });
				}

				if (feature.geometry?.type === 'Point' && feature.geometry.coordinates) {
					const [longitude, latitude] = feature.geometry.coordinates;
					const properties = feature.properties || {};

					const countryCode = getCountryForPoint(latitude, longitude);
					const { error } = await supabase
						.from('points_of_interest')
						.insert({
							user_id: userId,
							location: `POINT(${longitude} ${latitude})`,
							name: properties.name || 'Imported Point',
							description: properties.description || '',
							created_at: properties.timestamp ? new Date(properties.timestamp) : null,
							country_code: countryCode
						});

					if (!error) {
						importedCount++;
					} else {
						console.error('Error inserting GeoJSON feature:', error);
					}
				}
			}
		}

		console.log(`GeoJSON import completed: ${importedCount} items imported`);
		return importedCount;
	} catch (error) {
		console.error('GeoJSON import error:', error);
		throw new Error('Invalid GeoJSON format');
	}
}

async function importGPX(content: string, userId: string, supabase: any, importId: string): Promise<{ importedCount: number; totalItems: number }> {
	try {
		console.log('Starting GPX import');
		const parser = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: '@_'
		});

		const gpx = parser.parse(content);
		let importedCount = 0;
		let totalItems = 0;

		// Count total items first (only track points)
		if (gpx.gpx?.trk?.trkseg?.trkpt) {
			const trackPoints = Array.isArray(gpx.gpx.trk.trkseg.trkpt)
				? gpx.gpx.trk.trkseg.trkpt
				: [gpx.gpx.trk.trkseg.trkpt];
			totalItems += trackPoints.length;
			console.log(`Found ${trackPoints.length} track points to process`);
		}

		console.log(`Total items to import: ${totalItems}`);

		// Update progress with total items
		globalThis.importProgress.set(importId, { current: 0, total: totalItems, status: 'Processing track points...' });

		// Handle track points (batch insert)
		if (gpx.gpx?.trk?.trkseg?.trkpt) {
			const trackPoints = Array.isArray(gpx.gpx.trk.trkseg.trkpt)
				? gpx.gpx.trk.trkseg.trkpt
				: [gpx.gpx.trk.trkseg.trkpt];
			console.log(`Processing ${trackPoints.length} track points...`);

			const BATCH_SIZE = 1000;
			let buffer: any[] = [];

			for (let i = 0; i < trackPoints.length; i++) {
				const trkpt = trackPoints[i];
				buffer.push({
					user_id: userId,
					location: `POINT(${trkpt['@_lon']} ${trkpt['@_lat']})`,
					recorded_at: trkpt.time ? new Date(trkpt.time) : new Date(),
					altitude: trkpt.ele ? parseFloat(trkpt.ele) : null,
					speed: null,
					activity_type: 'tracking',
					device_id: 'gpx-import',
					tracker_type: 'gpx',
				});

				if (buffer.length === BATCH_SIZE) {
					// Assign country codes in parallel
					buffer = await Promise.all(buffer.map(async (point) => ({
						...point,
						country_code: getCountryForPoint(
							parseFloat(point.location.split(' ')[1].replace(')', '')),
							parseFloat(point.location.split(' ')[0].replace('POINT(', ''))
						)
					})));
					try {
						const { error } = await supabase.from('tracker_data').upsert(buffer, {
							onConflict: 'user_id,location,recorded_at',
							ignoreDuplicates: false
						});
						if (!error) {
							importedCount += buffer.length;
							console.log(`Inserted ${importedCount} GPX points so far...`);
							globalThis.importProgress.set(importId, { current: importedCount, total: totalItems, status: `Processing track points... ${i + 1}/${trackPoints.length}` });
						} else {
							console.error('Error inserting GPX track point batch:', error);
						}
					} catch (batchError) {
						console.error('Exception inserting GPX track point batch:', batchError);
					}
					buffer = [];
				}
			}
			// Insert any remaining points
			if (buffer.length > 0) {
				// Assign country codes in parallel
				buffer = await Promise.all(buffer.map(async (point) => ({
					...point,
					country_code: getCountryForPoint(
						parseFloat(point.location.split(' ')[1].replace(')', '')),
						parseFloat(point.location.split(' ')[0].replace('POINT(', ''))
					)
				})));
				try {
					const { error } = await supabase.from('tracker_data').upsert(buffer, {
						onConflict: 'user_id,location,recorded_at',
						ignoreDuplicates: false
					});
					if (!error) {
						importedCount += buffer.length;
						console.log(`Inserted ${importedCount} GPX points so far...`);
						globalThis.importProgress.set(importId, { current: importedCount, total: totalItems, status: `Processing track points... ${trackPoints.length}/${trackPoints.length}` });
					} else {
						console.error('Error inserting GPX track point batch:', error);
					}
				} catch (batchError) {
					console.error('Exception inserting GPX track point batch:', batchError);
				}
				buffer = [];
			}
			console.log(`✅ Completed track points: ${importedCount} total imported`);
		}

		console.log(`🎉 GPX import completed: ${importedCount} items imported out of ${totalItems} total`);
		return { importedCount, totalItems };
	} catch (error) {
		console.error('GPX import error:', error);
		throw new Error('Invalid GPX format');
	}
}

async function importOwnTracks(content: string, userId: string, supabase: any, importId: string): Promise<number> {
	try {
		console.log('Starting OwnTracks import');
		const lines = content.trim().split('\n');
		let importedCount = 0;

		console.log(`Processing ${lines.length} lines`);

		// Update progress with total items
		globalThis.importProgress.set(importId, { current: 0, total: lines.length, status: 'Processing OwnTracks data...' });

		const BATCH_SIZE = 1000;
		let buffer: any[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!line.trim()) continue;

			// OwnTracks .REC format: timestamp,lat,lon,altitude,accuracy,vertical_accuracy,velocity,heading,pressure
			const parts = line.split(',');
			if (parts.length >= 3) {
				const [timestamp, lat, lon] = parts;
				const latitude = parseFloat(lat);
				const longitude = parseFloat(lon);

				if (!isNaN(latitude) && !isNaN(longitude)) {
					buffer.push({
						user_id: userId,
						location: `POINT(${longitude} ${latitude})`,
						recorded_at: new Date(parseInt(timestamp) * 1000),
						altitude: parts[3] ? parseFloat(parts[3]) : null,
						speed: parts[6] ? parseFloat(parts[6]) : null,
						activity_type: 'tracking',
						device_id: 'owntracks-import',
						tracker_type: 'owntracks',
					});
				}
			}

			// Update progress every 50 lines
			if (i % 50 === 0) {
				globalThis.importProgress.set(importId, { current: importedCount, total: lines.length, status: `Processing OwnTracks data... ${i + 1}/${lines.length}` });
			}

			if (buffer.length === BATCH_SIZE) {
				// Assign country codes in parallel
				buffer = await Promise.all(buffer.map(async (point) => ({
					...point,
					country_code: getCountryForPoint(
						parseFloat(point.location.split(' ')[1].replace(')', '')),
						parseFloat(point.location.split(' ')[0].replace('POINT(', ''))
					)
				})));
				try {
					const { error } = await supabase.from('tracker_data').upsert(buffer, {
						onConflict: 'user_id,location,recorded_at',
						ignoreDuplicates: false
					});
					if (!error) {
						importedCount += buffer.length;
						console.log(`Inserted ${importedCount} OwnTracks points so far...`);
						globalThis.importProgress.set(importId, { current: importedCount, total: lines.length, status: `Processing OwnTracks data... ${i + 1}/${lines.length}` });
					} else {
						console.error('Error inserting OwnTracks batch:', error);
					}
				} catch (batchError) {
					console.error('Exception inserting OwnTracks batch:', batchError);
				}
				buffer = [];
			}
		}
		// Insert any remaining points
		if (buffer.length > 0) {
			// Assign country codes in parallel
			buffer = await Promise.all(buffer.map(async (point) => ({
				...point,
				country_code: getCountryForPoint(
					parseFloat(point.location.split(' ')[1].replace(')', '')),
					parseFloat(point.location.split(' ')[0].replace('POINT(', ''))
				)
			})));
			try {
				const { error } = await supabase.from('tracker_data').upsert(buffer, {
					onConflict: 'user_id,location,recorded_at',
					ignoreDuplicates: false
				});
				if (!error) {
					importedCount += buffer.length;
					console.log(`Inserted ${importedCount} OwnTracks points so far...`);
					globalThis.importProgress.set(importId, { current: importedCount, total: lines.length, status: `Processing OwnTracks data... ${lines.length}/${lines.length}` });
				} else {
					console.error('Error inserting OwnTracks batch:', error);
				}
			} catch (batchError) {
				console.error('Exception inserting OwnTracks batch:', batchError);
			}
			buffer = [];
		}

		console.log(`OwnTracks import completed: ${importedCount} items imported`);
		return importedCount;
	} catch (error) {
		console.error('OwnTracks import error:', error);
		throw new Error('Invalid OwnTracks format');
	}
}