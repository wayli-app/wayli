import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { createAuthenticatedClient } from '../_shared/supabase.ts'

const NOMINATIM_ENDPOINT = Deno.env.get('NOMINATIM_ENDPOINT') || 'https://nominatim.int.hazen.nu'
const NOMINATIM_RATE_LIMIT = parseInt(Deno.env.get('NOMINATIM_RATE_LIMIT') || '1000')

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

    // Get query parameters
    const url = new URL(req.url)
    const query = url.searchParams.get('q')
    const limit = url.searchParams.get('limit') || '10'

    if (!query) {
      return new Response(JSON.stringify({ error: 'Query parameter "q" is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Call Nominatim API
    const nominatimUrl = new URL('/search', NOMINATIM_ENDPOINT)
    nominatimUrl.searchParams.set('q', query)
    nominatimUrl.searchParams.set('format', 'json')
    nominatimUrl.searchParams.set('limit', limit)
    nominatimUrl.searchParams.set('addressdetails', '1')
    nominatimUrl.searchParams.set('extratags', '1')
    nominatimUrl.searchParams.set('namedetails', '1')

    const response = await fetch(nominatimUrl.toString(), {
      headers: {
        'User-Agent': 'Wayli/1.0 (https://wayli.app)'
      }
    })

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`)
    }

    const results = await response.json()

    // Transform results to match expected format
    const transformedResults = results.map((result: any) => ({
      place_id: result.place_id,
      display_name: result.display_name,
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      type: result.type,
      importance: result.importance,
      address: result.address || {},
      extratags: result.extratags || {},
      namedetails: result.namedetails || {}
    }))

    return new Response(JSON.stringify(transformedResults), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Geocode search error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})