import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { supabase } from '$lib/core/supabase/server';

export const load: LayoutServerLoad = async ({ locals: { getSession } }) => {
	const session = await getSession();
	if (!session) {
		redirect(303, '/auth/signin');
	}

	// Get user profile to check admin role using centralized client
	const { data: profile, error } = await supabase
		.from('user_profiles')
		.select('role')
		.eq('id', session.user.id)
		.single();

	if (error) {
		console.error('Error fetching user profile:', error);
	}

	// Check if user is admin from profile role
	const isAdmin = profile?.role === 'admin';

	return {
		user: session.user,
		isAdmin,
		session
	};
};
