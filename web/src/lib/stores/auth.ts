import { writable } from 'svelte/store';
import type { User, Session } from '@supabase/supabase-js';
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

	supabase.auth.onAuthStateChange(async (event, session) => {
		console.log('[AuthStore] Auth state change:', event, session ? 'session present' : 'no session');
		// Update session store
		sessionStore.set(session);

		// Always use getUser() for security, regardless of the session parameter
		const userResponse = await supabase.auth.getUser();
		const user = userResponse?.data.user ?? null;
		console.log('[AuthStore] getUser result:', user ? 'user present' : 'no user');
		set(user as AuthStore | null);

		if (user) {
			await initializeUser(user);
		}
	});

	return {
		subscribe
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
		const { data: { session }, error } = await supabase.auth.getSession();
		if (error) {
			console.error('[SessionStore] Error getting initial session:', error);
		} else {
			console.log('[SessionStore] Initial session:', session ? 'present' : 'null');
			sessionStore.set(session);
		}
	} catch (error) {
		console.error('[SessionStore] Failed to initialize session store:', error);
	} finally {
		console.log('[SessionStore] Marking as ready');
		sessionStoreReady.set(true);
	}
}

// Initialize immediately
initializeSessionStore();

// Store for tracking 2FA flow state
export const isInTwoFactorFlow = writable<boolean>(false);