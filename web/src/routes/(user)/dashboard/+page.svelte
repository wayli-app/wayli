<script lang="ts">
	import { onMount } from 'svelte';

	import { translate } from '$lib/i18n';

	import { goto } from '$app/navigation';

	// Use the reactive translation function
	let t = $derived($translate);

	onMount(() => {
		// Land on Location Data when visiting /dashboard (also the post-login
		// destination and the target of the landing-page Dashboard buttons).
		goto('/dashboard/location-data', { replaceState: true });
	});
</script>

<!-- This content will briefly show before redirect -->
<div class="flex min-h-[400px] items-center justify-center">
	<div class="text-center">
		<div class="border-primary mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2"></div>
		<p class="text-muted-foreground">{t('statistics.redirectingToTrips')}</p>
	</div>
</div>
