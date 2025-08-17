import { writable } from 'svelte/store';

import { supabase } from '$lib/supabase';

import type { UserProfile } from '$lib/types/user.types';
import type { Session, User } from '@supabase/supabase-js';

type AuthStore = User & Partial<Pick<UserProfile, 'full_name' | 'avatar_url' | 'role'>>;

function createAuthStore() {
	const { subscribe, set } = writable<AuthStore | null>(null);

	// Defer subscription until after sessionStore is declared

	return {
		subscribe,
		set
	};
}

// Session store for tracking the current session
export const sessionStore = writable<Session | null>(null);

export const userStore = createAuthStore();

// Store to track if session store is ready
export const sessionStoreReady = writable<boolean>(false);

// Initialize session store with current session
async function initializeSessionStore() {
	try {
		const {
			data: { session },
			error
		} = await supabase.auth.getSession();
		if (error) {
			console.error('❌ [SessionStore] Error getting initial session:', error);
			sessionStore.set(null);
			userStore.set(null);
		} else {
			sessionStore.set(session);

			// Also initialize the user store with the session user
			if (session?.user) {
				userStore.set(session.user as AuthStore);
			} else {
				userStore.set(null);
			}
		}
	} catch (error) {
		console.error('❌ [SessionStore] Failed to initialize session store:', error);
		sessionStore.set(null);
		userStore.set(null);
	} finally {
		sessionStoreReady.set(true);
	}
}

// Subscribe to auth changes to keep both stores in sync and enable redirects
supabase.auth.onAuthStateChange((event, session) => {
	// Update session first
	sessionStore.set(session);

	// Update user store for login/logout flows
	if (event === 'SIGNED_IN' && session) {
		userStore.set(session.user as AuthStore);
	} else if (event === 'SIGNED_OUT' || !session) {
		userStore.set(null);
		sessionStore.set(null);
	}
});

// Initialize immediately
initializeSessionStore();

// Store for tracking 2FA flow state
export const isInTwoFactorFlow = writable<boolean>(false);
