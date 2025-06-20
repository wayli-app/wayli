import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Get the user from the session
	const session = await locals.getSession();

	if (!session?.user) {
		throw redirect(302, '/auth/signin');
	}

	// Create a Supabase client with service role key for admin operations
	const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

	// Check if the current user is an admin by checking their user metadata
	const isAdmin = session.user.user_metadata?.role === 'admin';

	if (!isAdmin) {
		throw redirect(302, '/dashboard/trips');
	}

	// Get pagination parameters from URL
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '10');
	const search = url.searchParams.get('search') || '';

	// Fetch all users directly from Supabase Auth
	const { data: { users: authUsers }, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers({
		page: page,
		perPage: limit,
	});

	if (authUsersError) {
		console.error('Error fetching auth users:', authUsersError);
		return {
			user: session.user,
			isAdmin: isAdmin,
			users: [],
			pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false }
		};
	}

	// Map auth users to the format needed by the page, deriving data from user_metadata
	const combinedUsers = authUsers.map(authUser => {
		return {
			...authUser,
			id: authUser.id,
			full_name: authUser.user_metadata?.full_name,
			avatar_url: authUser.user_metadata?.avatar_url,
			is_admin: authUser.user_metadata?.role === 'admin',
			created_at: authUser.created_at,
			email: authUser.email
		};
	});

	// Client-side search, as listUsers doesn't support server-side filtering
	const filteredUsers = search
		? combinedUsers.filter(u =>
				u.email?.toLowerCase().includes(search.toLowerCase()) ||
				u.full_name?.toLowerCase().includes(search.toLowerCase())
			)
		: combinedUsers;

	// Note: listUsers doesn't provide a total count, so pagination is limited to the current page.
	const total = filteredUsers.length;
	const totalPages = Math.ceil(total / limit);

	return {
		user: session.user,
		isAdmin,
		users: filteredUsers || [],
		pagination: {
			page,
			limit,
			total,
			totalPages,
			hasNext: page < totalPages,
			hasPrev: page > 1
		}
	};
};

export const actions = {
	updateUser: async ({ request, locals: { getSession } }) => {
		try {
			const session = await getSession();
			if (!session) {
				return fail(401, { error: 'Unauthorized' });
			}

			// Check if the current user is an admin
			const isAdmin = session.user.user_metadata?.role === 'admin';
			if (!isAdmin) {
				return fail(403, { error: 'Forbidden' });
			}

			const formData = await request.formData();
			const userId = formData.get('userId') as string;
			const email = formData.get('email') as string;
			const fullName = formData.get('fullName') as string;
			const role = formData.get('role') as string;

			if (!userId || !email || !fullName || !role) {
				return fail(400, { error: 'Missing required fields' });
			}

			const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

			// TEMPORARILY DISABLED: Ensure the current user is an admin before proceeding
			// const { data: { user: adminUser }, error: adminUserError } = await supabaseAdmin.auth.admin.getUserById(session.user.id);
			// if (adminUserError || adminUser?.user_metadata?.role !== 'admin') {
			// 	return fail(403, { error: 'Forbidden' });
			// }

			// Get the user to update to preserve their existing metadata
			const { data, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
			if (getUserError || !data?.user) {
				return fail(404, { error: 'User not found' });
			}
			const userToUpdate = data.user;

			// Update the user directly in auth.users
			const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
				email,
				user_metadata: {
					...userToUpdate.user_metadata, // Preserve existing metadata
					role,
					full_name: fullName
				}
			});

			if (updateAuthError) {
				return fail(500, { error: updateAuthError.message });
			}

			return { success: true };
		} catch (e) {
			console.error('Unexpected error in updateUser action:', e);
			return fail(500, { error: 'An unexpected server error occurred. Please check the logs.' });
		}
	},

	deleteUser: async ({ request, locals: { getSession } }) => {
		try {
			const session = await getSession();
			if (!session) {
				return fail(401, { error: 'Unauthorized' });
			}

			// Check if the current user is an admin
			const isAdmin = session.user.user_metadata?.role === 'admin';
			if (!isAdmin) {
				return fail(403, { error: 'Forbidden' });
			}

			const formData = await request.formData();
			const userId = formData.get('userId') as string;

			if (!userId) {
				return fail(400, { error: 'Missing user ID' });
			}

			// Prevent admin from deleting themselves
			if (userId === session.user.id) {
				return fail(400, { error: 'Cannot delete your own account' });
			}

			const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

			// TEMPORARILY DISABLED: Ensure the current user is an admin before proceeding
			// const { data: { user: adminUser }, error: adminUserError } = await supabaseAdmin.auth.admin.getUserById(session.user.id);
			// if (adminUserError || adminUser?.user_metadata?.role !== 'admin') {
			// 	return fail(403, { error: 'Forbidden' });
			// }

			// Delete the user from auth.users
			const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);

			if (deleteAuthError) {
				return fail(500, { error: deleteAuthError.message });
			}

			return { success: true };
		} catch (e) {
			console.error('Unexpected error in deleteUser action:', e);
			return fail(500, { error: 'An unexpected server error occurred. Please check the logs.' });
		}
	}
};