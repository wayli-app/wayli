import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createServerClient } from '$lib/core/supabase/server-client';

export const load: PageServerLoad = async ({ locals: { getSession } }) => {
	const session = await getSession();

	// Use server-side Supabase client for admin operations
	const supabaseAdmin = createServerClient();

	// Check if database is initialized by trying to query the users table
	let dbInitialized = false;
	try {
		const { error } = await supabaseAdmin
			.from('users')
			.select('id')
			.limit(1);

		// If we get an error about the table not existing, the database isn't initialized
		if (error && error.code === '42P01') { // PostgreSQL table doesn't exist error
			dbInitialized = false;
		} else {
			dbInitialized = true;
		}
	} catch (error) {
		console.error('Error checking database initialization:', error);
		dbInitialized = false;
	}

	if (dbInitialized) {
		// Check if first user exists
		try {
			const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
				page: 1,
				perPage: 1
			});

			const firstUserCreated = !error && users.length > 0;

			if (firstUserCreated) {
				if (session) {
					redirect(303, '/dashboard');
				} else {
					redirect(303, '/auth/signin');
				}
			}
		} catch (error) {
			console.error('Error checking for first user:', error);
		}
	}

	return {
		user: session?.user,
		dbInitialized,
		session
	};
};