import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

export const POST: RequestHandler = async ({ params, url, request }) => {
	try {
		const { user_id } = params;
		const api_key = url.searchParams.get('api_key');

		if (!user_id || !api_key) {
			return json({ error: 'Missing user_id or api_key parameter' }, { status: 400 });
		}

		// Create Supabase admin client to access user data
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Get user data to validate API key
		const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(user_id);

		if (userError || !user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// Check if the provided API key matches the user's stored API key
		const storedApiKey = user.user_metadata?.owntracks_api_key;
		if (!storedApiKey || storedApiKey !== api_key) {
			return json({ error: 'Invalid API key' }, { status: 401 });
		}

		// Parse the OwnTracks payload
		const payload = await request.json();

		// Validate that it's a valid OwnTracks payload
		if (!payload._type || !['location', 'transition', 'waypoint', 'beacon'].includes(payload._type)) {
			return json({ error: 'Invalid OwnTracks payload' }, { status: 400 });
		}

		// Handle different types of OwnTracks messages
		switch (payload._type) {
			case 'location':
				// Process location data
				if (payload.lat && payload.lon) {
					// TODO: Store location data in your database
					console.log('Received location:', {
						user_id,
						lat: payload.lat,
						lon: payload.lon,
						tst: payload.tst,
						acc: payload.acc,
						alt: payload.alt,
						vel: payload.vel,
						cog: payload.cog,
						batt: payload.batt
					});
				}
				break;

			case 'transition':
				// Process transition data (enter/leave events)
				console.log('Received transition:', {
					user_id,
					event: payload.event,
					desc: payload.desc,
					tst: payload.tst
				});
				break;

			case 'waypoint':
				// Process waypoint data
				console.log('Received waypoint:', {
					user_id,
					desc: payload.desc,
					lat: payload.lat,
					lon: payload.lon,
					tst: payload.tst
				});
				break;

			case 'beacon':
				// Process beacon data
				console.log('Received beacon:', {
					user_id,
					uuid: payload.uuid,
					major: payload.major,
					minor: payload.minor,
					proximity: payload.proximity,
					rssi: payload.rssi
				});
				break;
		}

		// Return success response
		return json({ success: true, message: 'Data received successfully' });

	} catch (error) {
		console.error('Error processing OwnTracks request:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const { user_id } = params;
		const api_key = url.searchParams.get('api_key');

		if (!user_id || !api_key) {
			return json({ error: 'Missing user_id or api_key parameter' }, { status: 400 });
		}

		// Create Supabase admin client to access user data
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Get user data to validate API key
		const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(user_id);

		if (userError || !user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		// Check if the provided API key matches the user's stored API key
		const storedApiKey = user.user_metadata?.owntracks_api_key;
		if (!storedApiKey || storedApiKey !== api_key) {
			return json({ error: 'Invalid API key' }, { status: 401 });
		}

		// Return user's location data (if any)
		// TODO: Implement retrieval of stored location data
		return json({
			success: true,
			message: 'API endpoint is working correctly',
			user_id,
			last_seen: null // TODO: Add actual last seen timestamp
		});

	} catch (error) {
		console.error('Error processing OwnTracks GET request:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};