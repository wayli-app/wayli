import {
  setupRequest,
  authenticateRequest,
  successResponse,
  errorResponse,
  parseJsonBody,
  validateRequiredFields,
  logError,
  logInfo,
  logSuccess
} from '../_shared/utils.ts';

// Pexels API configuration
const PEXELS_API_KEY = Deno.env.get('PEXELS_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Helper function to get the best available Pexels API key
async function getPexelsApiKey(supabase: any, userId: string): Promise<string | null> {
  // First try environment variable
  if (PEXELS_API_KEY) {
    logInfo('Using environment PEXELS_API_KEY', 'TRIPS-SUGGEST-IMAGE');
    return PEXELS_API_KEY;
  }

  // Fallback to user's personal API key
  try {
    const { data: preferences, error } = await supabase
      .from('user_preferences')
      .select('pexels_api_key')
      .eq('user_id', userId)
      .single();

    if (error) {
      logError(`Failed to get user preferences: ${error.message}`, 'TRIPS-SUGGEST-IMAGE');
      return null;
    }

    if (preferences?.pexels_api_key) {
      logInfo('Using user personal Pexels API key', 'TRIPS-SUGGEST-IMAGE');
      return preferences.pexels_api_key;
    }

    logError('No Pexels API key available', 'TRIPS-SUGGEST-IMAGE');
    return null;
  } catch (error) {
    logError(`Error getting user preferences: ${error}`, 'TRIPS-SUGGEST-IMAGE');
    return null;
  }
}

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = setupRequest(req);
  if (corsResponse) return corsResponse;

  try {
    const { user, supabase } = await authenticateRequest(req);

    if (req.method === 'POST') {
      logInfo('Suggesting trip image', 'TRIPS-SUGGEST-IMAGE', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);

      // Check if this is a new trip suggestion (based on date range) or existing trip
      const tripId = body.trip_id as string;
      const startDate = body.start_date as string;
      const endDate = body.end_date as string;

      if (tripId && tripId !== 'temp') {
        // Existing trip image suggestion
        logInfo('Suggesting image for existing trip', 'TRIPS-SUGGEST-IMAGE', { tripId });

        // Validate required fields
        const requiredFields = ['trip_id'];
        const missingFields = validateRequiredFields(body, requiredFields);

        if (missingFields.length > 0) {
          return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
        }

        // Verify trip ownership
        const { data: trip, error: tripError } = await supabase
          .from('trips')
          .select('id, title, description, start_date, end_date, locations')
          .eq('id', tripId)
          .eq('user_id', user.id)
          .single();

        if (tripError || !trip) {
          logError(tripError, 'TRIPS-SUGGEST-IMAGE');
          return errorResponse('Trip not found', 404);
        }

        // Generate image suggestions based on trip data
        const suggestions = await generateImageSuggestions(trip);

        logSuccess('Image suggestions generated successfully', 'TRIPS-SUGGEST-IMAGE', {
          userId: user.id,
          tripId,
          suggestionCount: suggestions.length
        });

        return successResponse({
          trip_id: tripId,
          suggestions,
          message: 'Image suggestions generated successfully'
        });
      } else if (startDate && endDate) {
        // New trip image suggestion based on date range
        logInfo('Suggesting image for new trip based on date range', 'TRIPS-SUGGEST-IMAGE', {
          userId: user.id,
          startDate,
          endDate
        });

        // Analyze user's travel data for the date range
        const analysis = await analyzeTripLocations(supabase, user.id, startDate, endDate);

        if (!analysis.primaryCountry) {
          return errorResponse('No travel data found for the specified date range', 404);
        }

        // Get the best available Pexels API key
        const apiKey = await getPexelsApiKey(supabase, user.id);
        if (!apiKey) {
          return errorResponse('No Pexels API key available. Please configure your API key in preferences.', 400);
        }

        // Generate image suggestion based on analysis
        const suggestion = await generateImageSuggestionFromAnalysis(analysis, apiKey);

        logSuccess('Image suggestion generated for new trip', 'TRIPS-SUGGEST-IMAGE', {
          userId: user.id,
          primaryCountry: analysis.primaryCountry,
          primaryCity: analysis.primaryCity
        });

        return successResponse({
          suggestedImageUrl: suggestion.imageUrl,
          attribution: suggestion.attribution,
          analysis: analysis,
          message: 'Image suggestion generated successfully'
        });
      } else {
        return errorResponse('Either trip_id or start_date/end_date must be provided', 400);
      }
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'TRIPS-SUGGEST-IMAGE');
    return errorResponse('Internal server error', 500);
  }
});

