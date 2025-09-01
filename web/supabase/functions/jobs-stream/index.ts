import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
	// Handle CORS
	if (req.method === 'OPTIONS') {
		return new Response(null, { headers: corsHeaders });
	}

	if (req.method === 'GET') {
		try {
			// For now, skip authentication to test if that's causing the timeout
			const userId = '2d8513a7-3e95-4cf2-a5ac-b25ce64cbd82'; // Hardcoded for testing
			console.log('🔗 Jobs-stream: Using hardcoded user:', userId);

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

					// Send a test job update every 5 seconds
					const testJob = {
						id: 'test-job-789',
						type: 'trip_generation',
						status: 'running',
						progress: 25,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					};

					const jobUpdateMessage = `data: ${JSON.stringify({
						type: 'jobs_update',
						jobs: [testJob],
						timestamp: new Date().toISOString()
					})}\n\n`;
					controller.enqueue(encoder.encode(jobUpdateMessage));

					// Send heartbeat every 30 seconds
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
						console.log('🔗 Jobs-stream: SSE stream ended for user:', userId);
					});
				}
			});

			return new Response(stream, { headers });
		} catch (error) {
			console.error('Error in jobs-stream:', error);
			return new Response(JSON.stringify({ error: 'Internal server error' }), {
				status: 500,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}
	}

	return new Response(JSON.stringify({ error: 'Method not allowed' }), {
		status: 405,
		headers: { ...corsHeaders, 'Content-Type': 'application/json' }
	});
});
