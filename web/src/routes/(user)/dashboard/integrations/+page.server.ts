import type { PageServerLoad } from './$types';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { fail } from '@sveltejs/kit';
import { randomBytes, createHash } from 'crypto';

export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.getSession();

	if (!session?.user) {
		return {
			owntracksApiKey: null,
			owntracksEndpoint: null
		};
	}

	// Create Supabase admin client to access raw_user_metadata
	const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

	// Get user data to access raw_user_metadata
	const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(session.user.id);

	if (userError || !user) {
		console.log('❌ [INTEGRATIONS] Failed to get user data:', userError);
		return {
			owntracksApiKey: null,
			owntracksEndpoint: null
		};
	}

	console.log('🔄 [INTEGRATIONS] User data retrieved successfully');

	// Get the user's current API key from user_metadata (since raw_user_metadata is undefined)
	const owntracksApiKey = user.user_metadata?.owntracks_api_key || null;

	// Construct the endpoint URL using the current domain
	const baseUrl = PUBLIC_SUPABASE_URL.includes('localhost')
		? 'http://localhost:5173'
		: 'https://wayli.app'; // Replace with your actual domain
	const owntracksEndpoint = owntracksApiKey
		? `${baseUrl}/api/v1/owntracks/points?api_key=${owntracksApiKey}&user_id=${session.user.id}`
		: null;

	return {
		owntracksApiKey,
		owntracksEndpoint
	};
};

export const actions = {
	generateApiKey: async ({ locals }) => {
		console.log('🔄 [INTEGRATIONS] generateApiKey action called');

		try {
			const session = await locals.getSession();
			console.log('🔄 [INTEGRATIONS] Session check:', session ? `Found - ${session.user.email}` : 'None');

			if (!session?.user) {
				console.log('❌ [INTEGRATIONS] No session found');
				return fail(401, { error: 'Unauthorized' });
			}

			console.log('🔄 [INTEGRATIONS] Generating new API key...');

			// Check if crypto is available
			if (typeof createHash === 'undefined') {
				console.error('❌ [INTEGRATIONS] Crypto module not available');
				return fail(500, { error: 'Crypto module not available' });
			}

			// Generate a new MD5 hash as API key
			const apiKey = createHash('md5').update(randomBytes(32)).digest('hex');
			console.log('🔄 [INTEGRATIONS] Generated API key:', apiKey.substring(0, 8) + '...');

			// Create Supabase admin client to update user metadata
			const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

			console.log('🔄 [INTEGRATIONS] Updating user metadata...');
			console.log('🔄 [INTEGRATIONS] Current user_metadata:', session.user.user_metadata);

			// Update the user's user_metadata with the new API key
			const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(session.user.id, {
				user_metadata: {
					...session.user.user_metadata,
					owntracks_api_key: apiKey
				}
			});

			if (updateError) {
				console.error('❌ [INTEGRATIONS] Error updating user metadata:', updateError);
				return fail(500, { error: `Failed to generate API key: ${updateError.message}` });
			}

			// Verify the update worked by reading the user data again
			const { data: { user: updatedUser }, error: verifyError } = await supabaseAdmin.auth.admin.getUserById(session.user.id);
			if (verifyError || !updatedUser) {
				console.error('❌ [INTEGRATIONS] Failed to verify update:', verifyError);
			}

			console.log('✅ [INTEGRATIONS] API key generated and stored successfully');
			console.log('✅ [INTEGRATIONS] Stored API key:', apiKey);
			console.log('✅ [INTEGRATIONS] Returning success response...');
			const response = { success: true, apiKey };
			console.log('✅ [INTEGRATIONS] Response:', response);
			return response;

		} catch (error) {
			console.error('❌ [INTEGRATIONS] Unexpected error in generateApiKey:', error);
			return fail(500, { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` });
		}
	}
};