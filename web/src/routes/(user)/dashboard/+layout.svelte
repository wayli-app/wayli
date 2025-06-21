<script lang="ts">
	import { userStore } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import AppNav from '$lib/components/AppNav.svelte';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import { page } from '$app/stores';

	export let data: PageData;

	async function handleSignOut() {
		await supabase.auth.signOut();
		goto('/auth/signin');
	}

	onMount(() => {
		console.log('🏠 [DASHBOARD] Layout mounted');

		// Note: Server-side layout already validates authentication
		// Client-side redirects are not needed and can cause flashing
		// The server will redirect unauthenticated users before the page loads
	});
</script>

<AppNav isAdmin={data.isAdmin} on:signout={handleSignOut}>
	<!-- Main content area -->
	<div class="bg-gray-50 dark:bg-gray-900 min-h-screen p-6">
		<slot />
	</div>
</AppNav>
