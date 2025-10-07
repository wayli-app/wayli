import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateRequest, successResponse, errorResponse } from '../_shared/utils.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts';

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = handleCors(req);
	if (corsResponse) return corsResponse;

	try {
		console.log('🔄 [CONNECTIONS] Request received:', req.method, req.url);

		// Authenticate the request
		const { user } = await authenticateRequest(req);
		console.log('🔑 [CONNECTIONS] User authenticated:', user.id);

		// Parse request body
		let requestBody;
		try {
			requestBody = await req.json();
			console.log('🔄 [CONNECTIONS] Request body:', requestBody);
		} catch (parseError) {
			console.error('❌ [CONNECTIONS] Failed to parse request body:', parseError);
			return errorResponse('Invalid request body', 400);
		}

		// Check if action is provided
		const { action } = requestBody;
		if (!action) {
			console.error('❌ [CONNECTIONS] No action specified in request body');
			return errorResponse('Action is required', 400);
		}

		// Only handle generate action for now
		if (action !== 'generate') {
			console.error('❌ [CONNECTIONS] Invalid action:', action);
			return errorResponse('Invalid action. Only "generate" is supported.', 400);
		}

		// Create Supabase client with service role key for admin operations
		const supabaseUrl = Deno.env.get('SUPABASE_URL');
		const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

		if (!supabaseUrl || !supabaseServiceKey) {
			console.error('❌ [CONNECTIONS] Missing environment variables:', {
				hasUrl: !!supabaseUrl,
				hasServiceKey: !!supabaseServiceKey
			});
			return errorResponse('Server configuration error', 500);
		}

		const supabase = createClient(supabaseUrl, supabaseServiceKey, {
			auth: { autoRefreshToken: false, persistSession: false }
		});

		console.log('🔄 [CONNECTIONS] generateApiKey action called for user:', user.email);

		// Generate a new API key (32 character hex string)
		const randomBytes = new Uint8Array(16);
		crypto.getRandomValues(randomBytes);
		const apiKey = Array.from(randomBytes)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');

		console.log('🔄 [CONNECTIONS] Generated API key:', apiKey.substring(0, 8) + '...');

		// Update the user's user_metadata with the new API key
		const userMetadata = (user.user_metadata as Record<string, unknown>) || {};
		const { error: updateError } = await supabase.auth.admin.updateUserById(user.id as string, {
			user_metadata: {
				...userMetadata,
				owntracks_api_key: apiKey
			}
		});

		if (updateError) {
			console.error('❌ [CONNECTIONS] Error updating user metadata:', updateError);
			return errorResponse(`Failed to generate API key: ${updateError.message}`, 500);
		}

		console.log('✅ [CONNECTIONS] API key generated and stored successfully');
		console.log('✅ [CONNECTIONS] Stored API key:', apiKey);

		return successResponse({ apiKey });
	} catch (error) {
		console.error('❌ [CONNECTIONS] Unexpected error in generateApiKey:', error);
		return errorResponse('Internal server error', 500);
	}
});
