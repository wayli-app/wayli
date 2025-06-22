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

	supabase.auth.onAuthStateChange(async (event) => {
		// Always use getUser() for security, regardless of the session parameter
		const userResponse = await supabase.auth.getUser();
		const user = userResponse?.data.user ?? null;
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

// Store for tracking 2FA flow state
export const isInTwoFactorFlow = writable<boolean>(false);