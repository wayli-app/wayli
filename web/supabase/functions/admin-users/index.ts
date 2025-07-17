// @ts-expect-error - Deno is available in Edge Functions runtime
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createAuthenticatedClient } from '../_shared/supabase.ts';
Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = handleCors(req);
	if (corsResponse) return corsResponse;

	try {
		// Get auth token
		const authHeader = req.headers.get('Authorization');
		if (!authHeader) {
			return new Response(JSON.stringify({ error: 'No authorization header' }), {
				status: 401,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		const token = authHeader.replace('Bearer ', '');
		const supabase = createAuthenticatedClient(token);

		// Verify user is authenticated and is admin
		const {
			data: { user },
			error: authError
		} = await supabase.auth.getUser();
		if (authError || !user) {
			return new Response(JSON.stringify({ error: 'Invalid token' }), {
				status: 401,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		// Check if user is admin
		const { data: userData, error: userError } = await supabase.auth.admin.getUserById(user.id);

		if (userError || !userData.user) {
			return new Response(JSON.stringify({ error: 'User not found' }), {
				status: 404,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		const userRole = userData.user.user_metadata?.role || 'user';
		if (userRole !== 'admin') {
			return new Response(JSON.stringify({ error: 'Admin access required' }), {
				status: 403,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		// Handle different HTTP methods
		if (req.method === 'GET') {
			// Get all users
			const { data: users, error: usersError } = await supabase.auth.admin.listUsers();

			if (usersError) {
				throw usersError;
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

			return new Response(JSON.stringify(formattedUsers), {
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			});
		}

		if (req.method === 'PUT') {
			// Update user role
			const body = await req.json();
			const { user_id, role } = body;

			if (!user_id || !role) {
				return new Response(JSON.stringify({ error: 'User ID and role are required' }), {
					status: 400,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			}

			if (!['user', 'admin'].includes(role)) {
				return new Response(JSON.stringify({ error: 'Invalid role' }), {
					status: 400,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
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

		return new Response(JSON.stringify({ error: 'Method not allowed' }), {
			status: 405,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Admin users error:', error);
		return new Response(JSON.stringify({ error: 'Internal server error' }), {
			status: 500,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	}
});
