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

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
	<div class="text-center">
		<Loader2 class="h-8 w-8 animate-spin text-[rgb(37,140,244)] mx-auto mb-4" />
		<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
			Signing out...
		</h2>
		<p class="text-gray-600 dark:text-gray-400">
			Please wait while we sign you out.
		</p>
	</div>
</div>