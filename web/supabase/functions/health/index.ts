import { corsHeaders, handleCors } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'http://127.0.0.1:54321'

// Simple health check without database connectivity
interface SimpleHealthStatus {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  version: string
  message: string
  environment: {
    supabase_url: string
    node_env: string
    deno_version: string
  }
}

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  // Simple health check that doesn't require database connectivity
  const healthStatus: SimpleHealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    message: 'Supabase Edge Functions are running',
    environment: {
      supabase_url: supabaseUrl,
      node_env: Deno.env.get('NODE_ENV') || 'development',
      deno_version: Deno.version.deno
    }
  }

  return new Response(JSON.stringify(healthStatus, null, 2), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  })
})