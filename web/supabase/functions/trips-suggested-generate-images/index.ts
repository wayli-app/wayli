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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false
	}
});

// Import functions from trips-suggest-image
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
  logInfo(`Searching Pexels for: ${searchTerm}`, 'TRIPS-SUGGESTED-GENERATE-IMAGES');
  const searchResult = await searchPexelsImages(searchTerm, apiKey);

  if (searchResult && searchResult.photos.length > 0) {
    const photo = searchResult.photos[0];
    logSuccess(`Found Pexels image for: ${searchTerm}`, 'TRIPS-SUGGESTED-GENERATE-IMAGES');

    // Return the Pexels URL directly (no upload to storage)
    return {
      imageUrl: photo.src.large2x,
      attribution: {
        source: 'pexels',
        photographer: photo.photographer,
        photographerUrl: photo.photographer_url,
        pexelsUrl: photo.url
      }
    };
  } else {
    logError(`No Pexels images found for: ${searchTerm}`, 'TRIPS-SUGGESTED-GENERATE-IMAGES');
  }

  // Fallback to placeholder if Pexels search fails
  logError(`No Pexels images found for: ${searchTerm}, using placeholder`, 'TRIPS-SUGGESTED-GENERATE-IMAGES');
  return {
    imageUrl: `https://placehold.co/800x400/3b82f6/ffffff?text=${encodeURIComponent(searchTerm)}`,
    attribution: {
      source: 'placeholder'
    }
  };
}

// Pexels API configuration
const PEXELS_API_KEY = Deno.env.get('PEXELS_API_KEY');

// Helper function to get the best available Pexels API key
async function getPexelsApiKey(supabase: any, userId: string): Promise<string | null> {
  // First try environment variable
  if (PEXELS_API_KEY) {
    logInfo('Using environment PEXELS_API_KEY', 'TRIPS-SUGGESTED-GENERATE-IMAGES');
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
      logError(`Failed to get user preferences: ${error.message}`, 'TRIPS-SUGGESTED-GENERATE-IMAGES');
      return null;
    }

    if (preferences?.pexels_api_key) {
      logInfo('Using user personal Pexels API key', 'TRIPS-SUGGESTED-GENERATE-IMAGES');
      return preferences.pexels_api_key;
    }

    logError('No Pexels API key available', 'TRIPS-SUGGESTED-GENERATE-IMAGES');
    return null;
  } catch (error) {
    logError(`Error getting user preferences: ${error}`, 'TRIPS-SUGGESTED-GENERATE-IMAGES');
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
      logInfo('Generating images for suggested trips', 'TRIPS-SUGGESTED-GENERATE-IMAGES', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);

      // Validate required fields
      const requiredFields = ['suggested_trip_ids'];
      const missingFields = validateRequiredFields(body, requiredFields);

      if (missingFields.length > 0) {
        return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      const suggestedTripIds = body.suggested_trip_ids as string[];

      if (!Array.isArray(suggestedTripIds) || suggestedTripIds.length === 0) {
        return errorResponse('suggested_trip_ids must be a non-empty array', 400);
      }

      // Get the best available Pexels API key
      const apiKey = await getPexelsApiKey(supabase, user.id);
      logInfo(`Pexels API key check:`, 'TRIPS-SUGGESTED-GENERATE-IMAGES', {
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey?.length || 0
      });
      if (!apiKey) {
        return errorResponse('No Pexels API key available. Please configure your API key in preferences.', 400);
      }

      const results: Array<{
        suggested_trip_id: string;
        success: boolean;
        image_url?: string;
        attribution?: {
          source: 'pexels' | 'picsum' | 'placeholder';
          photographer?: string;
          photographerUrl?: string;
          pexelsUrl?: string;
        };
        error?: string;
        trip_title?: string;
        progress?: number;
      }> = [];

      // Process each suggested trip
      for (let i = 0; i < suggestedTripIds.length; i++) {
        const suggestedTripId = suggestedTripIds[i];
        try {
          logInfo(`Processing suggested trip: ${suggestedTripId} (${i + 1}/${suggestedTripIds.length})`, 'TRIPS-SUGGESTED-GENERATE-IMAGES');

          // Get the suggested trip
          const { data: suggestedTrip, error: fetchError } = await supabase
            .from('trips')
            .select('*')
            .eq('id', suggestedTripId)
            .eq('user_id', user.id)
            .eq('status', 'pending')
            .single();

          if (fetchError || !suggestedTrip) {
            logError(fetchError, 'TRIPS-SUGGESTED-GENERATE-IMAGES');
            results.push({
              suggested_trip_id: suggestedTripId,
              success: false,
              error: 'Suggested trip not found',
              trip_title: ''
            });
            continue;
          }

          // Generate image using Pexels API
          logInfo(`Starting image generation for suggested trip: ${suggestedTripId}`, 'TRIPS-SUGGESTED-GENERATE-IMAGES', {
            tripTitle: suggestedTrip.title,
            tripDescription: suggestedTrip.description
          });

          const imageResult = await generateTripImage(suggestedTrip.title, suggestedTrip.description, user.id, apiKey, suggestedTrip.start_date, suggestedTrip.end_date);

          logInfo(`Image generation result for ${suggestedTripId}:`, 'TRIPS-SUGGESTED-GENERATE-IMAGES', {
            hasResult: !!imageResult,
            imageUrl: imageResult?.imageUrl,
            hasAttribution: !!imageResult?.attribution
          });

          if (imageResult) {
            logSuccess(`Image generated successfully for suggested trip: ${suggestedTripId}`, 'TRIPS-SUGGESTED-GENERATE-IMAGES', {
              imageUrl: imageResult.imageUrl
            });

            results.push({
              suggested_trip_id: suggestedTripId,
              success: true,
              image_url: imageResult.imageUrl,
              attribution: imageResult.attribution,
              trip_title: suggestedTrip.title,
              progress: ((i + 1) / suggestedTripIds.length) * 100
            });
          } else {
            logError(`Failed to generate image for suggested trip: ${suggestedTripId}`, 'TRIPS-SUGGESTED-GENERATE-IMAGES');
            results.push({
              suggested_trip_id: suggestedTripId,
              success: false,
              error: 'Failed to generate image',
              trip_title: suggestedTrip.title,
              progress: ((i + 1) / suggestedTripIds.length) * 100
            });
          }
        } catch (error) {
          logError(`Error processing suggested trip ${suggestedTripId}: ${error}`, 'TRIPS-SUGGESTED-GENERATE-IMAGES');
          results.push({
            suggested_trip_id: suggestedTripId,
            success: false,
            error: 'Internal error',
            trip_title: ''
          });
        }
      }

      logSuccess('Image generation completed for suggested trips', 'TRIPS-SUGGESTED-GENERATE-IMAGES', {
        userId: user.id,
        totalProcessed: suggestedTripIds.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      });

      return successResponse({ results });
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'TRIPS-SUGGESTED-GENERATE-IMAGES');
    return errorResponse('Internal server error', 500);
  }
});

