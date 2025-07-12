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

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Handle different HTTP methods
    if (req.method === 'GET') {
      // Get user's trip exclusions from metadata
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(user.id)

      if (userError || !userData.user) {
        throw userError || new Error('User not found')
      }

      return new Response(JSON.stringify({
        exclusions: userData.user.user_metadata?.trip_exclusions || []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (req.method === 'POST') {
      // Update user's trip exclusions
      const body = await req.json()
      const { exclusions } = body

      if (!Array.isArray(exclusions)) {
        return new Response(JSON.stringify({ error: 'Exclusions must be an array' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Get current user data
      const { data: currentUser, error: fetchError } = await supabase.auth.admin.getUserById(user.id)

      if (fetchError || !currentUser.user) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Update user metadata with new exclusions
      const updatedMetadata = {
        ...currentUser.user.user_metadata,
        trip_exclusions: exclusions
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: updatedMetadata
      })

      if (updateError) {
        throw updateError
      }

      return new Response(JSON.stringify({
        message: 'Trip exclusions updated successfully',
        exclusions
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Trip exclusions error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})