import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

export const load: PageServerLoad = async ({ locals }) => {
	// Check if user is already authenticated
	const session = await locals.getSession();

	// If user is already authenticated, redirect to dashboard
	if (session?.user) {
		throw redirect(302, '/dashboard');
	}

	// Create Supabase admin client to check for existing users
	const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

	// Check if any users exist
	const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
		page: 1,
		perPage: 1
	});

	if (error) {
		console.error('Error checking for existing users:', error);
		// If we can't check, assume setup is needed
		throw redirect(302, '/setup');
	}

	const hasUsers = users && users.length > 0;

	// If no users exist, redirect to setup
	if (!hasUsers) {
		throw redirect(302, '/setup');
	}

	// If users exist, continue to landing page
	return {
		session: null
	};
};