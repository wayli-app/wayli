import {
  setupRequest,
  authenticateRequest,
  successResponse,
  errorResponse,
  parseJsonBody,
  validateRequiredFields,
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
      logInfo('Fetching trips', 'TRIPS', { userId: user.id });

      const url = req.url;
      const params = getQueryParams(url);
      const limit = parseInt(params.get('limit') || '50');
      const offset = parseInt(params.get('offset') || '0');
      const search = params.get('search') || '';

      let query = supabase
        .from('trips')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      // Add search filter if provided
      if (search) {
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
      }

      // Add pagination
      query = query.range(offset, offset + limit - 1);

      const { data: trips, error: tripsError } = await query;

      if (tripsError) {
        logError(tripsError, 'TRIPS');
        return errorResponse('Failed to fetch trips', 500);
      }

      logSuccess('Trips fetched successfully', 'TRIPS', {
        userId: user.id,
        count: trips?.length || 0
      });
      return successResponse(trips || []);
    }

    if (req.method === 'POST') {
      logInfo('Creating new trip', 'TRIPS', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);

      // Validate required fields
      const requiredFields = ['title'];
      const missingFields = validateRequiredFields(body, requiredFields);

      if (missingFields.length > 0) {
        return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      // Create trip
      const { data: newTrip, error: createError } = await supabase
        .from('trips')
        .insert({
          user_id: user.id,
          title: body.title,
          description: body.description || '',
          start_date: body.start_date || null,
          end_date: body.end_date || null,
          status: body.status || 'planned',
          tags: body.tags || [],
          metadata: body.metadata || {}
        })
        .select()
        .single();

      if (createError) {
        logError(createError, 'TRIPS');
        return errorResponse('Failed to create trip', 500);
      }

      logSuccess('Trip created successfully', 'TRIPS', {
        userId: user.id,
        tripId: newTrip.id
      });
      return successResponse(newTrip, 201);
    }

    if (req.method === 'PUT') {
      logInfo('Updating trip', 'TRIPS', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);

      // Validate required fields
      const requiredFields = ['id'];
      const missingFields = validateRequiredFields(body, requiredFields);

      if (missingFields.length > 0) {
        return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      // Verify trip belongs to user
      const { data: existingTrip, error: fetchError } = await supabase
        .from('trips')
        .select('id')
        .eq('id', body.id)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !existingTrip) {
        return errorResponse('Trip not found', 404);
      }

      // Update trip
      const { data: updatedTrip, error: updateError } = await supabase
        .from('trips')
        .update({
          title: body.title,
          description: body.description,
          start_date: body.start_date,
          end_date: body.end_date,
          status: body.status,
          tags: body.tags,
          metadata: body.metadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', body.id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (updateError) {
        logError(updateError, 'TRIPS');
        return errorResponse('Failed to update trip', 500);
      }

      logSuccess('Trip updated successfully', 'TRIPS', {
        userId: user.id,
        tripId: updatedTrip.id
      });
      return successResponse(updatedTrip);
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'TRIPS');
    return errorResponse('Internal server error', 500);
  }
});