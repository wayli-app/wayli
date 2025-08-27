import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { authenticateRequest, successResponse, errorResponse } from '../_shared/utils.ts';

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = handleCors(req);
	if (corsResponse) return corsResponse;

	try {
		// Authenticate the request
		const { user, supabase } = await authenticateRequest(req);
		console.log('🔄 [SIGNOUT] Server-side signout initiated for user:', user.email);

		// Sign out the user
		const { error } = await supabase.auth.signOut();

		if (error) {
			console.error('❌ [SIGNOUT] Error signing out:', error);
			return errorResponse('Failed to sign out', 500);
		}

		console.log('✅ [SIGNOUT] User signed out successfully on server');

		return successResponse({ message: 'Signed out successfully' });
	} catch (error) {
		console.error('❌ [SIGNOUT] Unexpected error:', error);
		return errorResponse('Internal server error', 500);
	}
});
