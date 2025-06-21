import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { JobQueueService } from '$lib/services/job-queue.service';

export const GET: RequestHandler = async ({ locals, setHeaders }) => {
  try {
    const session = await locals.getSession();
    if (!session?.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Set SSE headers
    setHeaders({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const stream = new ReadableStream({
      start(controller) {
        const sendEvent = (data: any) => {
          const event = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(new TextEncoder().encode(event));
        };

        // Send initial connection message
        sendEvent({
          type: 'connected',
          message: 'Connected to job updates stream',
          timestamp: new Date().toISOString()
        });

        // Set up polling for job updates
        const pollInterval = setInterval(async () => {
          try {
            const userId = session.user.user_metadata?.role === 'admin' ? undefined : session.user.id;
            const { jobs } = await JobQueueService.getJobs(undefined, userId, 1, 50);

            // Send job updates
            jobs.forEach(job => {
              sendEvent({
                type: 'job_update',
                job_id: job.id,
                status: job.status,
                progress: job.progress,
                error: job.error,
                result: job.result,
                updated_at: job.updated_at,
                started_at: job.started_at,
                completed_at: job.completed_at
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
        }, 2000); // Poll every 2 seconds

        // Clean up on close
        return () => {
          clearInterval(pollInterval);
        };
      }
    });

    return new Response(stream);

  } catch (error) {
    console.error('Error in SSE stream:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};