import {
  setupRequest,
  authenticateRequest,
  successResponse,
  errorResponse,
  parseJsonBody,
  getQueryParams,
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

    if (req.method === 'GET') {
      logInfo('Fetching suggested trips', 'TRIPS-SUGGESTED', { userId: user.id });

      const url = req.url;
      const params = getQueryParams(url);
      const limit = parseInt(params.get('limit') || '10');
      const offset = parseInt(params.get('offset') || '0');

      // Get suggested trips based on tracker data patterns
      const { data: suggestedTrips, error: tripsError } = await supabase
        .from('suggested_trips')
        .select('*')
        .eq('user_id', user.id)

        .range(offset, offset + limit - 1);

      if (tripsError) {
        logError(tripsError, 'TRIPS-SUGGESTED');
        return errorResponse('Failed to fetch suggested trips', 500);
      }

      // Get total count
      const { count: totalCount, error: countError } = await supabase
        .from('suggested_trips')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (countError) {
        logError(countError, 'TRIPS-SUGGESTED');
        return errorResponse('Failed to count suggested trips', 500);
      }

      logSuccess('Suggested trips fetched successfully', 'TRIPS-SUGGESTED', {
        userId: user.id,
        count: suggestedTrips?.length || 0,
        total: totalCount || 0
      });

      return successResponse({
        trips: suggestedTrips || [],
        total: totalCount || 0,
        limit,
        offset
      });
    }

    if (req.method === 'POST') {
      logInfo('Processing suggested trip', 'TRIPS-SUGGESTED', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);
      const suggestedTripId = body.suggested_trip_id;

      if (!suggestedTripId) {
        return errorResponse('Missing suggested trip ID', 400);
      }

      // Get the suggested trip
      const { data: suggestedTrip, error: fetchError } = await supabase
        .from('suggested_trips')
        .select('*')
        .eq('id', suggestedTripId)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !suggestedTrip) {
        logError(fetchError, 'TRIPS-SUGGESTED');
        return errorResponse('Suggested trip not found', 404);
      }

      // Create a new trip from the suggestion
      const { data: newTrip, error: createError } = await supabase
        .from('trips')
        .insert({
          user_id: user.id,
          title: suggestedTrip.title,
          description: suggestedTrip.description || '',
          start_date: suggestedTrip.start_date,
          end_date: suggestedTrip.end_date,
          status: 'planned',
          tags: suggestedTrip.tags || [],
          metadata: {
            ...suggestedTrip.metadata,
            suggested_from: suggestedTrip.id
          }
        })
        .select()
        .single();

      if (createError) {
        logError(createError, 'TRIPS-SUGGESTED');
        return errorResponse('Failed to create trip from suggestion', 500);
      }

      // Mark the suggestion as processed
      const { error: updateError } = await supabase
        .from('suggested_trips')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          created_trip_id: newTrip.id
        })
        .eq('id', suggestedTripId);

      if (updateError) {
        logError(updateError, 'TRIPS-SUGGESTED');
        // Don't fail the request, just log the error
      }

      logSuccess('Trip created from suggestion successfully', 'TRIPS-SUGGESTED', {
        userId: user.id,
        suggestedTripId,
        newTripId: newTrip.id
      });

      return successResponse(newTrip);
    }

    if (req.method === 'DELETE') {
      logInfo('Clearing all suggested trips', 'TRIPS-SUGGESTED', { userId: user.id });

      // Delete all suggested trips for the user
      const { error: deleteError } = await supabase
        .from('suggested_trips')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        logError(deleteError, 'TRIPS-SUGGESTED');
        return errorResponse('Failed to clear suggested trips', 500);
      }

      logSuccess('All suggested trips cleared successfully', 'TRIPS-SUGGESTED', {
        userId: user.id
      });

      return successResponse({ message: 'All suggested trips cleared successfully' });
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'TRIPS-SUGGESTED');
    return errorResponse('Internal server error', 500);
  }
});