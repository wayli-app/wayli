import { redirect } from '@sveltejs/kit';

import { supabase } from '$lib/core/supabase/server';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Get the user from the session
	const session = await locals.getSession();

	if (!session?.user) {
		throw redirect(302, '/auth/signin');
	}

	// Check if the current user is an admin by checking their profile
	const { data: profile, error } = await supabase
		.from('user_profiles')
		.select('role')
		.eq('id', session.user.id)
		.single();

	if (error) {
		console.error('Error fetching user profile:', error);
		throw redirect(302, '/dashboard/statistics');
	}

	const isAdmin = profile?.role === 'admin';

	if (!isAdmin) {
		throw redirect(302, '/dashboard/statistics');
	}

	return {
		user: session.user,
		isAdmin: isAdmin
	};
};
