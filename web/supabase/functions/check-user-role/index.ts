import {
	setupRequest,
	authenticateRequest,
	successResponse,
	errorResponse,
	logError,
	logInfo,
	logSuccess
} from '../_shared/utils.ts';

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = setupRequest(req);
	if (corsResponse) return corsResponse;

	try {
		const { user, supabase } = await authenticateRequest(req);

		if (req.method === 'GET') {
			logInfo('Checking user role', 'CHECK-USER-ROLE', { userId: user.id });

			// Get user's role from profile
			const { data: profile, error: profileError } = await supabase
				.from('user_profiles')
				.select('role, first_name, last_name, full_name')
				.eq('id', user.id)
				.single();

			if (profileError) {
				logError(profileError, 'CHECK-USER-ROLE');
				return errorResponse('Failed to fetch user profile', 500);
			}

			logSuccess('User role checked successfully', 'CHECK-USER-ROLE', {
				userId: user.id,
				userEmail: user.email,
				profileRole: profile?.role,
				metadataRole: user.user_metadata?.role,
				firstName: profile?.first_name,
				lastName: profile?.last_name,
				fullName: profile?.full_name
			});

			return successResponse({
				userId: user.id,
				userEmail: user.email,
				profileRole: profile?.role,
				metadataRole: user.user_metadata?.role,
				isAdmin: profile?.role === 'admin',
				firstName: profile?.first_name,
				lastName: profile?.last_name,
				fullName: profile?.full_name
			});
		}

		return errorResponse('Method not allowed', 405);
	} catch (error) {
		logError(error, 'CHECK-USER-ROLE');
		return errorResponse('Internal server error', 500);
	}
});
