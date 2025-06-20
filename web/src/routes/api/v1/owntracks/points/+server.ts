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

		// Create Supabase admin client
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Convert timestamp to ISO string if it's a number
		const timestamp = typeof tst === 'number' ? new Date(tst * 1000).toISOString() : tst;

		// Create PostGIS point from lat/lon
		const location = `POINT(${lon} ${lat})`;

		// Prepare tracking data
		const trackingData = {
			user_id,
			tracker_type: 'owntracks',
			device_id: tid || 'unknown',
			timestamp,
			location,
			altitude: alt || null,
			accuracy: acc || null,
			speed: vel || null,
			heading: cog || null,
			battery_level: batt || null,
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
			.order('timestamp', { ascending: false })
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