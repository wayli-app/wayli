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

					// Send initial jobs state
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
