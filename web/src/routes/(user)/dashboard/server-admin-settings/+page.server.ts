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
		throw redirect(302, '/dashboard/statistics');
	}

	// Get pagination parameters from URL
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '10');
	const search = url.searchParams.get('search') || '';

	console.log('Server load - Search parameter:', search);
	console.log('Server load - All URL params:', Object.fromEntries(url.searchParams.entries()));

	// Fetch all users (we'll need to get all to implement proper search)
	// Note: Supabase Auth listUsers doesn't support server-side filtering
	const {
		data: { users: authUsers },
		error: authUsersError
	} = await supabaseAdmin.auth.admin.listUsers({
		page: 1,
		perPage: 1000 // Get a large number to implement proper search
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
			role: (metadata.role as 'user' | 'admin' | 'moderator') || 'user',
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

	console.log('Server load - Total users:', combinedUsers.length);
	console.log('Server load - Filtered users:', filteredUsers.length);
	console.log('Server load - Search term:', search);

	// Calculate pagination
	const total = filteredUsers.length;
	const totalPages = Math.ceil(total / limit);
	const startIndex = (page - 1) * limit;
	const endIndex = startIndex + limit;
	const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

	return {
		user: session.user,
		isAdmin,
		users: paginatedUsers || [],
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
	addUser: async ({ request, locals: { getSession } }: { request: Request; locals: App.Locals }) => {
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
			const email = formData.get('email') as string;
			const firstName = formData.get('firstName') as string;
			const lastName = formData.get('lastName') as string;
			const role = formData.get('role') as string;

			if (!email || !firstName || !lastName || !role) {
				return fail(400, { error: 'Missing required fields' });
			}

			const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

			// Create a new user with a temporary password
			const tempPassword =
				Math.random().toString(36).slice(-10) +
				Math.random().toString(36).toUpperCase().slice(-2) +
				'1!';

			const { error } = await supabaseAdmin.auth.admin.createUser({
				email,
				password: tempPassword,
				email_confirm: true, // Auto-confirm email
				user_metadata: {
					first_name: firstName,
					last_name: lastName,
					role: role
				}
			});

			if (error) {
				return fail(500, { error: error.message });
			}

			// Note: Email notification functionality to be implemented in future version
			// User will need to reset their password on first login
			console.log('New user created with temporary password:', tempPassword);

			return { success: true };
		} catch (e) {
			console.error('Unexpected error in addUser action:', e);
			return fail(500, { error: 'An unexpected server error occurred. Please check the logs.' });
		}
	},

	updateUser: async ({ request, locals: { getSession } }: { request: Request; locals: App.Locals }) => {
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
			const firstName = formData.get('firstName') as string;
			const lastName = formData.get('lastName') as string;
			const role = formData.get('role') as string;

			if (!userId || !email || !role) {
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
					first_name: firstName,
					last_name: lastName
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

	deleteUser: async ({ request, locals: { getSession } }: { request: Request; locals: App.Locals }) => {
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
