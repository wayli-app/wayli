import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { UserService } from '$lib/services/user.service';

export const load: LayoutServerLoad = async ({ locals: { getSession, supabase } }) => {
	const session = await getSession();
	if (!session) {
		redirect(303, '/auth/signin');
	}
	const isAdmin = await UserService.isUserAdmin(supabase, session.user.id);

	return {
		user: session.user,
		isAdmin,
		session
	};
};