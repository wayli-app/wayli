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
		// Update session store
        sessionStore.set(session);

		// Handle different auth events appropriately
		if (event === 'SIGNED_IN' && session) {
			const sessionUser = session.user;
			set(sessionUser as AuthStore | null);
			// Now verify with the server asynchronously
			verifyUserWithServer();
		} else if (event === 'SIGNED_OUT' || !session) {
			set(null);
			sessionStore.set(null);
		} else {
			verifyUserWithServer();
		}
	}

	async function verifyUserWithServer() {
		try {
			const { data: { user: verifiedUser } } = await supabase.auth.getUser();

			if (verifiedUser) {
				set(verifiedUser as AuthStore | null);
				await initializeUser(verifiedUser);
			}
		} catch (error) {
			console.error('❌ [AuthStore] Error verifying user:', error);
		}
	}

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

// Initialize immediately
// Now that both stores exist, subscribe to auth changes
supabase.auth.onAuthStateChange((event, session) => {
    // Update session first
    sessionStore.set(session);
});

// Initialize immediately
initializeSessionStore();

// Store for tracking 2FA flow state
export const isInTwoFactorFlow = writable<boolean>(false);
