import { writable } from 'svelte/store';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from '$lib/supabase';
import type { UserProfile } from '$lib/types/user.types';

type AuthStore = User & Partial<Pick<UserProfile, 'full_name' | 'avatar_url' | 'role'>>;

function createAuthStore() {
	const { subscribe, set, update } = writable<AuthStore | null>(null);

	async function initializeUser(user: User) {
		// Get profile data from user_metadata
		const metadata = user.user_metadata || {};

		update((current) => {
			if (!current) return null;
			return {
				...current,
				full_name: metadata.full_name,
				avatar_url: metadata.avatar_url,
				role: metadata.role
			};
		});
	}

	function handleAuthStateChange(event: AuthChangeEvent, session: Session | null) {
		console.log(
			'[AuthStore] Auth state change:',
			event,
			session ? 'session present' : 'no session'
		);

		// Update session store
		sessionStore.set(session);

		// Handle different auth events appropriately
		if (event === 'SIGNED_IN' && session) {
			console.log('[AuthStore] User signed in, verifying with server...');
			const sessionUser = session.user;
			console.log('[AuthStore] Setting user from session immediately:', sessionUser.email);
			set(sessionUser as AuthStore | null);
			// Now verify with the server asynchronously
			verifyUserWithServer();
		} else if (event === 'SIGNED_OUT' || !session) {
			console.log('[AuthStore] User signed out or no session, clearing store');
			set(null);
			sessionStore.set(null);
		} else {
			console.log('[AuthStore] Other auth event, verifying user...');
			verifyUserWithServer();
		}
	}

	async function verifyUserWithServer() {
		try {
			const userResponse = await supabase.auth.getUser();
			const verifiedUser = userResponse?.data.user ?? null;
			console.log(
				'[AuthStore] getUser verification result:',
				verifiedUser ? 'user verified' : 'verification failed'
			);
			if (verifiedUser) {
				console.log('[AuthStore] Verified user email:', verifiedUser.email);
				set(verifiedUser as AuthStore | null);
				await initializeUser(verifiedUser);
			} else {
				console.log('[AuthStore] Verification failed, keeping session user');
			}
		} catch (error) {
			console.error('[AuthStore] Error verifying user:', error);
		}
	}

	supabase.auth.onAuthStateChange(handleAuthStateChange);

	return {
		subscribe,
		set
	};
}

export const userStore = createAuthStore();

// Session store for tracking the current session
export const sessionStore = writable<Session | null>(null);

// Store to track if session store is ready
export const sessionStoreReady = writable<boolean>(false);

// Initialize session store with current session
async function initializeSessionStore() {
	try {
		console.log('[SessionStore] Initializing...');
		const {
			data: { session },
			error
		} = await supabase.auth.getSession();
		if (error) {
			console.error('[SessionStore] Error getting initial session:', error);
			sessionStore.set(null);
			userStore.set(null);
		} else {
			console.log('[SessionStore] Initial session:', session ? 'present' : 'null');
			sessionStore.set(session);

			// Also initialize the user store with the session user
			if (session?.user) {
				console.log('[SessionStore] Setting initial user:', session.user.email);
				userStore.set(session.user as AuthStore);
			} else {
				console.log('[SessionStore] No user in session, clearing user store');
				userStore.set(null);
			}
		}
	} catch (error) {
		console.error('[SessionStore] Failed to initialize session store:', error);
		sessionStore.set(null);
		userStore.set(null);
	} finally {
		console.log('[SessionStore] Marking as ready');
		sessionStoreReady.set(true);
	}
}

// Initialize immediately
initializeSessionStore();

// Store for tracking 2FA flow state
export const isInTwoFactorFlow = writable<boolean>(false);
