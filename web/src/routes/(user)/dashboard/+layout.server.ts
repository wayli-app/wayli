import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { getSession } }) => {
	const session = await getSession();
	if (!session) {
		redirect(303, '/auth/signin');
	}

	// Check if user is admin using their metadata directly
	const isAdmin = session.user.user_metadata?.role === 'admin';

	return {
		user: session.user,
		isAdmin,
		session
	};
};
