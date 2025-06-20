import { writable } from 'svelte/store';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '$lib/supabase';

export const userStore = writable<User | null>(null);
export const sessionStore = writable<Session | null>(null);

// Initialize auth state
async function initializeAuth() {
	console.log('🔐 [AUTH] Initializing auth state...');
	try {
		const { data: { session }, error } = await supabase.auth.getSession();

		if (error) {
			console.error('❌ [AUTH] Error getting session:', error);
			return;
		}

		console.log('🔐 [AUTH] Initial session:', session ? 'Found' : 'None');
		if (session) {
			console.log('🔐 [AUTH] User email:', session.user.email);
		}
		sessionStore.set(session);
		userStore.set(session?.user ?? null);
	} catch (error) {
		console.error('❌ [AUTH] Error initializing auth:', error);
	}
}

// Initialize on import
initializeAuth();

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
	console.log('🔄 [AUTH] Auth state change:', event, session ? 'Session present' : 'No session');
	if (session) {
		console.log('🔄 [AUTH] User email:', session.user.email);
	}
	sessionStore.set(session);
	userStore.set(session?.user ?? null);
});