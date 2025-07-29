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

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = setupRequest(req);
  if (corsResponse) return corsResponse;

  try {
    const { user, supabase } = await authenticateRequest(req);

    if (req.method === 'POST') {
      logInfo('Suggesting trip image', 'TRIPS-SUGGEST-IMAGE', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);

      // Validate required fields
      const requiredFields = ['trip_id'];
      const missingFields = validateRequiredFields(body, requiredFields);

      if (missingFields.length > 0) {
        return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      const tripId = String(body.trip_id);

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
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'TRIPS-SUGGEST-IMAGE');
    return errorResponse('Internal server error', 500);
  }
});

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
    const end = new Date(endDate);
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