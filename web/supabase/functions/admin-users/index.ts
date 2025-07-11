// @ts-ignore
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { createAuthenticatedClient } from '../_shared/supabase.ts'

// @ts-expect-error - Deno is available in Edge Functions runtime
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
      // Get all users
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          role,
          created_at,
          updated_at,
          last_sign_in_at,
          trip_exclusions,
          preferences
        `)
        .order('created_at', { ascending: false })

      if (usersError) {
        throw usersError
      }

      return new Response(JSON.stringify(users || []), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (req.method === 'PUT') {
      // Update user role
      const body = await req.json()
      const { user_id, role } = body

      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: 'User ID and role are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (!['user', 'admin'].includes(role)) {
        return new Response(JSON.stringify({ error: 'Invalid role' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: updatedUser, error: updateError } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', user_id)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      return new Response(JSON.stringify(updatedUser), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Admin users error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})