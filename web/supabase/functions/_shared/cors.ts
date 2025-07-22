export const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Max-Age': '86400'
};

export function handleCors(request: Request): Response | null {
	if (request.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders });
	}
	return null;
}
