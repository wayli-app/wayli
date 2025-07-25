import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { getSession } }) => {
	// Check if user is already authenticated
	const session = await getSession();

	if (session?.user) {
		// User is already authenticated, redirect to dashboard
		throw redirect(302, '/dashboard/statistics');
	}

	// User is not authenticated, show signup page
	return {
		session: null
	};
};