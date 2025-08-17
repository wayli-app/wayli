import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
	// Handle CORS preflight requests
	if (req.method === 'OPTIONS') {
		return new Response('ok', {
			headers: corsHeaders
		});
	}

	// Return a simple response with CORS headers
	const response = {
		success: true,
		message: 'CORS test successful',
		timestamp: new Date().toISOString()
	};

	return new Response(JSON.stringify(response), {
		status: 200,
		headers: { ...corsHeaders, 'Content-Type': 'application/json' }
	});
});
