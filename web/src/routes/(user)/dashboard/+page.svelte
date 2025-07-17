<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		// Automatically redirect to trips page when visiting /dashboard
		goto('/dashboard/statistics', { replaceState: true });
	});
</script>

<!-- This content will briefly show before redirect -->
<div class="flex min-h-[400px] items-center justify-center">
	<div class="text-center">
		<div class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
		<p class="text-gray-600 dark:text-gray-400">Redirecting to trips...</p>
	</div>
</div>
