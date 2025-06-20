import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	console.log('🖥️ [DASHBOARD-SERVER] Layout load called');
	const session = await locals.getSession();
	console.log('🖥️ [DASHBOARD-SERVER] Session check:', session ? `Found - ${session.user.email}` : 'None');

	if (!session || !session.user) {
		console.log('🚫 [DASHBOARD-SERVER] REDIRECTING: No session found');
		const currentPath = url.pathname;
		throw redirect(303, `/auth/signin?redirectTo=${encodeURIComponent(currentPath)}`);
	}

	// Create a Supabase client with service role key for admin operations
	const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

	try {
		// Check if the user is an admin using the role property from user metadata
		const isAdmin = session.user.user_metadata?.role === 'admin';

		console.log('✅ [DASHBOARD-SERVER] ALLOWING: Session found, returning user data');
		return {
			user: session.user,
			isAdmin,
			session
		};
	} catch (error) {
		console.error('Error checking admin status in layout:', error);
		// If we can't determine admin status, assume not admin
		return {
			user: session.user,
			isAdmin: false,
			session
		};
	}
};