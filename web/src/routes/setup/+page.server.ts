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
		return {
			session: null,
			needsSetup: true,
			error: 'Unable to check system status'
		};
	}

	const hasUsers = users && users.length > 0;

	// If users already exist, redirect to login
	if (hasUsers) {
		throw redirect(302, '/auth/signin');
	}

	return {
		session: null,
		needsSetup: true,
		message: 'Welcome to Wayli! Please create your first admin account.'
	};
};