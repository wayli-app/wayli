import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createServerClient } from '$lib/core/supabase/server-client';
import { DatabaseMigrationService } from '$lib/services/database/migration.service';

export const load: PageServerLoad = async ({ locals: { getSession } }) => {
	const session = await getSession();

	// Use server-side Supabase client for admin operations
	const supabaseAdmin = createServerClient();

	// Check database health using the new migration service
	let dbHealth = null;
	try {
		dbHealth = await DatabaseMigrationService.checkDatabaseHealth();
	} catch (error) {
		console.error('Error checking database health:', error);
		dbHealth = {
			healthy: false,
			initialized: false,
			errors: ['Failed to check database health']
		};
	}

	// If database is healthy and initialized, check if first user exists
	if (dbHealth?.healthy && dbHealth?.initialized) {
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
		dbHealth,
		session,
		message: dbHealth?.healthy && dbHealth?.initialized
			? 'Database is ready'
			: dbHealth?.healthy
				? 'Database connection is ready, but needs initialization'
				: 'Database needs initialization',
		error: dbHealth?.errors.length > 0 ? dbHealth.errors.join(', ') : null
	};
};