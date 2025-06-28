import type { RequestHandler } from './$types';
import { JobQueueService } from '$lib/services/queue/job-queue.service.server';

export const GET: RequestHandler = async ({ locals, setHeaders }) => {
  try {
    const session = await locals.getSession();
    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Set SSE headers
    setHeaders({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*', // TODO: Remove this. Only for development.
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        const sendEvent = (data: Record<string, unknown>) => {
          if (closed) return;
          try {
          const event = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(new TextEncoder().encode(event));
          } catch {
            closed = true;
          }
        };

        // Send initial connection message
        sendEvent({
          type: 'connected',
          message: 'Connected to job updates stream',
          timestamp: new Date().toISOString()
        });

        // Helper function to send all job updates
        async function sendAllJobUpdates() {
          if (!session) return;
          try {
            const userId = session.user.user_metadata?.role === 'admin' ? undefined : session.user.id;
            const { jobs } = await JobQueueService.getJobs(undefined, userId, 1, 5);
            jobs.forEach(job => {
              sendEvent({
                type: 'job_update',
                job_id: job.id,
                job_type: job.type,
                status: job.status,
                progress: job.progress,
                error: job.error,
                result: job.result,
                updated_at: job.updated_at,
                started_at: job.started_at,
                completed_at: job.completed_at,
                job
              });
            });
          } catch (error) {
            console.error('Error polling jobs for SSE:', error);
            sendEvent({
              type: 'error',
              message: 'Failed to fetch job updates',
              timestamp: new Date().toISOString()
            });
          }
        }

        // Immediately send the first batch of job updates
        sendAllJobUpdates();

        // Set up polling for job updates
        const pollInterval = setInterval(sendAllJobUpdates, 10000); // Poll every 10 seconds

        // Clean up on cancel
        return () => {
          if (!closed) {
            closed = true;
          clearInterval(pollInterval);
            try {
              controller.close();
            } catch {
              // Ignore error if controller is already closed
            }
          }
        };
      }
    });

    return new Response(stream);

  } catch (error) {
    console.error('Error in SSE stream:', error);
    return new Response('Internal Server error', { status: 500 });
  }
};