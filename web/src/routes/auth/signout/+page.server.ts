import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase }, cookies }) => {
	console.log('[Signout] Server-side signout initiated');

	// Sign out the user
	const { error } = await supabase.auth.signOut();

	if (error) {
		console.error('[Signout] Error signing out:', error);
		// Even if there's an error, redirect to landing page
		throw redirect(302, '/');
	}

	console.log('[Signout] User signed out successfully on server');

	// Clear any auth-related cookies to ensure client-side session is cleared
	cookies.delete('sb-access-token', { path: '/' });
	cookies.delete('sb-refresh-token', { path: '/' });

	// Redirect to landing page
	throw redirect(302, '/');
};
