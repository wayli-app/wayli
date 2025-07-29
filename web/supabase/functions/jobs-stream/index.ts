import {
  setupRequest,
  authenticateRequest,
  errorResponse,
  logError,
  logInfo
} from '../_shared/utils.ts';

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = setupRequest(req);
  if (corsResponse) return corsResponse;

  try {
    const { user, supabase } = await authenticateRequest(req);

    if (req.method === 'GET') {
      logInfo('Starting job stream', 'JOBS-STREAM', { userId: user.id });

      // Set up Server-Sent Events headers
      const headers = new Headers({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      const stream = new ReadableStream({
        start(controller) {
          // Send initial connection message
          controller.enqueue(`data: ${JSON.stringify({ type: 'connected', message: 'Stream connected' })}\n\n`);

          // Set up polling for job updates
          const pollInterval = setInterval(async () => {
            try {
              // Get user's active jobs
              const { data: jobs, error: jobsError } = await supabase
                .from('jobs')
                .select('id, type, status, progress, error, result, updated_at')
                .eq('created_by', user.id)
                				.in('status', ['queued', 'running'])
                .order('updated_at', { ascending: false });

              if (jobsError) {
                logError(jobsError, 'JOBS-STREAM');
                controller.enqueue(`data: ${JSON.stringify({ type: 'error', message: 'Failed to fetch jobs' })}\n\n`);
                return;
              }

              // Send job updates
              if (jobs && jobs.length > 0) {
                controller.enqueue(`data: ${JSON.stringify({ type: 'jobs', jobs })}\n\n`);
              }

              // Check for completed jobs
              const { data: completedJobs, error: completedError } = await supabase
                .from('jobs')
                .select('id, type, status, result, error')
                .eq('created_by', user.id)
                .in('status', ['completed', 'failed'])
                .gte('updated_at', new Date(Date.now() - 60000).toISOString()); // Last minute

              if (completedError) {
                logError(completedError, 'JOBS-STREAM');
              } else if (completedJobs && completedJobs.length > 0) {
                controller.enqueue(`data: ${JSON.stringify({ type: 'completed', jobs: completedJobs })}\n\n`);
              }

            } catch (error) {
              logError(error, 'JOBS-STREAM');
              controller.enqueue(`data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`);
            }
          }, 2000); // Poll every 2 seconds

          // Clean up on close
          req.signal.addEventListener('abort', () => {
            clearInterval(pollInterval);
            controller.close();
            logInfo('Job stream closed', 'JOBS-STREAM', { userId: user.id });
          });
        }
      });

      return new Response(stream, { headers });
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'JOBS-STREAM');
    return errorResponse('Internal server error', 500);
  }
});