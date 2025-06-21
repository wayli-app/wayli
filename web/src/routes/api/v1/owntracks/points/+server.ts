import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import type { TrackerData, OwnTracksPayload } from '$lib/types/database.types';
import type { PostgrestError } from '@supabase/supabase-js';
import { SupabaseClient } from '@supabase/supabase-js';

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

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { user_id, lat, lon, tst, alt, acc, vel, cog, batt, bs, vac, t, tid, inregions } = body;

		// Validate user_id format
		if (!user_id || !isValidUUID(user_id)) {
			return json({ error: 'Forbidden location.' }, { status: 403 });
		}

		// Validate required fields
		if (!lat || !lon || !tst) {
			return json({ error: 'Missing required fields: lat, lon, tst' }, { status: 400 });
		}

		// Validate coordinates
		if (!isValidLatitude(lat)) {
			return json({ error: 'Invalid latitude value' }, { status: 400 });
		}

		if (!isValidLongitude(lon)) {
			return json({ error: 'Invalid longitude value' }, { status: 400 });
		}

		// Create Supabase admin client
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Convert timestamp to ISO string if it's a number
		const recorded_at = typeof tst === 'number' ? new Date(tst * 1000).toISOString() : tst;

		// Create PostGIS point from lat/lon (longitude first, then latitude)
		const location = `POINT(${lon} ${lat})`;

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
			is_charging: bs === 1,
			activity_type: vac || null,
			raw_data: {
				lat,
				lon,
				tst,
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
			return json({ error: 'Failed to store tracking data' }, { status: 500 });
		}

		return json({
			success: true,
			message: 'Tracking data stored successfully'
		});

	} catch (error) {
		console.error('POST tracking data error:', error);
		return json({ error: 'An unexpected error occurred' }, { status: 500 });
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

// This is an example of how you might fetch the latest point for a user
async function getLatestPoint(supabase: SupabaseClient, userId: string) {
	const { data, error } = await supabase
		.from('tracker_data')
		.select('*')
		.eq('user_id', userId)
		.order('recorded_at', { ascending: false })
		.limit(1)
		.single();

	if (error) {
		console.error('Error fetching latest point:', error);
		return null;
	}
	return data;
}