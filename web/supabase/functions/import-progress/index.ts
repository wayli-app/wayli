import {
  setupRequest,
  authenticateRequest,
  successResponse,
  errorResponse,
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

    // Only allow GET requests
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405);
    }

    // Get query parameters
    const url = req.url;
    const params = getQueryParams(url);
    const jobId = params.get('job_id');

    if (!jobId) {
      return errorResponse('Job ID is required', 400);
    }

    // Get job progress
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .eq('created_by', user.id)
      .single();

    if (jobError) {
      if (jobError.code === 'PGRST116') {
        return errorResponse('Job not found', 404);
      }
      logError(jobError, 'IMPORT_PROGRESS');
      return errorResponse('Failed to fetch job progress', 500);
    }

    return successResponse({
      job_id: job.id,
      status: job.status,
      progress: job.progress || 0,
      result: job.result,
      error: job.error,
      created_at: job.created_at,
      updated_at: job.updated_at
    });
  } catch (error) {
    logError(error, 'IMPORT_PROGRESS');
    return errorResponse('Internal server error', 500);
  }
});
