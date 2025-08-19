import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
	// Handle CORS preflight requests
	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders });
	}

	try {
		console.log('🔄 [CONNECTIONS] Request received:', req.method, req.url);

		// Get the authorization header
		const authHeader = req.headers.get('Authorization');
		if (!authHeader) {
			console.error('❌ [CONNECTIONS] No authorization header');
			return new Response(JSON.stringify({ error: 'No authorization header' }), {
				status: 401,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		// Parse request body
		let requestBody;
		try {
			requestBody = await req.json();
			console.log('🔄 [CONNECTIONS] Request body:', requestBody);
		} catch (parseError) {
			console.error('❌ [CONNECTIONS] Failed to parse request body:', parseError);
			return new Response(JSON.stringify({ error: 'Invalid request body' }), {
				status: 400,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		// Check if action is provided
		const { action } = requestBody;
		if (!action) {
			console.error('❌ [CONNECTIONS] No action specified in request body');
			return new Response(JSON.stringify({ error: 'Action is required' }), {
				status: 400,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		// Only handle generate action for now
		if (action !== 'generate') {
			console.error('❌ [CONNECTIONS] Invalid action:', action);
			return new Response(
				JSON.stringify({ error: 'Invalid action. Only "generate" is supported.' }),
				{ status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
			);
		}

		// Create Supabase client with service role key
		const supabaseUrl = Deno.env.get('SUPABASE_URL');
		const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

		if (!supabaseUrl || !supabaseServiceKey) {
			console.error('❌ [CONNECTIONS] Missing environment variables:', {
				hasUrl: !!supabaseUrl,
				hasServiceKey: !!supabaseServiceKey
			});
			return new Response(JSON.stringify({ error: 'Server configuration error' }), {
				status: 500,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		const supabase = createClient(supabaseUrl, supabaseServiceKey, {
			auth: { autoRefreshToken: false, persistSession: false }
		});

		// Verify the JWT token and extract user ID
		const {
			data: { user },
			error: userError
		} = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
		if (userError || !user) {
			console.error('❌ [CONNECTIONS] Failed to get user:', userError);
			return new Response(JSON.stringify({ error: 'Invalid token' }), {
				status: 401,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		console.log('🔄 [CONNECTIONS] generateApiKey action called for user:', user.email);

		// Generate a new API key (32 character hex string)
		const randomBytes = new Uint8Array(16);
		crypto.getRandomValues(randomBytes);
		const apiKey = Array.from(randomBytes)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');

		console.log('🔄 [CONNECTIONS] Generated API key:', apiKey.substring(0, 8) + '...');

		// Update the user's user_metadata with the new API key
		const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
			user_metadata: {
				...user.user_metadata,
				owntracks_api_key: apiKey
			}
		});

		if (updateError) {
			console.error('❌ [CONNECTIONS] Error updating user metadata:', updateError);
			return new Response(
				JSON.stringify({ error: `Failed to generate API key: ${updateError.message}` }),
				{ status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
			);
		}

		console.log('✅ [CONNECTIONS] API key generated and stored successfully');
		console.log('✅ [CONNECTIONS] Stored API key:', apiKey);

		return new Response(JSON.stringify({ success: true, apiKey }), {
			status: 200,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('❌ [CONNECTIONS] Unexpected error in generateApiKey:', error);
		return new Response(JSON.stringify({ error: 'Internal server error' }), {
			status: 500,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	}
});
