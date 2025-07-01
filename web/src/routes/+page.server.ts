import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	console.log('[Root] Server load function called - always showing landing page');

	// Always show the landing page, regardless of authentication status
	// The landing page will handle its own UI based on auth state
	return {
		session: null
	};
};