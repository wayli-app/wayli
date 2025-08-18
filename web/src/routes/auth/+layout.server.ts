import { redirect } from '@sveltejs/kit';

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { getSession } }) => {
	// Check if user is already authenticated
	const session = await getSession();

	if (session?.user) {
		// User is already authenticated, redirect to dashboard
		throw redirect(302, '/dashboard/statistics');
	}

	// User is not authenticated, show auth page
	return {
		session: null
	};
};
