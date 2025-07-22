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
      logInfo('Fetching export jobs', 'EXPORT', { userId: user.id });

      const url = req.url;
      const params = getQueryParams(url);
      const limit = parseInt(params.get('limit') || '50');
      const offset = parseInt(params.get('offset') || '0');

      const { data: jobs, error: jobsError } = await supabase
        .from('jobs')
        .select('*')
        .eq('created_by', user.id)
        .eq('type', 'data_export')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (jobsError) {
        logError(jobsError, 'EXPORT');
        return errorResponse('Failed to fetch export jobs', 500);
      }

      logSuccess('Export jobs fetched successfully', 'EXPORT', {
        userId: user.id,
        count: jobs?.length || 0
      });
      return successResponse(jobs || []);
    }

    if (req.method === 'POST') {
      logInfo('Creating export job', 'EXPORT', { userId: user.id });

      const body = await parseJsonBody<Record<string, unknown>>(req);

      // Validate required fields
      const requiredFields = ['format'];
      const missingFields = validateRequiredFields(body, requiredFields);

      if (missingFields.length > 0) {
        return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      // Create export job
      const jobData = {
        format: body.format,
        includeLocationData: body.includeLocationData ?? true,
        includeTripInfo: body.includeTripInfo ?? true,
        includeWantToVisit: body.includeWantToVisit ?? true,
        includeTrips: body.includeTrips ?? true,
        dateRange: body.dateRange || 'All Time',
        startDate: body.startDate || null,
        endDate: body.endDate || null
      };

      const { data: newJob, error: createError } = await supabase
        .from('jobs')
        .insert({
          created_by: user.id,
          type: 'data_export',
          status: 'pending',
          data: jobData,
          progress: 0
        })
        .select()
        .single();

      if (createError) {
        logError(createError, 'EXPORT');
        return errorResponse('Failed to create export job', 500);
      }

      logSuccess('Export job created successfully', 'EXPORT', {
        userId: user.id,
        jobId: newJob.id
      });
      return successResponse(newJob, 201);
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'EXPORT');
    return errorResponse('Internal server error', 500);
  }
});