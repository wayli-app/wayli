<script lang="ts">
	import { userStore, sessionStore } from '$lib/stores/auth';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import AppNav from '$lib/components/AppNav.svelte';
	import JobTracker from '$lib/components/JobTracker.svelte';
	import { onMount, onDestroy } from 'svelte';
	import type { PageData } from './$types';
	import { page } from '$app/stores';

	let { data } = $props<{ data: PageData }>();

	let unsubscribe: (() => void) | null = null;
	let globalJobTracker: JobTracker;

	async function handleSignout() {
		try {
			// Clear client stores first
			userStore.set(null);
			sessionStore.set(null);
			// authStore.set(null); // This line was removed from the new_code, so it's removed here.

			// Then redirect to server-side signout endpoint
			goto('/auth/signout');
		} catch (error) {
			console.error('❌ [Dashboard] Signout error:', error);
			// Even if there's an error, try to redirect to signout
			goto('/auth/signout');
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

	$effect(() => {
		if ($userStore !== data.user) {
			// Update user store when server data changes
			userStore.set(data.user as any);
		}
	});

	$effect(() => {
		if (!$userStore && !data.user) {
			// User signed out, redirect to signin
			goto('/auth/signin');
		}
	});
</script>

<AppNav isAdmin={data.isAdmin} on:signout={handleSignout}>
	<!-- Main content area -->
	<div class="min-h-screen bg-gray-50 p-6 dark:bg-gray-900">
		<slot />
	</div>
</AppNav>

<!-- Global JobTracker for all dashboard pages -->
<JobTracker
	bind:this={globalJobTracker}
	jobType={null}
	autoStart={true}
	showToasts={true}
	onJobUpdate={() => {}}
	onJobCompleted={() => {}}
/>
