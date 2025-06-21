import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isDatabaseInitialized, isFirstUserCreated } from '$lib/services/admin.service';

export const load: PageServerLoad = async ({ locals: { getSession, supabase } }) => {
	const session = await getSession();
	const dbInitialized = await isDatabaseInitialized(supabase);

	if (dbInitialized) {
		const firstUserCreated = await isFirstUserCreated(supabase);
		if (firstUserCreated) {
			if (session) {
				redirect(303, '/dashboard');
			} else {
				redirect(303, '/auth/signin');
			}
		}
	}

	return {
		user: session?.user,
		dbInitialized,
		session
	};
};