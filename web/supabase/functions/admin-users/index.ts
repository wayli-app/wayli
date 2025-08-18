import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
		// Get the authorization header
		const authHeader = req.headers.get('Authorization');
		if (!authHeader) {
			return new Response(
				JSON.stringify({ error: 'No authorization header' }),
				{ status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
			);
		}

		// Create Supabase client
		const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
		const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
		const supabase = createClient(supabaseUrl, supabaseServiceKey, {
			global: { headers: { Authorization: authHeader } }
		});

		// Get the user from the token
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return new Response(
				JSON.stringify({ error: 'Invalid token' }),
				{ status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
			);
		}

		// Check if the current user is an admin by checking their profile
		const { data: profile, error: profileError } = await supabase
			.from('user_profiles')
			.select('role')
			.eq('id', user.id)
			.single();

		if (profileError || profile?.role !== 'admin') {
			return new Response(
				JSON.stringify({ error: 'Forbidden' }),
				{ status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
			);
		}

		const { method } = req;
		const url = new URL(req.url);
		const action = url.searchParams.get('action');

		if (method === 'GET') {
			// Get pagination parameters from URL
			const page = parseInt(url.searchParams.get('page') || '1');
			const limit = parseInt(url.searchParams.get('limit') || '10');
			const search = url.searchParams.get('search') || '';

			// Fetch all users
			const { data: { users: authUsers }, error: authUsersError } = await supabase.auth.admin.listUsers({
				page: 1,
				perPage: 1000
			});

			if (authUsersError) {
				console.error('Error fetching auth users:', authUsersError);
				return new Response(
					JSON.stringify({ users: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false } }),
					{ status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
				);
			}

			// Map auth users to the UserProfile format
			const combinedUsers = authUsers.map((authUser) => {
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

			return new Response(
				JSON.stringify({
					users: paginatedUsers || [],
					pagination: {
						page,
						limit,
						total,
						totalPages,
						hasNext: page < totalPages,
						hasPrev: page > 1
					}
				}),
				{ status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
			);
		}

		if (method === 'POST') {
			const body = await req.json();
			const { action: postAction, ...data } = body;

			if (postAction === 'addUser') {
				const { email, firstName, lastName, role } = data;

				if (!email || !firstName || !lastName || !role) {
					return new Response(
						JSON.stringify({ error: 'Missing required fields' }),
						{ status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
					);
				}

				// Create a new user with a temporary password
				const tempPassword =
					Math.random().toString(36).slice(-10) +
					Math.random().toString(36).toUpperCase().slice(-2) +
					'1!';

				const { error } = await supabase.auth.admin.createUser({
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
					return new Response(
						JSON.stringify({ error: error.message }),
						{ status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
					);
				}

				console.log('New user created with temporary password:', tempPassword);
				return new Response(
					JSON.stringify({ success: true }),
					{ status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
				);
			}

			if (postAction === 'updateUser') {
				const { userId, email, firstName, lastName, role } = data;

				if (!userId || !email || !role) {
					return new Response(
						JSON.stringify({ error: 'Missing required fields' }),
						{ status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
					);
				}

				// Get the user to update to preserve their existing metadata
				const { data: userData, error: getUserError } = await supabase.auth.admin.getUserById(userId);
				if (getUserError || !userData?.user) {
					return new Response(
						JSON.stringify({ error: 'User not found' }),
						{ status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
					);
				}

				const userToUpdate = userData.user;

				// Update the user directly in auth.users
				const { error: updateAuthError } = await supabase.auth.admin.updateUserById(userId, {
					email,
					user_metadata: {
						...userToUpdate.user_metadata,
						role,
						first_name: firstName,
						last_name: lastName
					}
				});

				if (updateAuthError) {
					return new Response(
						JSON.stringify({ error: updateAuthError.message }),
						{ status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
					);
				}

				return new Response(
					JSON.stringify({ success: true }),
					{ status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
				);
			}

			if (postAction === 'deleteUser') {
				const { userId } = data;

				if (!userId) {
					return new Response(
						JSON.stringify({ error: 'Missing user ID' }),
						{ status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
					);
				}

				// Prevent admin from deleting themselves
				if (userId === user.id) {
					return new Response(
						JSON.stringify({ error: 'Cannot delete your own account' }),
						{ status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
					);
				}

				// Delete the user from auth.users
				const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);

				if (deleteAuthError) {
					return new Response(
						JSON.stringify({ error: deleteAuthError.message }),
						{ status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
					);
				}

				return new Response(
					JSON.stringify({ success: true }),
					{ status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
				);
			}
		}

		return new Response(
			JSON.stringify({ error: 'Method not allowed' }),
			{ status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		console.error('Unexpected error in admin-users:', error);
		return new Response(
			JSON.stringify({ error: 'Internal server error' }),
			{ status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
		);
	}
});
