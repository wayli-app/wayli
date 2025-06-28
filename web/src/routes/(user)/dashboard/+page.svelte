<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		// Automatically redirect to trips page when visiting /dashboard
		goto('/dashboard/statistics', { replaceState: true });
	});
</script>

<!-- This content will briefly show before redirect -->
<div class="flex items-center justify-center min-h-[400px]">
	<div class="text-center">
		<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
		<p class="text-gray-600 dark:text-gray-400">Redirecting to trips...</p>
	</div>
</div>