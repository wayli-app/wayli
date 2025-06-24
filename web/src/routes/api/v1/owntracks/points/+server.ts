import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

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
			return json({ error: 'Forbidden location.' }, { status: 403 });
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
			return json({ error: 'Missing required fields: lat, lon, tst' }, { status: 400 });
		}

		// Convert string values to numbers for validation
		const latNum = typeof lat === 'string' ? parseFloat(lat) : lat;
		const lonNum = typeof lon === 'string' ? parseFloat(lon) : lon;

		// Validate coordinates
		if (!isValidLatitude(latNum)) {
			console.warn('Invalid latitude value:', latNum);
			return json({ error: 'Invalid latitude value' }, { status: 400 });
		}

		if (!isValidLongitude(lonNum)) {
			console.warn('Invalid longitude value:', lonNum);
			return json({ error: 'Invalid longitude value' }, { status: 400 });
		}

		// Create Supabase admin client
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Convert timestamp to ISO string if it's a number
		const tstNum = typeof tst === 'string' ? parseInt(tst) : tst;
		const recorded_at = typeof tstNum === 'number' ? new Date(tstNum * 1000).toISOString() : tst;

		// Create PostGIS point from lat/lon (longitude first, then latitude)
		const location = `POINT(${lonNum} ${latNum})`;

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
			}
		};

		// Insert tracking data
		const { error } = await supabaseAdmin
			.from('tracker_data')
			.insert(trackingData);

		if (error) {
			console.error('Error inserting tracking data:', error);
			// Return success anyway to prevent OwnTracks from retrying indefinitely
			return json({ success: true, message: 'Location received' });
		}

		// Return simple success response that OwnTracks expects
		return json({ success: true, message: 'Location received' });

	} catch (error) {
		console.error('POST tracking data error:', error);
		// Return success anyway to prevent OwnTracks from retrying indefinitely
		return json({ success: true, message: 'Location received' });
	}
};

export const GET: RequestHandler = async ({ url }) => {
	try {
		const user_id = url.searchParams.get('user_id');

		// Validate user_id format
		if (!user_id || !isValidUUID(user_id)) {
			return json({ error: 'Invalid user_id format' }, { status: 403 });
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
			return json({ error: 'Failed to fetch tracking data' }, { status: 500 });
		}

		return json({
			success: true,
			data: trackingData || []
		});

	} catch (error) {
		console.error('GET tracking data error:', error);
		return json({ error: 'An unexpected error occurred' }, { status: 500 });
	}
};

// Test endpoint to verify PostGIS point creation
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { user_id, lat, lon } = body;

		// Validate user_id format
		if (!user_id || !isValidUUID(user_id)) {
			return json({ error: 'Invalid user_id format' }, { status: 403 });
		}

		// Validate coordinates
		if (!isValidLatitude(lat)) {
			return json({ error: 'Invalid latitude value' }, { status: 400 });
		}

		if (!isValidLongitude(lon)) {
			return json({ error: 'Invalid longitude value' }, { status: 400 });
		}

		// Create PostGIS point from lat/lon (longitude first, then latitude)
		const location = `POINT(${lon} ${lat})`;

		return json({
			success: true,
			message: 'PostGIS point created successfully',
			location,
			coordinates: { lat, lon }
		});

	} catch (error) {
		console.error('PUT test error:', error);
		return json({ error: 'An unexpected error occurred' }, { status: 500 });
	}
};