import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				get: (key: string) => event.cookies.get(key),
				set: (key: string, value: string, options: Record<string, unknown>) => {
					event.cookies.set(key, value, { ...options, path: '/' });
				},
				remove: (key: string, options: Record<string, unknown>) => {
					event.cookies.delete(key, { ...options, path: '/' });
				}
			}
		}
	);

	/**
	 * Secure helper that authenticates the user by contacting the Supabase Auth server
	 * instead of relying on potentially insecure session data from cookies/storage
	 */
	event.locals.getSession = async () => {
		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();

		if (error || !user) {
			return null;
		}

		// Return a session-like object with the authenticated user data
		return {
			user,
			access_token: '', // We don't need the actual token for our use cases
			refresh_token: '',
			expires_in: 0,
			token_type: 'bearer',
			expires_at: 0
		};
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range';
		}
	});
};
