import {
  setupRequest,
  authenticateRequest,
  successResponse,
  errorResponse,
  parseJsonBody,
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

    // Only allow POST requests
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405);
    }

    logInfo('Processing OwnTracks points', 'OWNTRACKS_POINTS', { userId: user.id });

    // Parse request body
    const body = await parseJsonBody<Record<string, unknown>>(req);
    const { points } = body;

    if (!Array.isArray(points)) {
      return errorResponse('Points must be an array', 400);
    }

    logInfo('Processing points', 'OWNTRACKS_POINTS', {
      userId: user.id,
      pointCount: points.length
    });

    // Process and insert points
    const processedPoints = points.map((point: any) => ({
      user_id: user.id,
      latitude: point.lat,
      longitude: point.lon,
      timestamp: point.tst,
      accuracy: point.acc,
      altitude: point.alt,
      battery: point.batt,
      velocity: point.vel,
      course: point.cog,
      vertical_accuracy: point.vacc,
      horizontal_accuracy: point.hacc,
      activity: point.act,
      raw_data: point
    }));

    const { data: insertedPoints, error: insertError } = await supabase
      .from('owntracks_points')
      .insert(processedPoints)
      .select();

    if (insertError) {
      logError(insertError, 'OWNTRACKS_POINTS');
      return errorResponse('Failed to insert points', 500);
    }

    logSuccess('Points inserted successfully', 'OWNTRACKS_POINTS', {
      userId: user.id,
      count: insertedPoints?.length || 0
    });

    return successResponse({
      message: 'Points inserted successfully',
      count: insertedPoints?.length || 0
    });
  } catch (error) {
    logError(error, 'OWNTRACKS_POINTS');
    return errorResponse('Internal server error', 500);
  }
});
