import {
	setupRequest,
	authenticateRequest,
	successResponse,
	errorResponse,
	parseJsonBody,
	logError,
	logInfo
} from '../_shared/utils.ts';

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = setupRequest(req);
	if (corsResponse) return corsResponse;

	try {
		const { user, supabase } = await authenticateRequest(req);

		// Check if user is admin by querying user_profiles table
		const { data: userProfile, error: profileError } = await supabase
			.from('user_profiles')
			.select('role')
			.eq('id', user.id)
			.single();

		if (profileError || userProfile?.role !== 'admin') {
			logError(profileError || 'User is not admin', 'ADMIN-USERS');
			return errorResponse('Admin access required', 403);
		}

		// Handle different HTTP methods
		if (req.method === 'GET') {
			// Get all users
			const { data: users, error: usersError } = await supabase.auth.admin.listUsers();

			if (usersError) {
				logError(usersError, 'ADMIN-USERS');
				return errorResponse('Failed to fetch users', 500);
			}

			const formattedUsers = (users.users || []).map((user) => {
				const metadata = user.user_metadata || {};
				return {
					id: user.id,
					email: user.email,
					full_name: metadata.full_name || metadata.first_name || metadata.last_name,
					role: metadata.role || 'user',
					created_at: user.created_at,
					updated_at: user.updated_at,
					last_sign_in_at: user.last_sign_in_at,
					trip_exclusions: metadata.trip_exclusions || [],
					preferences: metadata.preferences || {}
				};
			});

			return successResponse({ users: formattedUsers });
		}

		if (req.method === 'PUT') {
			logInfo('Updating user role', 'ADMIN-USERS', { userId: user.id });

			const body = await parseJsonBody<Record<string, unknown>>(req);
			const { user_id, role } = body;

			if (!user_id || !role) {
				return errorResponse('User ID and role are required', 400);
			}

			if (!['user', 'admin'].includes(role as string)) {
				return errorResponse('Invalid role', 400);
			}

			// Get current user data
			const { data: currentUser, error: fetchError } =
				await supabase.auth.admin.getUserById(user_id);

			if (fetchError || !currentUser.user) {
				return new Response(JSON.stringify({ error: 'User not found' }), {
					status: 404,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			}

			// Update user metadata with new role
			const updatedMetadata = {
				...currentUser.user.user_metadata,
				role: role
			};

			const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
				user_id,
				{
					user_metadata: updatedMetadata
				}
			);

			if (updateError) {
				throw updateError;
			}

			const metadata = updatedUser.user?.user_metadata || {};
			const formattedUser = {
				id: updatedUser.user?.id,
				email: updatedUser.user?.email,
				full_name: metadata.full_name || metadata.first_name || metadata.last_name,
				role: metadata.role || 'user',
				created_at: updatedUser.user?.created_at,
				updated_at: updatedUser.user?.updated_at,
				last_sign_in_at: updatedUser.user?.last_sign_in_at,
				trip_exclusions: metadata.trip_exclusions || [],
				preferences: metadata.preferences || {}
			};

			return new Response(JSON.stringify(formattedUser), {
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		return errorResponse('Method not allowed', 405);
	} catch (error) {
		logError(error, 'ADMIN-USERS');
		return errorResponse('Internal server error', 500);
	}
});
