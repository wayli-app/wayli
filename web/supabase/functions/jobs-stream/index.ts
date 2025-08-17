import { corsHeaders } from '../_shared/cors.ts';
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

	if (req.method === 'GET') {
		try {
			// Authenticate the request properly
			const { user, supabase } = await authenticateRequest(req);
			const userId = user.id;

			// Set up SSE headers
			const headers = {
				...corsHeaders,
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive'
			};

			const stream = new ReadableStream({
				start(controller) {
					const encoder = new TextEncoder();

					// Send initial connection message
					const connectMessage = `data: ${JSON.stringify({
						type: 'connected',
						timestamp: new Date().toISOString()
					})}\n\n`;
					controller.enqueue(encoder.encode(connectMessage));

					let lastJobCount = 0;

					// Poll for job updates every 2 seconds
					const pollInterval = setInterval(async () => {
						try {
							// Get all active jobs (queued and running) for the user
							const { data: activeJobs, error } = await supabase
								.from('jobs')
								.select('*')
								.eq('created_by', userId)
								.in('status', ['queued', 'running'])
								.order('created_at', { ascending: false });

							if (error) {
								logError(error, 'JOBS_STREAM');
								const errorMessage = `data: ${JSON.stringify({
									type: 'error',
									error: 'Failed to fetch jobs'
								})}\n\n`;
								controller.enqueue(encoder.encode(errorMessage));
								return;
							}

							// Get recently completed jobs (within last 30 seconds)
							const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
							const { data: recentCompletedJobs } = await supabase
								.from('jobs')
								.select('*')
								.eq('created_by', userId)
								.in('status', ['completed', 'failed', 'cancelled'])
								.gte('updated_at', thirtySecondsAgo)
								.order('created_at', { ascending: false });

							// Combine active and recently completed jobs
							const allJobs = [...(activeJobs || []), ...(recentCompletedJobs || [])];

							// Remove duplicates (jobs might appear in both queries)
							const uniqueJobs = allJobs.filter(
								(job, index, self) => index === self.findIndex((j) => j.id === job.id)
							);

							// Send updates for active jobs and recently completed jobs (within 30 seconds)
							if (
								uniqueJobs.length !== lastJobCount ||
								uniqueJobs.some((job) => job.status === 'queued' || job.status === 'running') ||
								uniqueJobs.some((job) => {
									const jobTime = new Date(job.updated_at).getTime();
									const thirtySecondsAgo = Date.now() - 30 * 1000;
									return (
										(job.status === 'completed' ||
											job.status === 'failed' ||
											job.status === 'cancelled') &&
										jobTime > thirtySecondsAgo
									);
								})
							) {
								const updateMessage = `data: ${JSON.stringify({
									type: 'jobs_update',
									jobs: uniqueJobs,
									timestamp: new Date().toISOString()
								})}\n\n`;
								controller.enqueue(encoder.encode(updateMessage));
								lastJobCount = uniqueJobs.length;
							}

							// Send heartbeat every 30 seconds
							if (Date.now() % 30000 < 2000) {
								const heartbeatMessage = `data: ${JSON.stringify({
									type: 'heartbeat',
									timestamp: new Date().toISOString()
								})}\n\n`;
								controller.enqueue(encoder.encode(heartbeatMessage));
							}
						} catch (error) {
							logError(error, 'JOBS_STREAM');
							const errorMessage = `data: ${JSON.stringify({
								type: 'error',
								error: 'Stream error'
							})}\n\n`;
							controller.enqueue(encoder.encode(errorMessage));
						}
					}, 2000);

					// Clean up on disconnect
					req.signal.addEventListener('abort', () => {
						clearInterval(pollInterval);
						logInfo('SSE stream ended', 'JOBS_STREAM', { userId });
					});
				}
			});

			return new Response(stream, { headers });
		} catch (error) {
			logError(error, 'JOBS_STREAM');
			return errorResponse('Internal server error', 500);
		}
	}

	return errorResponse('Method not allowed', 405);
});
