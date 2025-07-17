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

		// Handle different HTTP methods
		if (req.method === 'GET') {
			// Get all jobs for the user
			const { data: jobs, error: jobsError } = await supabase
				.from('jobs')
				.select('*')
				.eq('user_id', user.id)
				.order('created_at', { ascending: false });

			if (jobsError) {
				throw jobsError;
			}

			return new Response(JSON.stringify(jobs || []), {
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		if (req.method === 'POST') {
			// Create a new job
			const body = await req.json();
			const { type, data } = body;

			if (!type) {
				return new Response(JSON.stringify({ error: 'Job type is required' }), {
					status: 400,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			}

			const { data: job, error: jobError } = await supabase
				.from('jobs')
				.insert({
					user_id: user.id,
					type,
					status: 'pending',
					data: data || {}
				})
				.select()
				.single();

			if (jobError) {
				throw jobError;
			}

			return new Response(JSON.stringify(job), {
				status: 201,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		return new Response(JSON.stringify({ error: 'Method not allowed' }), {
			status: 405,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Jobs error:', error);
		return new Response(JSON.stringify({ error: 'Internal server error' }), {
			status: 500,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	}
});
