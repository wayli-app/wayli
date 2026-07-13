<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	onMount(() => {
		const tripId = page.params.tripId;
		goto('/dashboard/travel?trip=' + tripId, { replaceState: true });
	});
</script>
