import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse, notFoundResponse } from '$lib/utils/api/response';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		// Get the user from the session
		const session = await locals.getSession();

		if (!session?.user) {
			return errorResponse('Unauthorized', 401);
		}

		// Create a Supabase client with service role key for admin operations
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Check if the current user is an admin by checking their user metadata
		const isAdmin = session.user.user_metadata?.role === 'admin';

		if (!isAdmin) {
			return errorResponse('Forbidden', 403);
		}

		// Get pagination parameters from URL
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '10');
		const search = url.searchParams.get('search') || '';

		console.log('API - Search parameter:', search);
		console.log('API - All URL params:', Object.fromEntries(url.searchParams.entries()));

		// Fetch all users (we'll need to get all to implement proper search)
		// Note: Supabase Auth listUsers doesn't support server-side filtering
		const { data: { users: authUsers }, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers({
			page: 1,
			perPage: 1000, // Get a large number to implement proper search
		});

		if (authUsersError) {
			console.error('Error fetching auth users:', authUsersError);
			return successResponse({
				users: [],
				pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false }
			});
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

		// Apply search filter
		const filteredUsers = search
			? combinedUsers.filter(u =>
					u.email?.toLowerCase().includes(search.toLowerCase()) ||
					u.full_name?.toLowerCase().includes(search.toLowerCase())
				)
			: combinedUsers;

		console.log('API - Total users:', combinedUsers.length);
		console.log('API - Filtered users:', filteredUsers.length);
		console.log('API - Search term:', search);

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

	} catch (error) {
		console.error('Error in users API:', error);
		return errorResponse(error);
	}
};

export const PUT: RequestHandler = async ({ request }) => {
  try {
    const { userId, email, fullName, role } = await request.json();

    if (!userId || !email || !fullName || !role) {
      return validationErrorResponse('Missing required fields');
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the user to preserve existing metadata
    const { data: { user }, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (getUserError || !user) {
      return notFoundResponse('User not found');
    }

    // Update the user
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email,
      user_metadata: {
        ...user.user_metadata,
        role,
        full_name: fullName
      }
    });

    if (updateError) {
      return errorResponse(updateError.message, 500);
    }

    return successResponse({
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Admin user update error:', error);
    return errorResponse(error);
  }
};