// CORS configuration with environment variable support
// SECURITY: In production, set SUPABASE_CORS_ALLOW_ORIGIN to your specific domain(s)
// Example: 'https://yourdomain.com' or comma-separated list
const corsAllowOrigin = Deno.env.get('SUPABASE_CORS_ALLOW_ORIGIN') || '*';
const corsAllowHeaders =
	Deno.env.get('SUPABASE_CORS_ALLOW_HEADERS') ||
	'authorization, x-client-info, apikey, content-type';
const corsAllowMethods =
	Deno.env.get('SUPABASE_CORS_ALLOW_METHODS') || 'GET, POST, PUT, DELETE, OPTIONS';
const corsMaxAge = Deno.env.get('SUPABASE_CORS_MAX_AGE') || '86400';

// Warn if using wildcard CORS in production
if (corsAllowOrigin === '*' && Deno.env.get('DENO_DEPLOYMENT_ID')) {
	console.warn(
		'⚠️ WARNING: CORS is configured to allow all origins (*). This is a security risk in production.'
	);
	console.warn('⚠️ Set SUPABASE_CORS_ALLOW_ORIGIN environment variable to your specific domain.');
}

export const corsHeaders = {
	'Access-Control-Allow-Origin': corsAllowOrigin,
	'Access-Control-Allow-Headers': corsAllowHeaders,
	'Access-Control-Allow-Methods': corsAllowMethods,
	'Access-Control-Max-Age': corsMaxAge
};

export function handleCors(request: Request): Response | null {
	if (request.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders });
	}
	return null;
}
