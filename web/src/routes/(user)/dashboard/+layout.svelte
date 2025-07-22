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

	async function handleSignout() {
		try {
			// Clear client stores first
			userStore.set(null);
			sessionStore.set(null);
			// authStore.set(null); // This line was removed from the new_code, so it's removed here.

			// Then sign out from Supabase
			const { error } = await supabase.auth.signOut();
			if (error) {
				console.error('❌ [Dashboard] Signout error:', error);
			}
		} catch (error) {
			console.error('❌ [Dashboard] Signout error:', error);
		}
	}

	onMount(async () => {
		try {
			// Initialize user store with server data
			if (data.user) {
				userStore.set(data.user as any);
			}
		} catch (error) {
			console.error('❌ [Dashboard] Error initializing user store:', error);
		}
	});

	$: if ($userStore !== data.user) {
		// Update user store when server data changes
		userStore.set(data.user as any);
	}

	$: if (!$userStore && !data.user) {
		// User signed out, redirect to signin
		goto('/auth/signin');
	}
</script>

<AppNav isAdmin={data.isAdmin} on:signout={handleSignout}>
	<!-- Main content area -->
	<div class="min-h-screen bg-gray-50 p-6 dark:bg-gray-900">
		<slot />
	</div>
</AppNav>
