import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createAuthenticatedClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = handleCors(req);
	if (corsResponse) return corsResponse;

	try {
		// Get auth token
		const authHeader = req.headers.get('Authorization');
		if (!authHeader) {
			return new Response(JSON.stringify({ error: 'No authorization header' }), {
				status: 401,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		const token = authHeader.replace('Bearer ', '');
		const supabase = createAuthenticatedClient(token);

		// Verify user is authenticated
		const {
			data: { user },
			error: authError
		} = await supabase.auth.getUser();
		if (authError || !user) {
			return new Response(JSON.stringify({ error: 'Invalid token' }), {
				status: 401,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		// Only allow POST requests
		if (req.method !== 'POST') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), {
				status: 405,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		// Parse request body
		const body = await req.json();
		const { points } = body;

		if (!Array.isArray(points)) {
			return new Response(JSON.stringify({ error: 'Points must be an array' }), {
				status: 400,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		// Process and insert points
		const processedPoints = points.map((point: any) => ({
			user_id: user.id,
			latitude: point.lat,
			longitude: point.lon,
			timestamp: point.tst,
			accuracy: point.acc,
			altitude: point.alt,
			battery: point.batt,
			velocity: point.vel,
			course: point.cog,
			vertical_accuracy: point.vacc,
			horizontal_accuracy: point.hacc,
			activity: point.act,
			raw_data: point
		}));

		const { data: insertedPoints, error: insertError } = await supabase
			.from('owntracks_points')
			.insert(processedPoints)
			.select();

		if (insertError) {
			throw insertError;
		}

		return new Response(
			JSON.stringify({
				message: 'Points inserted successfully',
				count: insertedPoints?.length || 0
			}),
			{
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			}
		);
	} catch (error) {
		console.error('OwnTracks points error:', error);
		return new Response(JSON.stringify({ error: 'Internal server error' }), {
			status: 500,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	}
});
