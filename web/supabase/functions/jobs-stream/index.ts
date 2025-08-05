import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  if (req.method === 'GET') {
    try {
      console.log('SSE stream request received');
      console.log('Request method:', req.method);
      console.log('Request URL:', req.url);

      // Get authorization header
      const authHeader = req.headers.get('Authorization');
      console.log('🔗 Edge Function: Auth header received:', !!authHeader, authHeader?.substring(0, 20) + '...');
      if (!authHeader) {
        console.error('No authorization header provided');
        return new Response('Unauthorized: No authorization header', {
          status: 401,
          headers: corsHeaders
        });
      }

      const token = authHeader.replace('Bearer ', '');
      console.log('🔗 Edge Function: Token length:', token.length);
      console.log('🔗 Edge Function: Token starts with:', token.substring(0, 20) + '...');

            // Create Supabase client with service role key for admin access
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

      if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
        console.error('Missing environment variables');
        return new Response('Internal Server Error: Missing configuration', {
          status: 500,
          headers: corsHeaders
        });
      }

      console.log('🔗 Edge Function: Creating Supabase client with URL:', supabaseUrl);
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });

            // For now, skip authentication to test the connection
      console.log('🔗 Edge Function: Skipping authentication for testing...');

      // Extract user ID from token if possible, otherwise use a default
      let userId = 'test-user';
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userId = payload.sub || 'test-user';
        console.log('🔗 Edge Function: Extracted user ID from token:', userId);
      } catch (error) {
        console.log('🔗 Edge Function: Could not decode token, using default user ID');
      }
      console.log('SSE stream requested for user:', userId);
      console.log('SSE stream headers:', Object.fromEntries(req.headers.entries()));

      // Set up SSE headers
      const headers = {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      };

      const stream = new ReadableStream({
        async start(controller) {
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
                console.error('Error fetching jobs:', error);
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
              const uniqueJobs = allJobs.filter((job, index, self) =>
                index === self.findIndex(j => j.id === job.id)
              );

              // Send updates for active jobs and recently completed jobs (within 30 seconds)
              if (uniqueJobs.length !== lastJobCount ||
                  uniqueJobs.some(job => job.status === 'queued' || job.status === 'running') ||
                  uniqueJobs.some(job => {
                    const jobTime = new Date(job.updated_at).getTime();
                    const thirtySecondsAgo = Date.now() - 30 * 1000;
                    return (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') &&
                           jobTime > thirtySecondsAgo;
                  })) {
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
              console.error('Stream error:', error);
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
            console.log('SSE stream ended for user:', userId);
          });
        }
      });

      return new Response(stream, { headers });

    } catch (error) {
      console.error('Unhandled error in jobs-stream:', error);
      console.error('Error stack:', error.stack);
      return new Response(`Internal Server Error: ${error.message}`, {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  return new Response('Method not allowed', {
    status: 405,
    headers: corsHeaders
  });
});