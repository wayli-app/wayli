import type { RequestHandler } from './$types';
import { JobQueueService } from '$lib/services/queue/job-queue.service.server';
import type { Job } from '$lib/types/job-queue.types';

export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	try {
		console.log('[SSE] New SSE connection request');

		// Get session from locals (uses session cookie)
		const session = await locals.getSession();

		if (!session) {
			console.log('[SSE] Unauthorized connection attempt - no valid session found');
			return new Response('Unauthorized', { status: 401 });
		}

		console.log('[SSE] Authorized connection for user:', session.user.id);

		// Set SSE headers
		setHeaders({
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'Access-Control-Allow-Origin': '*', // TODO: Remove this. Only for development.
			'Access-Control-Allow-Headers': 'Cache-Control',
			'X-Accel-Buffering': 'no' // Disable nginx buffering
		});

		const stream = new ReadableStream({
			start(controller) {
				let closed = false;
				let pollInterval: NodeJS.Timeout | null = null;
				let cleanupInterval: NodeJS.Timeout | null = null;

				// Track recently finished jobs to send final updates
				const recentlyFinishedJobs = new Map<string, { job: Job; finishedAt: number }>();
				const FINISHED_JOB_RETENTION_TIME = 3000; // Keep finished jobs for 3 seconds

				const sendEvent = (data: Record<string, unknown>) => {
					if (closed) {
						console.log('[SSE] Attempted to send event on closed connection');
						return;
					}
					try {
						const event = `data: ${JSON.stringify(data)}\n\n`;
						controller.enqueue(new TextEncoder().encode(event));
						console.log('[SSE] Sent event:', data.type);
					} catch (error) {
						console.error('[SSE] Error sending event:', error);
						closed = true;
						// Optionally, try to close the controller if not already closed
						try {
							controller.close();
						} catch {
							// Ignore close errors
						}
					}
				};

				// Send initial connection message
				sendEvent({
					type: 'connected',
					message: 'Connected to job updates stream',
					timestamp: new Date().toISOString(),
					userId: session.user.id
				});

				// Helper function to send all job updates
				async function sendAllJobUpdates() {
					if (!session || closed) return;
					try {
						const userId =
							session.user.user_metadata?.role === 'admin' ? undefined : session.user.id;

						// Fetch active jobs (queued and running) separately and combine
						const [queuedJobs, runningJobs] = await Promise.all([
							JobQueueService.getJobs('queued', userId, 1, 10),
							JobQueueService.getJobs('running', userId, 1, 10)
						]);
						const activeJobs = [...queuedJobs.jobs, ...runningJobs.jobs];

						// Fetch recently finished jobs (completed, failed, cancelled) from the last 10 seconds
						const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
						const [completedJobs, failedJobs, cancelledJobs] = await Promise.all([
							JobQueueService.getJobs('completed', userId, 1, 10),
							JobQueueService.getJobs('failed', userId, 1, 10),
							JobQueueService.getJobs('cancelled', userId, 1, 10)
						]);
						const allFinishedJobs = [
							...completedJobs.jobs,
							...failedJobs.jobs,
							...cancelledJobs.jobs
						];
						const recentFinishedJobs = allFinishedJobs.filter(
							(job) => job.updated_at && new Date(job.updated_at) > new Date(tenSecondsAgo)
						);

						// Send updates for active jobs
						activeJobs.forEach((job) => {
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
								created_at: job.created_at,
								created_by: job.created_by,
								priority: job.priority,
								job
							});
						});

						// Send final updates for recently finished jobs
						recentFinishedJobs.forEach((job) => {
							// Only send if we haven't already sent a final update for this job
							if (!recentlyFinishedJobs.has(job.id)) {
								// Ensure progress is 100% for completed jobs
								const finalProgress = job.status === 'completed' ? 100 : job.progress;

								sendEvent({
									type: 'job_update',
									job_id: job.id,
									job_type: job.type,
									status: job.status,
									progress: finalProgress,
									error: job.error,
									result: job.result,
									updated_at: job.updated_at,
									started_at: job.started_at,
									completed_at: job.completed_at,
									created_at: job.created_at,
									created_by: job.created_by,
									priority: job.priority,
									job: { ...job, progress: finalProgress }
								});

								// Track this job as recently finished
								recentlyFinishedJobs.set(job.id, { job, finishedAt: Date.now() });
								console.log(`[SSE] Sent final update for finished job ${job.id} (${job.status})`);
							}
						});
					} catch (error) {
						console.error('[SSE] Error polling jobs for SSE:', error);
						sendEvent({
							type: 'error',
							message: 'Failed to fetch job updates',
							timestamp: new Date().toISOString(),
							error: error instanceof Error ? error.message : 'Unknown error'
						});
					}
				}

				// Helper function to clean up old finished jobs
				function cleanupOldFinishedJobs() {
					const now = Date.now();
					for (const [jobId, { finishedAt }] of recentlyFinishedJobs.entries()) {
						if (now - finishedAt > FINISHED_JOB_RETENTION_TIME) {
							recentlyFinishedJobs.delete(jobId);
							console.log(`[SSE] Removed finished job ${jobId} from tracking`);
						}
					}
				}

				// Immediately send the first batch of job updates
				sendAllJobUpdates();

				// Set up polling for job updates
				pollInterval = setInterval(sendAllJobUpdates, 5000); // Poll every 5 seconds

				// Set up cleanup for old finished jobs
				cleanupInterval = setInterval(cleanupOldFinishedJobs, 2000); // Clean up every 2 seconds

				// Clean up on cancel
				return () => {
					console.log('[SSE] Cleaning up SSE connection');
					if (!closed) {
						closed = true;
					}
					if (pollInterval) {
						clearInterval(pollInterval);
						pollInterval = null;
					}
					if (cleanupInterval) {
						clearInterval(cleanupInterval);
						cleanupInterval = null;
					}
					try {
						controller.close();
					} catch (error) {
						console.error('[SSE] Error closing controller:', error);
					}
				};
			}
		});

		console.log('[SSE] SSE stream created successfully');
		console.log('[SSE] Returning SSE response for user:', session.user.id);
		return new Response(stream);
	} catch (error) {
		console.error('[SSE] Error in SSE stream:', error);
		return new Response('Internal Server error', { status: 500 });
	}
};
