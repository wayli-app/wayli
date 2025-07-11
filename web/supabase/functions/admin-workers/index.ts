import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { createAuthenticatedClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    // Get auth token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createAuthenticatedClient(token)

    // Verify user is authenticated and is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Handle different HTTP methods
    if (req.method === 'GET') {
      // Get all workers
      const { data: workers, error: workersError } = await supabase
        .from('workers')
        .select('*')
        .order('created_at', { ascending: false })

      if (workersError) {
        throw workersError
      }

      return new Response(JSON.stringify(workers || []), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (req.method === 'POST') {
      // Create a new worker
      const body = await req.json()
      const { name, type, config } = body

      if (!name || !type) {
        return new Response(JSON.stringify({ error: 'Name and type are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: worker, error: workerError } = await supabase
        .from('workers')
        .insert({
          name,
          type,
          status: 'inactive',
          config: config || {},
          last_heartbeat: null
        })
        .select()
        .single()

      if (workerError) {
        throw workerError
      }

      return new Response(JSON.stringify(worker), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (req.method === 'PUT') {
      // Update worker status
      const body = await req.json()
      const { worker_id, status } = body

      if (!worker_id || !status) {
        return new Response(JSON.stringify({ error: 'Worker ID and status are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (!['active', 'inactive', 'error'].includes(status)) {
        return new Response(JSON.stringify({ error: 'Invalid status' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: updatedWorker, error: updateError } = await supabase
        .from('workers')
        .update({ status })
        .eq('id', worker_id)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      return new Response(JSON.stringify(updatedWorker), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Admin workers error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})