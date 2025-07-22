import {
  setupRequest,
  authenticateRequest,
  successResponse,
  errorResponse,
  getPathParams,
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
      logInfo('Processing export download request', 'EXPORT-DOWNLOAD', { userId: user.id });

      // Extract job_id from URL path
      const url = req.url;
      const pathParams = getPathParams(url, '/functions/v1/export-download/[job_id]');
      const jobId = pathParams.job_id;

      if (!jobId) {
        return errorResponse('Missing job ID', 400);
      }

      logInfo('Fetching export job', 'EXPORT-DOWNLOAD', { jobId, userId: user.id });

      // Get the export job
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .eq('created_by', user.id)
        .eq('type', 'data_export')
        .single();

      if (jobError || !job) {
        logError(jobError, 'EXPORT-DOWNLOAD');
        return errorResponse('Export job not found', 404);
      }

      if (job.status !== 'completed') {
        return errorResponse('Export not completed', 400);
      }

      // Extract file path from job result
      const jobResult = job.result as Record<string, unknown>;
      const filePath = jobResult?.file_path as string;

      if (!filePath) {
        return errorResponse('Export file not found', 404);
      }

      logInfo('Generating download URL', 'EXPORT-DOWNLOAD', { filePath, jobId });

      // Generate signed URL for download
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('exports')
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (signedUrlError || !signedUrlData?.signedUrl) {
        logError(signedUrlError, 'EXPORT-DOWNLOAD');
        return errorResponse('Failed to generate download link', 500);
      }

      logSuccess('Download URL generated successfully', 'EXPORT-DOWNLOAD', {
        jobId,
        userId: user.id,
        filePath
      });

      return successResponse({
        downloadUrl: signedUrlData.signedUrl,
        fileName: filePath.split('/').pop() || 'export.zip'
      });
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'EXPORT-DOWNLOAD');
    return errorResponse('Internal server error', 500);
  }
});