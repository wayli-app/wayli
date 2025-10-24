import {
	setupRequest,
	authenticateRequest,
	authenticateRequestWithApiKey,
	successResponse,
	errorResponse,
	parseJsonBody,
	logError,
	logInfo,
	logSuccess
} from '../_shared/utils.ts';

const NOMINATIM_ENDPOINT = Deno.env.get('NOMINATIM_ENDPOINT') || 'https://nominatim.openstreetmap.org';

// Helper function to perform reverse geocoding
async function reverseGeocode(lat: number, lon: number): Promise<any | null> {
	try {
		const nominatimUrl = new URL('/reverse', NOMINATIM_ENDPOINT);
		nominatimUrl.searchParams.set('lat', lat.toString());
		nominatimUrl.searchParams.set('lon', lon.toString());
		nominatimUrl.searchParams.set('format', 'jsonv2');
		nominatimUrl.searchParams.set('addressdetails', '1');
		nominatimUrl.searchParams.set('extratags', '1');
		nominatimUrl.searchParams.set('namedetails', '1');

		const response = await fetch(nominatimUrl.toString(), {
			headers: {
				'User-Agent': 'Wayli/1.0 (https://wayli.app)'
			}
		});

		if (!response.ok) {
			logError(`Nominatim API error: ${response.status}`, 'OWNTRACKS_REVERSE_GEOCODE');
			return null;
		}

		const result = await response.json();

		// Return geocode data in the format expected by tracker_data.geocode column
		return {
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: [lon, lat]
			},
			properties: {
				place_id: result.place_id,
				osm_type: result.osm_type,
				osm_id: result.osm_id,
				type: result.type,
				class: result.class,
				addresstype: result.addresstype,
				display_name: result.display_name,
				name: result.name,
				address: result.address || {},
				extratags: result.extratags || {},
				namedetails: result.namedetails || {},
				geocoded_at: new Date().toISOString(),
				geocoding_provider: 'nominatim'
			}
		};
	} catch (error) {
		logError(error, 'OWNTRACKS_REVERSE_GEOCODE');
		return null;
	}
}

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = setupRequest(req);
	if (corsResponse) return corsResponse;

	try {
		// This endpoint uses API key authentication instead of JWT
		// We check for query parameters first to allow OwnTracks devices to connect
		// without JWT tokens (which would normally be enforced by Supabase)
		const url = new URL(req.url);
		const apiKey = url.searchParams.get('api_key');
		const userId = url.searchParams.get('user_id');

		if (!userId || !apiKey) {
			logError('Missing api_key or user_id in query parameters', 'OWNTRACKS_POINTS');
			return errorResponse('api_key and user_id required in query parameters', 400);
		}

		// Validate UUID format for user ID
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		if (!uuidRegex.test(userId)) {
			logError('Invalid user ID format', 'OWNTRACKS_POINTS');
			return errorResponse('Invalid user ID format', 400);
		}

		// Create service role client to verify API key and insert data
		const supabaseUrl = Deno.env.get('SUPABASE_URL');
		const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

		if (!supabaseUrl || !supabaseServiceKey) {
			logError('Missing environment variables', 'OWNTRACKS_POINTS');
			return errorResponse('Server configuration error', 500);
		}

		const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.39.0');
		const supabase = createClient(supabaseUrl, supabaseServiceKey, {
			auth: { autoRefreshToken: false, persistSession: false }
		});

		// Verify API key by checking user metadata
		// The API key is stored in user_metadata.owntracks_api_key
		const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);

		if (userError || !userData.user) {
			logError('User not found', 'OWNTRACKS_POINTS', { userId });
			return errorResponse('Invalid user ID', 401);
		}

		const storedApiKey = userData.user.user_metadata?.owntracks_api_key;
		if (!storedApiKey || storedApiKey !== apiKey) {
			logError('Invalid API key', 'OWNTRACKS_POINTS', { userId });
			return errorResponse('Invalid or inactive API key', 401);
		}

		const user = { id: userId };
		logInfo('API key authentication successful', 'OWNTRACKS_POINTS', { userId });

		// Only allow POST requests (OwnTracks sends location data in POST body)
		if (req.method !== 'POST') {
			return errorResponse('Method not allowed', 405);
		}

		logInfo('Processing OwnTracks points', 'OWNTRACKS_POINTS', { userId: user.id });

		// Parse request body for location data
		const body = await parseJsonBody<Record<string, unknown>>(req);

		// Handle both single location objects and arrays of points
		// OwnTracks sends single location objects, but we also support batch imports
		let points: any[];
		if (body._type === 'location') {
			// Single OwnTracks location object
			points = [body];
		} else if (Array.isArray(body.points)) {
			// Array of points (for batch import)
			points = body.points;
		} else if (Array.isArray(body)) {
			// Direct array of points
			points = body;
		} else {
			points = [];
		}

		if (!Array.isArray(points) || points.length === 0) {
			logError('No valid points data found', 'OWNTRACKS_POINTS');
			return errorResponse('No valid points data found', 400);
		}

		logInfo('Processing points', 'OWNTRACKS_POINTS', {
			userId: user.id,
			pointCount: points.length
		});

		// Process and insert points
		// Map OwnTracks fields to tracker_data schema
		const processedPoints = points.map((point: any) => ({
			user_id: user.id,
			tracker_type: 'owntracks',
			device_id: point.tid || 'owntracks', // Use OwnTracks tracker ID if available
			recorded_at: new Date(point.tst * 1000).toISOString(), // Convert Unix timestamp to ISO string
			location: `POINT(${point.lon} ${point.lat})`, // PostGIS point format
			altitude: point.alt || null,
			accuracy: point.acc || null,
			speed: point.vel || null,
			heading: point.cog || null,
			battery_level: point.batt || null
			// Note: activity_type, distance, time_spent, geocode, etc. are not provided by OwnTracks
			// and will be calculated/filled by other processes
		}));

		const { data: insertedPoints, error: insertError } = await supabase
			.from('tracker_data')
			.insert(processedPoints)
			.select();

		if (insertError) {
			logError(insertError, 'OWNTRACKS_POINTS');
			return errorResponse('Failed to insert points', 500);
		}

		logSuccess('Points inserted successfully', 'OWNTRACKS_POINTS', {
			userId: user.id,
			count: insertedPoints?.length || 0
		});

		// Perform reverse geocoding for each inserted point in the background
		// This doesn't block the response but enriches the data immediately
		if (insertedPoints && insertedPoints.length > 0) {
			// Don't await this - let it run in background
			Promise.all(
				insertedPoints.map(async (insertedPoint: any) => {
					const point = points.find((p) => p.tst === insertedPoint.recorded_at);
					if (!point) return;

					try {
						const geocodeData = await reverseGeocode(point.lat, point.lon);
						if (geocodeData) {
							// Extract country code from geocode data
							const countryCode = geocodeData.properties?.address?.country_code?.toUpperCase();

							// Update the tracker_data record with geocode data
							await supabase
								.from('tracker_data')
								.update({
									geocode: geocodeData,
									country_code: countryCode || null
								})
								.eq('user_id', user.id)
								.eq('recorded_at', insertedPoint.recorded_at);

							logInfo('Point geocoded successfully', 'OWNTRACKS_GEOCODE', {
								userId: user.id,
								recordedAt: insertedPoint.recorded_at
							});
						}
					} catch (error) {
						// Log but don't fail - geocoding is best effort
						logError(error, 'OWNTRACKS_GEOCODE');
					}
				})
			).catch((error) => {
				logError(error, 'OWNTRACKS_GEOCODE_BATCH');
			});
		}

		return successResponse({
			message: 'Points inserted successfully',
			count: insertedPoints?.length || 0
		});
	} catch (error) {
		logError(error, 'OWNTRACKS_POINTS');
		return errorResponse('Internal server error', 500);
	}
});
