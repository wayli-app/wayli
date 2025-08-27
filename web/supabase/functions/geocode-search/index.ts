import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateRequest, successResponse, errorResponse } from '../_shared/utils.ts';
import { logError } from '../_shared/utils.ts';

const NOMINATIM_ENDPOINT = Deno.env.get('NOMINATIM_ENDPOINT') || 'https://nominatim.wayli.app';

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = handleCors(req);
	if (corsResponse) return corsResponse;

	try {
		// Authenticate the request
		const { user } = await authenticateRequest(req);
		console.log('🔍 [GEOCODE] User authenticated:', user.id);

		// Get query parameters
		const url = new URL(req.url);
		const query = url.searchParams.get('q');
		const limit = url.searchParams.get('limit') || '10';

		if (!query) {
			return errorResponse('Query parameter "q" is required', 400);
		}

		// Call Nominatim API
		const nominatimUrl = new URL('/search', NOMINATIM_ENDPOINT);
		nominatimUrl.searchParams.set('q', query);
		nominatimUrl.searchParams.set('format', 'json');
		nominatimUrl.searchParams.set('limit', limit);
		nominatimUrl.searchParams.set('addressdetails', '1');
		nominatimUrl.searchParams.set('extratags', '1');
		nominatimUrl.searchParams.set('namedetails', '1');

		const response = await fetch(nominatimUrl.toString(), {
			headers: {
				'User-Agent': 'Wayli/1.0 (https://wayli.app)'
			}
		});

		if (!response.ok) {
			throw new Error(`Nominatim API error: ${response.status}`);
		}

		const results = await response.json();

		// Transform results to match expected format
		const transformedResults = results.map((result: any) => ({
			place_id: result.place_id,
			display_name: result.display_name,
			lat: parseFloat(result.lat),
			lon: parseFloat(result.lon),
			coordinates: {
				lat: parseFloat(result.lat),
				lng: parseFloat(result.lon)
			},
			type: result.type,
			importance: result.importance,
			address: result.address || {},
			extratags: result.extratags || {},
			namedetails: result.namedetails || {}
		}));

		// Return in the expected Edge Function response format
		return successResponse(transformedResults);
	} catch (error) {
		logError(error, 'GEOCODE_SEARCH');
		return errorResponse('Internal server error', 500);
	}
});