// Helper function to analyze trip locations for a date range
async function analyzeTripLocations(
  supabase: any,
  userId: string,
  startDate: string,
  endDate: string
): Promise<{
  primaryCountry: string;
  primaryCity?: string;
  allCountries: string[];
  allCities: string[];
  countryStats: Record<string, number>;
  cityStats: Record<string, number>;
}> {
  // Fetch tracker data for the date range
  const { data: trackerData, error } = await supabase
    .from('tracker_data')
    .select('country_code, geocode, recorded_at')
    .eq('user_id', userId)
    .gte('recorded_at', `${startDate}T00:00:00Z`)
    .lte('recorded_at', `${endDate}T23:59:59Z`)
    .not('country_code', 'is', null)
    .order('recorded_at', { ascending: true });

  if (error || !trackerData || trackerData.length === 0) {
    return {
      primaryCountry: '',
      primaryCity: undefined,
      allCountries: [],
      allCities: [],
      countryStats: {},
      cityStats: {}
    };
  }

  // Count countries and cities
  const countryStats: Record<string, number> = {};
  const cityStats: Record<string, number> = {};
  const allCountries = new Set<string>();
  const allCities = new Set<string>();

  trackerData.forEach((point: any) => {
    // Count countries
    if (point.country_code) {
      const country = point.country_code.toUpperCase();
      countryStats[country] = (countryStats[country] || 0) + 1;
      allCountries.add(country);
    }

    // Count cities from geocode data
    if (point.geocode) {
      try {
        const geocode = typeof point.geocode === 'string' ? JSON.parse(point.geocode) : point.geocode;

        if (geocode && geocode.address) {
          const city = geocode.address.city ||
            geocode.address.town ||
            geocode.address.village ||
            geocode.address.suburb ||
            geocode.address.neighbourhood;

          if (city) {
            const cityKey = city.toLowerCase().trim();
            cityStats[cityKey] = (cityStats[cityKey] || 0) + 1;
            allCities.add(city);
          }
        }
      } catch (parseError) {
        // Ignore geocode parsing errors
        console.warn('Failed to parse geocode data:', parseError);
      }
    }
  });

  // Find primary country (most visited)
  const primaryCountry = Object.keys(countryStats).reduce(
    (a, b) => (countryStats[a] > countryStats[b] ? a : b),
    ''
  );

  // Find primary city (most visited)
  const primaryCity = Object.keys(cityStats).reduce(
    (a, b) => (cityStats[a] > cityStats[b] ? a : b),
    ''
  );

  return {
    primaryCountry,
    primaryCity: primaryCity || undefined,
    allCountries: Array.from(allCountries),
    allCities: Array.from(allCities),
    countryStats,
    cityStats
  };
}

