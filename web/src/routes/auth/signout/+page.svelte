<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { onMount } from 'svelte';

	import { userStore, sessionStore } from '$lib/stores/auth';

	onMount(() => {
		console.log('[Signout] Client-side signout page mounted - clearing stores');

		// Clear client-side stores immediately
		userStore.set(null);
		sessionStore.set(null);

		console.log('[Signout] Client stores cleared');
	});
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
	<div class="text-center">
		<Loader2 class="mx-auto mb-4 h-8 w-8 animate-spin text-[rgb(37,140,244)]" />
		<h2 class="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">Signing out...</h2>
		<p class="text-gray-600 dark:text-gray-400">Please wait while we sign you out.</p>
	</div>
</div>
