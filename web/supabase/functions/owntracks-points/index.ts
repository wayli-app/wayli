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

		// Process points and perform reverse geocoding synchronously
		// This ensures data is complete when inserted (takes longer but better data quality)
		const processedPoints = await Promise.all(
			points.map(async (point: any) => {
				let geocodeData = null;
				let countryCode = null;

				// Always fetch reverse geocode from Nominatim for consistency
				try {
					logInfo('Fetching reverse geocode from Nominatim', 'OWNTRACKS_GEOCODE', {
						userId: user.id,
						lat: point.lat,
						lon: point.lon
					});

					geocodeData = await reverseGeocode(point.lat, point.lon);

					if (geocodeData) {
						countryCode = geocodeData.properties?.address?.country_code?.toUpperCase() || null;
						logSuccess('Point geocoded successfully', 'OWNTRACKS_GEOCODE', {
							userId: user.id,
							timestamp: point.tst,
							countryCode
						});
					} else {
						logError(
							`Geocoding returned null for user ${user.id} at lat=${point.lat}, lon=${point.lon}`,
							'OWNTRACKS_GEOCODE'
						);
					}
				} catch (error) {
					// Log the error with full details but continue - we'll insert the point without geocode data
					const errorMsg = error instanceof Error ? error.message : String(error);
					const errorStack = error instanceof Error ? error.stack : '';
					logError(
						`Geocoding failed for user ${user.id} at lat=${point.lat}, lon=${point.lon}: ${errorMsg}\n${errorStack}`,
						'OWNTRACKS_GEOCODE'
					);
				}

				// Return processed point with geocode data (if available)
				return {
					user_id: user.id,
					tracker_type: 'owntracks',
					device_id: point.tid || 'owntracks',
					recorded_at: new Date(point.tst * 1000).toISOString(),
					location: `POINT(${point.lon} ${point.lat})`,
					altitude: point.alt || null,
					accuracy: point.acc || null,
					speed: point.vel || null,
					heading: point.cog || null,
					battery_level: point.batt || null,
					geocode: geocodeData,
					country_code: countryCode
				};
			})
		);

		// Insert points with complete geocode data
		// Use upsert with ignoreDuplicates to handle cases where OwnTracks retries the same point
		// This prevents 500 errors when duplicate timestamps are received
		const { data: insertedPoints, error: insertError } = await supabase
			.from('tracker_data')
			.upsert(processedPoints, { onConflict: 'user_id,recorded_at', ignoreDuplicates: true })
			.select();

		if (insertError) {
			logError(
				`Failed to insert ${processedPoints.length} points for user ${user.id}: [${insertError.code}] ${insertError.message} - ${insertError.details}`,
				'OWNTRACKS_POINTS'
			);
			return errorResponse('Failed to insert points', 500);
		}

		const geocodedCount = processedPoints.filter((p) => p.geocode !== null).length;

		logSuccess('Points inserted successfully', 'OWNTRACKS_POINTS', {
			userId: user.id,
			totalCount: insertedPoints?.length || 0,
			geocodedCount,
			ungeocodedCount: (insertedPoints?.length || 0) - geocodedCount
		});

		return successResponse({
			message: 'Points inserted successfully',
			count: insertedPoints?.length || 0
		});
	} catch (error) {
		logError(error, 'OWNTRACKS_POINTS');
		return errorResponse('Internal server error', 500);
	}
});
