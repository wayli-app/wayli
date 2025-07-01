<script lang="ts">
	import { userStore, sessionStore } from '$lib/stores/auth';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import AppNav from '$lib/components/AppNav.svelte';
	import { onMount, onDestroy } from 'svelte';
	import type { PageData } from './$types';
	import { page } from '$app/stores';

	export let data: PageData;

	let unsubscribe: (() => void) | null = null;

	async function handleSignOut() {
		console.log('[Dashboard] Signout initiated - clearing client stores first');

		// Clear client-side stores immediately
		userStore.set(null);
		sessionStore.set(null);

		// Then redirect to server-side signout endpoint
		goto('/auth/signout');
	}

	onMount(() => {
		console.log('🏠 [DASHBOARD] Layout mounted');

		// Initialize user store with server-provided user data
		// This prevents the initial "no user" state from triggering redirects
		if (data.user && !get(userStore)) {
			console.log('[Dashboard] Initializing user store with server data');
			// Cast the user to AuthStore type to match the store's expected type
			userStore.set(data.user as any);
		}

		// Subscribe to auth state changes to handle sign-out events only
		// Don't redirect on initial null state since server already validated authentication
		let isInitialLoad = true;
		unsubscribe = userStore.subscribe((user) => {
			console.log('[Dashboard] User store updated:', user ? 'user present' : 'no user');

			// Skip the initial load to avoid redirecting when user store starts as null
			if (isInitialLoad) {
				isInitialLoad = false;
				console.log('[Dashboard] Skipping initial user store update');
				return;
			}

			// Only redirect if user is null (signed out) and we're on a dashboard page
			// This handles actual sign-out events, not initial loading
			if (!user && $page.url.pathname.startsWith('/dashboard')) {
				console.log('[Dashboard] User signed out, redirecting to signin');
				goto('/auth/signin', { replaceState: true });
			}
		});

		// Note: Server-side layout already validates authentication
		// Client-side redirects are only for handling sign-out events
		// The server will redirect unauthenticated users before the page loads
	});

	onDestroy(() => {
		if (unsubscribe) {
			unsubscribe();
		}
	});
</script>

<AppNav isAdmin={data.isAdmin} on:signout={handleSignOut}>
	<!-- Main content area -->
	<div class="bg-gray-50 dark:bg-gray-900 min-h-screen p-6">
		<slot />
	</div>
</AppNav>
