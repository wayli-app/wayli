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
					let lastJobState = new Map<string, { status: string; progress: number; updated_at: string }>();
					let hasActiveJobs = false;

					// Send initial connection message
					const connectMessage = `data: ${JSON.stringify({
						type: 'connected',
						timestamp: new Date().toISOString()
					})}\n\n`;
					controller.enqueue(encoder.encode(connectMessage));

					// Send initial jobs state only if there are active jobs
					const sendInitialJobs = async () => {
						try {
							const { data: activeJobs, error } = await supabase
								.from('jobs')
								.select('*')
								.eq('created_by', userId)
								.in('status', ['queued', 'running'])
								.order('created_at', { ascending: false });

							if (error) {
								logError(error, 'JOBS_STREAM');
								return;
							}

							if (activeJobs && activeJobs.length > 0) {
								hasActiveJobs = true;
								// Store initial state for comparison
								activeJobs.forEach((job: { id: string; status: string; progress: number; updated_at: string }) => {
									lastJobState.set(job.id, {
										status: job.status,
										progress: job.progress,
										updated_at: job.updated_at
									});
								});

								const updateMessage = `data: ${JSON.stringify({
									type: 'jobs_update',
									jobs: activeJobs,
									timestamp: new Date().toISOString()
								})}\n\n`;
								controller.enqueue(encoder.encode(updateMessage));
							}
						} catch (error) {
							logError(error, 'JOBS_STREAM');
						}
					};

					// Send initial jobs
					sendInitialJobs();

					// Check for job updates every 5 seconds, but only send if there are changes
					const jobCheckInterval = setInterval(async () => {
						// Only check if we had active jobs or if this is the first check
						if (!hasActiveJobs) {
							// Check if there are any new active jobs
							try {
								const { data: activeJobs, error } = await supabase
									.from('jobs')
									.select('*')
									.eq('created_by', userId)
									.in('status', ['queued', 'running'])
									.order('created_at', { ascending: false });

								if (error) {
									logError(error, 'JOBS_STREAM');
									return;
								}

								if (activeJobs && activeJobs.length > 0) {
									hasActiveJobs = true;
									// Store initial state for comparison
									activeJobs.forEach((job: { id: string; status: string; progress: number; updated_at: string }) => {
										lastJobState.set(job.id, {
											status: job.status,
											progress: job.progress,
											updated_at: job.updated_at
										});
									});

									const updateMessage = `data: ${JSON.stringify({
										type: 'jobs_update',
										jobs: activeJobs,
										timestamp: new Date().toISOString()
									})}\n\n`;
									controller.enqueue(encoder.encode(updateMessage));
								}
							} catch (error) {
								logError(error, 'JOBS_STREAM');
							}
						} else {
							// Check for updates to existing active jobs
							try {
								const { data: activeJobs, error } = await supabase
									.from('jobs')
									.select('*')
									.eq('created_by', userId)
									.in('status', ['queued', 'running'])
									.order('created_at', { ascending: false });

								if (error) {
									logError(error, 'JOBS_STREAM');
									return;
								}

								if (activeJobs && activeJobs.length > 0) {
									// Check if any jobs have changed
									const changedJobs = activeJobs.filter((job: { id: string; status: string; progress: number; updated_at: string }) => {
										const lastState = lastJobState.get(job.id);
										if (!lastState) {
											// New job
											return true;
										}
										// Check if status, progress, or updated_at changed
										return (
											lastState.status !== job.status ||
											lastState.progress !== job.progress ||
											lastState.updated_at !== job.updated_at
										);
									});

									if (changedJobs.length > 0) {
										// Update stored state
										changedJobs.forEach((job: { id: string; status: string; progress: number; updated_at: string }) => {
											lastJobState.set(job.id, {
												status: job.status,
												progress: job.progress,
												updated_at: job.updated_at
											});
										});

										const updateMessage = `data: ${JSON.stringify({
											type: 'jobs_update',
											jobs: changedJobs,
											timestamp: new Date().toISOString()
										})}\n\n`;
										controller.enqueue(encoder.encode(updateMessage));
									}
								} else {
									// No more active jobs
									hasActiveJobs = false;
									lastJobState.clear();
								}
							} catch (error) {
								logError(error, 'JOBS_STREAM');
							}
						}
					}, 5000);

					// Send heartbeat every 30 seconds to keep connection alive
					const heartbeatInterval = setInterval(() => {
						const heartbeatMessage = `data: ${JSON.stringify({
							type: 'heartbeat',
							timestamp: new Date().toISOString()
						})}\n\n`;
						controller.enqueue(encoder.encode(heartbeatMessage));
					}, 30000);

					// Clean up on disconnect
					req.signal.addEventListener('abort', () => {
						clearInterval(heartbeatInterval);
						clearInterval(jobCheckInterval);
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
