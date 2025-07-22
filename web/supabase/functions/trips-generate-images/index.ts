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
      logInfo('Generating trip images', 'TRIPS-GENERATE-IMAGES', { userId: user.id });

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
        .select('id, title, description')
        .eq('id', tripId)
        .eq('user_id', user.id)
        .single();

      if (tripError || !trip) {
        logError(tripError, 'TRIPS-GENERATE-IMAGES');
        return errorResponse('Trip not found', 404);
      }

      // Create image generation job
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          created_by: user.id,
          type: 'image_generation',
          status: 'pending',
          data: {
            trip_id: tripId,
            trip_title: trip.title,
            trip_description: trip.description,
            style: body.style || 'default',
            count: body.count || 1
          },
          progress: 0
        })
        .select()
        .single();

      if (jobError) {
        logError(jobError, 'TRIPS-GENERATE-IMAGES');
        return errorResponse('Failed to create image generation job', 500);
      }

      logSuccess('Image generation job created successfully', 'TRIPS-GENERATE-IMAGES', {
        userId: user.id,
        tripId,
        jobId: job.id
      });

      return successResponse({
        job_id: job.id,
        status: job.status,
        message: 'Image generation job created successfully'
      });
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'TRIPS-GENERATE-IMAGES');
    return errorResponse('Internal server error', 500);
  }
});