import type { RequestHandler } from './$types';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { forwardGeocode } from '$lib/services/external/nominatim.service';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const query = url.searchParams.get('q');

		if (!query || query.trim().length === 0) {
			return errorResponse('Query parameter "q" is required', 400);
		}

		if (query.trim().length < 3) {
			return errorResponse('Query must be at least 3 characters long', 400);
		}

		// Search for addresses using forward geocoding
		const results = [];
		const searchResult = await forwardGeocode(query.trim());

		if (searchResult) {
			results.push({
				display_name: searchResult.display_name,
				coordinates: {
					lat: parseFloat(searchResult.lat),
					lng: parseFloat(searchResult.lon)
				},
				lat: parseFloat(searchResult.lat),
				lon: parseFloat(searchResult.lon),
				address: searchResult.address || {}
			});
		}

		// Return the results wrapped in a results property to match frontend expectations
		return successResponse({ results });
	} catch (error) {
		console.error('Geocoding search error:', error);
		return errorResponse(error);
	}
};
