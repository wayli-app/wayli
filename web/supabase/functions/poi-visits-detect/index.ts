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
      logInfo('Detecting POI visits', 'POI-VISITS-DETECT', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);

      // Validate required fields
      const requiredFields = ['start_date', 'end_date'];
      const missingFields = validateRequiredFields(body, requiredFields);

      if (missingFields.length > 0) {
        return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      const startDate = String(body.start_date);
      const endDate = String(body.end_date);

      // Create POI detection job
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          created_by: user.id,
          type: 'poi_detection',
          			status: 'queued',
          data: {
            start_date: startDate,
            end_date: endDate,
            radius: body.radius || 300, // meters
            min_duration: body.min_duration || 3600, // seconds
            min_interval: body.min_interval || 3600 // seconds between visits
          },
          progress: 0
        })
        .select()
        .single();

      if (jobError) {
        logError(jobError, 'POI-VISITS-DETECT');
        return errorResponse('Failed to create POI detection job', 500);
      }

      logSuccess('POI detection job created successfully', 'POI-VISITS-DETECT', {
        userId: user.id,
        jobId: job.id,
        startDate,
        endDate
      });

      return successResponse({
        job_id: job.id,
        status: job.status,
        message: 'POI detection job created successfully'
      });
    }

    if (req.method === 'GET') {
      logInfo('Fetching POI visits', 'POI-VISITS-DETECT', { userId: user.id });

      // Get POI visits for the user
      const { data: visits, error: visitsError } = await supabase
        .from('poi_visits')
        .select('*')
        .eq('user_id', user.id)
        .order('visit_start', { ascending: false });

      if (visitsError) {
        logError(visitsError, 'POI-VISITS-DETECT');
        return errorResponse('Failed to fetch POI visits', 500);
      }

      logSuccess('POI visits fetched successfully', 'POI-VISITS-DETECT', {
        userId: user.id,
        count: visits?.length || 0
      });

      return successResponse(visits || []);
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'POI-VISITS-DETECT');
    return errorResponse('Internal server error', 500);
  }
});