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
      results.push(searchResult);
    }

    // Try a few variations to get more results
    const variations = [
      query.trim(),
      `${query.trim()}, `,
      `${query.trim()} street`,
      `${query.trim()} road`
    ];

    for (const variation of variations.slice(1)) { // Skip the first one as we already tried it
      try {
        const result = await forwardGeocode(variation);
        if (result && !results.some(r => r.display_name === result.display_name)) {
          results.push(result);
        }
        if (results.length >= 5) break; // Limit to 5 results
      } catch {
        // Continue with next variation if this one fails
        continue;
      }
    }

    return successResponse({
      results,
      query: query.trim()
    });

  } catch (error) {
    console.error('Geocoding search error:', error);
    return errorResponse(error);
  }
};