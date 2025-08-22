import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
	setupRequest,
	authenticateRequest,
	successResponse,
	errorResponse,
	logError
} from '../_shared/utils.ts';

serve(async (req) => {
	// Handle CORS and setup
	const corsResponse = setupRequest(req);
	if (corsResponse) return corsResponse;

	try {
		// Authenticate the request and get user context
		const { user, supabase } = await authenticateRequest(req);

		// Check if the current user is an admin by looking up their role in user_profiles
		const { data: userProfile, error: profileError } = await supabase
			.from('user_profiles')
			.select('role')
			.eq('id', user.id)
			.single();

		if (profileError || userProfile?.role !== 'admin') {
			logError(
				`User is not admin. Profile: ${JSON.stringify(userProfile)}, Error: ${profileError?.message}`,
				'ADMIN-USERS'
			);
			return errorResponse('Forbidden', 403);
		}

		// Create a service role client for admin operations
		const adminSupabase = createClient(
			Deno.env.get('SUPABASE_URL')!,
			Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
			{
				auth: {
					autoRefreshToken: false,
					persistSession: false
				}
			}
		);

		const { method } = req;
		const url = new URL(req.url);

		if (method === 'GET') {
			// Get pagination parameters from URL
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = parseInt(url.searchParams.get('limit') || '10');
			const search = url.searchParams.get('search') || '';

			// Fetch all users using admin client
			const {
				data: { users: authUsers },
				error: authUsersError
			} = await adminSupabase.auth.admin.listUsers({
				page: 1,
				perPage: 1000
			});

			if (authUsersError) {
				logError(authUsersError, 'ADMIN-USERS');
				return successResponse({
					users: [],
					pagination: {
						page: 1,
						limit: 10,
						total: 0,
						totalPages: 0,
						hasNext: false,
						hasPrev: false
					}
				});
			}

			// Map auth users to the UserProfile format
			const combinedUsers = authUsers.map((authUser: any) => {
				const metadata = authUser.user_metadata || {};
				return {
					id: authUser.id,
					email: authUser.email,
					first_name: metadata.first_name || '',
					last_name: metadata.last_name || '',
					full_name:
						metadata.full_name ||
						`${metadata.first_name || ''} ${metadata.last_name || ''}`.trim() ||
						'',
					role: (metadata.role as 'user' | 'admin') || 'user',
					avatar_url: metadata.avatar_url,
					home_address: metadata.home_address,
					email_confirmed_at: authUser.email_confirmed_at,
					created_at: authUser.created_at,
					updated_at: authUser.updated_at || authUser.created_at
				};
			});

			// Apply search filter
			const filteredUsers = search
				? combinedUsers.filter(
						(u) =>
							u.email?.toLowerCase().includes(search.toLowerCase()) ||
							u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
							u.first_name?.toLowerCase().includes(search.toLowerCase()) ||
							u.last_name?.toLowerCase().includes(search.toLowerCase())
					)
				: combinedUsers;

			// Calculate pagination
			const total = filteredUsers.length;
			const totalPages = Math.ceil(total / limit);
			const startIndex = (page - 1) * limit;
			const endIndex = startIndex + limit;
			const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

			return successResponse({
				users: paginatedUsers || [],
				pagination: {
					page,
					limit,
					total,
					totalPages,
					hasNext: page < totalPages,
					hasPrev: page > 1
				}
			});
		}

		if (method === 'POST') {
			const body = await req.json();
			const { action: postAction, ...data } = body;

			if (postAction === 'addUser') {
				const { email, firstName, lastName, role } = data;

				if (!email || !firstName || !lastName || !role) {
					return new Response(JSON.stringify({ error: 'Missing required fields' }), {
						status: 400,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				}

				// Create a new user with a temporary password
				const tempPassword =
					Math.random().toString(36).slice(-10) +
					Math.random().toString(36).toUpperCase().slice(-2) +
					'1!';

				const { data: createUserData, error } = await adminSupabase.auth.admin.createUser({
					email,
					password: tempPassword,
					email_confirm: true,
					user_metadata: {
						first_name: firstName,
						last_name: lastName,
						role: role
					}
				});

				if (error) {
					logError(error, 'ADMIN-USERS');
					return errorResponse(error.message, 500);
				}

				// Also create/update the user_profiles table entry
				if (createUserData.user) {
					const { error: profileError } = await supabase.from('user_profiles').upsert({
						id: createUserData.user.id,
						role: role,
						first_name: firstName,
						last_name: lastName,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					});

					if (profileError) {
						logError(profileError, 'ADMIN-USERS');
						console.warn(
							'Failed to create user profile, but user was created:',
							profileError.message
						);
					}
				}

				console.log('New user created with temporary password:', tempPassword);
				return successResponse({ success: true });
			}

			if (postAction === 'updateUser') {
				const { userId, email, firstName, lastName, role } = data;

				if (!userId || !email || !role) {
					return new Response(JSON.stringify({ error: 'Missing required fields' }), {
						status: 400,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				}

				// Get the user to update to preserve their existing metadata
				const { data: userData, error: getUserError } =
					await adminSupabase.auth.admin.getUserById(userId);
				if (getUserError || !userData?.user) {
					return new Response(JSON.stringify({ error: 'User not found' }), {
						status: 404,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				}

				const userToUpdate = userData.user;

				// Update the user directly in auth.users
				const { error: updateAuthError } = await adminSupabase.auth.admin.updateUserById(userId, {
					email,
					user_metadata: {
						...userToUpdate.user_metadata,
						role,
						first_name: firstName,
						last_name: lastName
					}
				});

				if (updateAuthError) {
					logError(updateAuthError, 'ADMIN-USERS');
					return errorResponse(updateAuthError.message, 500);
				}

				// Also update the user_profiles table entry
				const { error: profileError } = await supabase.from('user_profiles').upsert({
					id: userId,
					role: role,
					first_name: firstName,
					last_name: lastName,
					updated_at: new Date().toISOString()
				});

				if (profileError) {
					logError(profileError, 'ADMIN-USERS');
					console.warn(
						'Failed to update user profile, but user was updated:',
						profileError.message
					);
				}

				return successResponse({ success: true });
			}

			if (postAction === 'deleteUser') {
				const { userId } = data;

				if (!userId) {
					return new Response(JSON.stringify({ error: 'Missing user ID' }), {
						status: 400,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				}

				// Prevent admin from deleting themselves
				if (userId === user.id) {
					return new Response(JSON.stringify({ error: 'Cannot delete your own account' }), {
						status: 400,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				}

				// Delete the user from auth.users
				const { error: deleteAuthError } = await adminSupabase.auth.admin.deleteUser(userId);

				if (deleteAuthError) {
					return new Response(JSON.stringify({ error: deleteAuthError.message }), {
						status: 500,
						headers: { ...corsHeaders, 'Content-Type': 'application/json' }
					});
				}

				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			}
		}

		return new Response(JSON.stringify({ error: 'Method not allowed' }), {
			status: 405,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Unexpected error in admin-users:', error);
		return new Response(JSON.stringify({ error: 'Internal server error' }), {
			status: 500,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	}
});
