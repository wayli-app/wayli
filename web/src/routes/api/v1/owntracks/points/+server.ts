import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/utils/api/response';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { getCountryForPoint } from '$lib/services/external/country-reverse-geocoding.service';
import { reverseGeocode } from '$lib/services/external/nominatim.service';

// UUID validation function
function isValidUUID(uuid: string): boolean {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidRegex.test(uuid);
}

// Coordinate validation function
function isValidCoordinate(value: number): boolean {
	return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

function isValidLatitude(lat: number): boolean {
	return isValidCoordinate(lat) && lat >= -90 && lat <= 90;
}

function isValidLongitude(lon: number): boolean {
	return isValidCoordinate(lon) && lon >= -180 && lon <= 180;
}

export const POST: RequestHandler = async ({ request, url }) => {
	try {
		// Get user_id from query parameters (OwnTracks sends it this way)
		const user_id = url.searchParams.get('user_id');

		// Validate user_id format
		if (!user_id || !isValidUUID(user_id)) {
			console.warn('Invalid user_id format:', user_id);
			return errorResponse('Forbidden location.', 403);
		}

		// Try to get the request body
		let body;
		try {
			body = await request.json();
		} catch {
			// If no JSON body, try to get data from query parameters
			const lat = url.searchParams.get('lat');
			const lon = url.searchParams.get('lon');
			const tst = url.searchParams.get('tst');
			const alt = url.searchParams.get('alt');
			const acc = url.searchParams.get('acc');
			const vel = url.searchParams.get('vel');
			const cog = url.searchParams.get('cog');
			const batt = url.searchParams.get('batt');
			const bs = url.searchParams.get('bs');
			const vac = url.searchParams.get('vac');
			const t = url.searchParams.get('t');
			const tid = url.searchParams.get('tid');
			const inregions = url.searchParams.get('inregions');

			body = { lat, lon, tst, alt, acc, vel, cog, batt, bs, vac, t, tid, inregions };
		}

		const { lat, lon, tst, alt, acc, vel, cog, batt, bs, vac, t, tid, inregions } = body;

		// Validate required fields
		if (!lat || !lon || !tst) {
			console.warn('Missing required fields:', { lat, lon, tst });
			return validationErrorResponse('Missing required fields: lat, lon, tst');
		}

		// Convert string values to numbers for validation
		const latNum = typeof lat === 'string' ? parseFloat(lat) : lat;
		const lonNum = typeof lon === 'string' ? parseFloat(lon) : lon;

		// Validate coordinates
		if (!isValidLatitude(latNum)) {
			console.warn('Invalid latitude value:', latNum);
			return validationErrorResponse('Invalid latitude value');
		}

		if (!isValidLongitude(lonNum)) {
			console.warn('Invalid longitude value:', lonNum);
			return validationErrorResponse('Invalid longitude value');
		}

		// Create Supabase admin client
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Convert timestamp to ISO string if it's a number
		const tstNum = typeof tst === 'string' ? parseInt(tst) : tst;
		const recorded_at = typeof tstNum === 'number' ? new Date(tstNum * 1000).toISOString() : tst;

		// Create PostGIS point from lat/lon (longitude first, then latitude)
		const location = `POINT(${lonNum} ${latNum})`;

		// After latNum and lonNum are parsed:
		const countryCode = getCountryForPoint(latNum, lonNum);

		// --- Reverse geocode the point ---
		let reverseGeocodeResult = null;
		try {
			reverseGeocodeResult = await reverseGeocode(latNum, lonNum);
		} catch (geocodeError) {
			console.error('[OwnTracks] Reverse geocoding failed:', geocodeError);
			// Do not block ingestion if geocoding fails
		}

		// Prepare tracking data
		const trackingData = {
			user_id,
			tracker_type: 'owntracks',
			device_id: tid || 'unknown',
			recorded_at,
			location,
			altitude: alt !== undefined && alt !== null ? Number(alt) : null,
			accuracy: acc !== undefined && acc !== null ? Number(acc) : null,
			speed: vel !== undefined && vel !== null ? Number(vel) : null,
			heading: cog !== undefined && cog !== null ? Number(cog) : null,
			battery_level: batt !== undefined && batt !== null ? Number(batt) : null,
			is_charging: bs === '1' || bs === 1,
			activity_type: vac || null,
			raw_data: {
				lat: latNum,
				lon: lonNum,
				tst: tstNum,
				alt,
				acc,
				vel,
				cog,
				batt,
				bs,
				vac,
				t,
				tid,
				inregions
			},
			country_code: countryCode,
			geocode: reverseGeocodeResult
		};

		// Insert tracking data using upsert to handle duplicates
		const { error } = await supabaseAdmin.from('tracker_data').upsert(trackingData, {
			onConflict: 'user_id,location,recorded_at',
			ignoreDuplicates: false
		});

		if (error) {
			console.error('Error inserting tracking data:', error);
			// Return success anyway to prevent OwnTracks from retrying indefinitely
			return successResponse({ message: 'Location received' });
		}

		// Return simple success response that OwnTracks expects
		return successResponse({ message: 'Location received' });
	} catch (error) {
		console.error('POST tracking data error:', error);
		// Return success anyway to prevent OwnTracks from retrying indefinitely
		return successResponse({ message: 'Location received' });
	}
};

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		// Get current user from session - this ensures authentication
		const session = await locals.getSession();
		if (!session) {
			return errorResponse('User not authenticated', 401);
		}

		const user_id = url.searchParams.get('user_id');

		// Validate user_id format
		if (!user_id || !isValidUUID(user_id)) {
			return errorResponse('Invalid user_id format', 403);
		}

		// Security: Ensure user can only access their own data
		if (user_id !== session.user.id) {
			return errorResponse('Forbidden: Cannot access other user data', 403);
		}

		// Create Supabase admin client
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Get tracking data for the user
		const { data: trackingData, error } = await supabaseAdmin
			.from('tracker_data')
			.select('*')
			.eq('user_id', user_id)
			.eq('tracker_type', 'owntracks')
			.order('recorded_at', { ascending: false })
			.limit(100);

		if (error) {
			console.error('Error fetching tracking data:', error);
			return errorResponse('Failed to fetch tracking data', 500);
		}

		return successResponse({
			data: trackingData || []
		});
	} catch (error) {
		console.error('GET tracking data error:', error);
		return errorResponse('An unexpected error occurred', 500);
	}
};

// Test endpoint to verify PostGIS point creation
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { user_id, lat, lon } = body;

		// Validate user_id format
		if (!user_id || !isValidUUID(user_id)) {
			return errorResponse('Invalid user_id format', 403);
		}

		// Validate coordinates
		if (!isValidLatitude(lat)) {
			return validationErrorResponse('Invalid latitude value');
		}

		if (!isValidLongitude(lon)) {
			return validationErrorResponse('Invalid longitude value');
		}

		// Create PostGIS point
		const location = `POINT(${lon} ${lat})`;

		// Create Supabase admin client
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Test insert
		const { error } = await supabaseAdmin.from('tracker_data').insert({
			user_id,
			tracker_type: 'test',
			device_id: 'test-device',
			recorded_at: new Date().toISOString(),
			location,
			raw_data: { lat, lon }
		});

		if (error) {
			console.error('Error testing PostGIS point creation:', error);
			return errorResponse('Failed to create PostGIS point', 500);
		}

		return successResponse({
			message: 'PostGIS point created successfully',
			location,
			lat,
			lon
		});
	} catch (error) {
		console.error('PUT test endpoint error:', error);
		return errorResponse('An unexpected error occurred', 500);
	}
};