async function generateTripImage(
  tripTitle: string,
  tripDescription: string | null,
  userId: string,
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<{
  imageUrl: string;
  attribution?: {
    source: 'pexels' | 'picsum' | 'placeholder';
    photographer?: string;
    photographerUrl?: string;
    pexelsUrl?: string;
  };
} | null> {
  try {
    // Analyze trip locations using tracker data
    const analysis = await analyzeTripLocations(supabase, userId, startDate, endDate);

    logInfo(`Trip analysis result:`, 'TRIPS-SUGGESTED-GENERATE-IMAGES', {
      tripTitle,
      primaryCountry: analysis.primaryCountry,
      primaryCity: analysis.primaryCity,
      allCountries: analysis.allCountries,
      allCities: analysis.allCities
    });

    if (!analysis.primaryCountry && !analysis.primaryCity) {
      logError('No location data found for trip', 'TRIPS-SUGGESTED-GENERATE-IMAGES', {
        tripTitle,
        startDate,
        endDate
      });
      return null;
    }

    // Generate image suggestion using the analysis
    const imageResult = await generateImageSuggestionFromAnalysis(analysis, apiKey);

    if (imageResult) {
      logSuccess(`Image generated successfully for trip`, 'TRIPS-SUGGESTED-GENERATE-IMAGES', {
        imageUrl: imageResult.imageUrl,
        primaryCountry: analysis.primaryCountry,
        primaryCity: analysis.primaryCity
      });

      return imageResult;
    }

    logError('Failed to generate image for trip', 'TRIPS-SUGGESTED-GENERATE-IMAGES');
    return null;
  } catch (error) {
    logError(`Error generating trip image: ${error}`, 'TRIPS-SUGGESTED-GENERATE-IMAGES');
    return null;
  }
}



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
  try {
    logInfo(`Searching Pexels for: ${query}`, 'TRIPS-SUGGESTED-GENERATE-IMAGES');

    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      {
        headers: {
          'Authorization': apiKey
        }
      }
    );

    logInfo(`Pexels API response:`, 'TRIPS-SUGGESTED-GENERATE-IMAGES', {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText
    });

    if (!response.ok) {
      logError(`Pexels API error: ${response.status}`, 'TRIPS-SUGGESTED-GENERATE-IMAGES');
      return null;
    }

    const data = await response.json();
    logInfo(`Pexels API data received:`, 'TRIPS-SUGGESTED-GENERATE-IMAGES', {
      totalResults: data.total_results,
      photosCount: data.photos?.length || 0
    });
    return data;
  } catch (error) {
    logError(`Error searching Pexels: ${error}`, 'TRIPS-SUGGESTED-GENERATE-IMAGES');
    return null;
  }
}

// Note: Removed downloadAndUploadImage function since we now use direct Pexels URLs