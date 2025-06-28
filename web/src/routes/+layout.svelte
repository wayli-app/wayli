<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { beforeNavigate, afterNavigate } from '$app/navigation';
	import { initializeTheme } from '$lib/stores/app-state.svelte';
	import { suppressDeprecationWarnings } from '$lib/utils/suppress-warnings';
	import { Toaster } from 'svelte-sonner';

	onMount(() => {
		console.log('🌐 [ROOT] Layout mounted');
		// Initialize theme
		initializeTheme();
		// Suppress deprecation warnings from third-party libraries
		suppressDeprecationWarnings();
	});

	// Track page changes using modern navigation lifecycle
	beforeNavigate(({ from, to }) => {
		if (from && to) {
			console.log('🌐 [ROOT] Page navigation:', {
				from: from.url.pathname,
				to: to.url.pathname,
				searchParams: to.url.searchParams.toString()
			});
		}
	});

	afterNavigate(({ from, to }) => {
		if (from && to) {
			console.log('🌐 [ROOT] Navigation completed:', {
				from: from.url.pathname,
				to: to.url.pathname
			});
		}
	});
</script>

<Toaster richColors />

<slot />
