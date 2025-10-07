import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
	// Handle CORS preflight requests
	if (req.method === 'OPTIONS') {
		return new Response('ok', {
			headers: corsHeaders
		});
	}

	const checks: Record<string, { status: string; message?: string; duration?: number }> = {};
	let overallStatus = 'healthy';

	// Check 1: Database connectivity
	try {
		const start = performance.now();
		const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
		const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

		if (!supabaseUrl || !supabaseKey) {
			throw new Error('Missing Supabase credentials');
		}

		const supabase = createClient(supabaseUrl, supabaseKey);

		// Simple query to check database connectivity
		const { error } = await supabase
			.from('user_profiles')
			.select('count', { count: 'exact', head: true });

		const duration = performance.now() - start;

		if (error) {
			checks.database = { status: 'unhealthy', message: error.message, duration };
			overallStatus = 'unhealthy';
		} else {
			checks.database = { status: 'healthy', duration };
		}
	} catch (error) {
		checks.database = { status: 'unhealthy', message: error.message };
		overallStatus = 'unhealthy';
	}

	// Check 2: Environment variables
	const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
	const missingVars = requiredEnvVars.filter((v) => !Deno.env.get(v));

	if (missingVars.length > 0) {
		checks.environment = {
			status: 'unhealthy',
			message: `Missing: ${missingVars.join(', ')}`
		};
		overallStatus = 'degraded';
	} else {
		checks.environment = { status: 'healthy' };
	}

	// Check 3: Worker health (check if there's a heartbeat in the last 5 minutes)
	try {
		const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
		const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
		const supabase = createClient(supabaseUrl, supabaseKey);

		const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
		const { data, error } = await supabase
			.from('workers')
			.select('last_heartbeat')
			.gte('last_heartbeat', fiveMinutesAgo)
			.limit(1);

		if (error) {
			checks.workers = { status: 'degraded', message: 'Unable to check worker status' };
		} else if (!data || data.length === 0) {
			checks.workers = { status: 'degraded', message: 'No active workers detected' };
			overallStatus = overallStatus === 'unhealthy' ? 'unhealthy' : 'degraded';
		} else {
			checks.workers = { status: 'healthy' };
		}
	} catch (error) {
		checks.workers = { status: 'degraded', message: error.message };
	}

	const response = {
		success: overallStatus !== 'unhealthy',
		status: overallStatus,
		timestamp: new Date().toISOString(),
		checks
	};

	const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

	return new Response(JSON.stringify(response, null, 2), {
		status: statusCode,
		headers: { ...corsHeaders, 'Content-Type': 'application/json' }
	});
});
