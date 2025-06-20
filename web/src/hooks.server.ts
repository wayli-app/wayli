import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { createClient } from '@supabase/supabase-js';
import { redirect, type HandleFetch } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Session } from '@supabase/supabase-js';

export const handle: Handle = async ({ event, resolve }) => {
	console.log('🔍 [HOOKS] Request to:', event.url.pathname);

	// Debug cookies
	const cookieHeader = event.request.headers.get('cookie') || '';

	// Parse individual cookies
	const cookies = cookieHeader.split(';').map(c => c.trim()).filter(c => c);

	// Check for Supabase session cookies
	const supabaseCookies = cookies.filter(c => c.startsWith('sb-'));

	// Try to extract the session data from the cookie
	const sessionCookie = supabaseCookies.find(c => c.includes('auth-token'));
	let session: Session | null = null;

	if (sessionCookie) {
		try {
			const cookieValue = sessionCookie.split('=')[1];
			const decoded = decodeURIComponent(cookieValue);

			// Parse the JSON session data
			const sessionData = JSON.parse(decoded);

			// Create a proper Session object
			session = {
				access_token: sessionData.access_token,
				refresh_token: sessionData.refresh_token,
				expires_in: sessionData.expires_in,
				expires_at: sessionData.expires_at,
				token_type: sessionData.token_type,
				user: sessionData.user
			};
		} catch (e) {
			console.log('🔍 [HOOKS] Error parsing session cookie:', e);
		}
	}

	// Create Supabase client with proper cookie handling
	event.locals.supabase = createClient(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_ANON_KEY,
		{
			global: {
				headers: {
					cookie: cookieHeader
				}
			}
		}
	);

	// Get session - use our parsed session or fallback to Supabase's method
	event.locals.getSession = async () => {
		if (session) {
			return session;
		}

		// Fallback to Supabase's method
		const {
			data: { session: supabaseSession },
			error
		} = await event.locals.supabase.auth.getSession();

		if (error) {
			console.log('🔍 [HOOKS] Session error:', error);
		}

		console.log('🔍 [HOOKS] Supabase session check result:', supabaseSession ? 'Session found' : 'No session');

		return supabaseSession;
	};

	// Handle authentication
	const finalSession = await event.locals.getSession();

	// Check if user is trying to access protected routes
	const isProtectedRoute = event.url.pathname.startsWith('/(user)') || event.url.pathname.startsWith('/dashboard');
	const isAuthRoute = event.url.pathname.startsWith('/auth');
	const isRootRoute = event.url.pathname === '/';

	console.log('🔍 [HOOKS] Route analysis:', {
		pathname: event.url.pathname,
		isProtectedRoute,
		isAuthRoute,
		isRootRoute,
		hasSession: !!finalSession
	});

	// Handle paraglide middleware
	return paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});
};

export const handleFetch: HandleFetch = async ({ request, fetch }) => {
	// Handle Supabase API requests
	if (request.url.includes('supabase.co') || request.url.includes('your-self-hosted-domain')) {
		// Add any custom headers or authentication here
	}

	return fetch(request);
};