// Helper function to generate image suggestion from analysis
async function generateImageSuggestionFromAnalysis(analysis: any, apiKey: string): Promise<{
  imageUrl: string;
  attribution?: {
    source: 'pexels' | 'picsum' | 'placeholder';
    photographer?: string;
    photographerUrl?: string;
    pexelsUrl?: string;
  };
}> {
  // Create a more specific search term for better results
  let searchTerm = 'travel landscape';

  if (analysis.primaryCity) {
    searchTerm = `${analysis.primaryCity} city landscape`;
  } else if (analysis.primaryCountry) {
    searchTerm = `${analysis.primaryCountry} travel landscape`;
  }

  // Search for images on Pexels
  logInfo(`Searching Pexels for: ${searchTerm}`, 'TRIPS-SUGGEST-IMAGE');
  const searchResult = await searchPexelsImages(searchTerm, apiKey);

  if (searchResult && searchResult.photos.length > 0) {
    const photo = searchResult.photos[0];
    logSuccess(`Found Pexels image for: ${searchTerm}`, 'TRIPS-SUGGEST-IMAGE');

    // Return the Pexels URL directly (no upload to storage)
    return {
      imageUrl: photo.src.large,
      attribution: {
        source: 'pexels',
        photographer: photo.photographer,
        photographerUrl: photo.photographer_url,
        pexelsUrl: photo.url
      }
    };
  } else {
    logError(`No Pexels images found for: ${searchTerm}`, 'TRIPS-SUGGEST-IMAGE');
  }

  // Fallback to placeholder if Pexels search fails
  logError(`No Pexels images found for: ${searchTerm}, using placeholder`, 'TRIPS-SUGGEST-IMAGE');
  return {
    imageUrl: `https://placehold.co/800x400/3b82f6/ffffff?text=${encodeURIComponent(searchTerm)}`,
    attribution: {
      source: 'placeholder'
    }
  };
}

// Helper function to generate image suggestions
async function generateImageSuggestions(trip: Record<string, unknown>): Promise<Array<{
  prompt: string;
  style: string;
  reasoning: string;
}>> {
  const title = String(trip.title || '');
  const description = String(trip.description || '');
  const startDate = String(trip.start_date || '');
  const endDate = String(trip.end_date || '');

  // Extract location information if available
  const locations = trip.locations as Array<Record<string, unknown>> || [];
  const locationNames = locations
    .map(loc => String(loc.name || loc.display_name || ''))
    .filter(name => name.length > 0)
    .slice(0, 3); // Take first 3 locations

  // Generate suggestions based on trip data
  const suggestions = [];

  // Suggestion 1: Based on trip title and description
  if (title || description) {
    suggestions.push({
      prompt: `${title} ${description}`.trim(),
      style: 'photorealistic',
      reasoning: 'Based on trip title and description'
    });
  }

  // Suggestion 2: Based on locations
  if (locationNames.length > 0) {
    suggestions.push({
      prompt: `${locationNames.join(', ')} travel destination`,
      style: 'landscape',
      reasoning: `Based on trip locations: ${locationNames.join(', ')}`
    });
  }

  // Suggestion 3: Based on time period
  if (startDate && endDate) {
    const start = new Date(startDate);
    const month = start.toLocaleString('default', { month: 'long' });

    suggestions.push({
      prompt: `${month} travel adventure`,
      style: 'artistic',
      reasoning: `Based on trip timing in ${month}`
    });
  }

  // Suggestion 4: Generic travel suggestion
  suggestions.push({
    prompt: 'travel adventure journey',
    style: 'minimalist',
    reasoning: 'Generic travel theme'
  });

  return suggestions;
}

/**
 * Search for images on Pexels
 */
async function searchPexelsImages(query: string, apiKey: string): Promise<{
  total_results: number;
  page: number;
  per_page: number;
  photos: Array<{
    id: number;
    width: number;
    height: number;
    url: string;
    photographer: string;
    photographer_url: string;
    photographer_id: number;
    avg_color: string;
    src: {
      original: string;
      large2x: string;
      large: string;
      medium: string;
      small: string;
      portrait: string;
      landscape: string;
      tiny: string;
    };
    liked: boolean;
    alt: string;
  }>;
} | null> {
  if (!apiKey) {
    logError('No Pexels API key provided', 'TRIPS-SUGGEST-IMAGE');
    return null;
  }

  logInfo(`Searching Pexels with API key: ${apiKey.substring(0, 10)}...`, 'TRIPS-SUGGEST-IMAGE');

  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('page', '1');
  url.searchParams.set('per_page', '1');
  url.searchParams.set('orientation', 'landscape');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: apiKey,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    logError(`Pexels API error: ${response.status} ${response.statusText}`, 'TRIPS-SUGGEST-IMAGE');
    return null;
  }

  const data = await response.json();
  logInfo(`Pexels API response: ${data.total_results} results found`, 'TRIPS-SUGGEST-IMAGE');
  return data;
}

