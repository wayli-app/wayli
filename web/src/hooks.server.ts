import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				get: (key: string) => {
					const value = event.cookies.get(key);
					return value;
				},
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
		try {
			// First get the session to check if we have auth cookies
			const {
				data: { session },
				error: sessionError
			} = await event.locals.supabase.auth.getSession();

			if (sessionError) {
				console.error('[Hooks] Error getting session:', sessionError);
				return null;
			}

			if (!session) {
				console.log('[Hooks] No session found');
				return null;
			}

			// For security, verify the user by calling getUser() which contacts the auth server
			const {
				data: { user },
				error: userError
			} = await event.locals.supabase.auth.getUser();

			if (userError) {
				console.error('[Hooks] Error getting user:', userError);
				return null;
			}

			if (!user) {
				console.log('[Hooks] No user found after verification');
				return null;
			}

			// Return a session-like object with the authenticated user data
			return {
				user,
				access_token: session.access_token,
				refresh_token: session.refresh_token,
				expires_in: session.expires_in,
				token_type: session.token_type,
				expires_at: session.expires_at
			};
		} catch (error) {
			console.error('[Hooks] Unexpected error in getSession:', error);
			return null;
		}
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range';
		}
	});
};
