<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { beforeNavigate, afterNavigate } from '$app/navigation';
	import { initializeTheme } from '$lib/stores/app-state.svelte';
	import { suppressDeprecationWarnings } from '$lib/utils/suppress-warnings';
	import { Toaster } from 'svelte-sonner';
	import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';
	import { serviceAdapter } from '$lib/services/service-layer-adapter';
	import { initializeI18n } from '$lib/i18n';

	onMount(async () => {
		// Initialize theme
		initializeTheme();
		// Suppress deprecation warnings from third-party libraries
		suppressDeprecationWarnings();

		// Initialize i18n system
		try {
			await initializeI18n();
		} catch (error) {
			console.error('❌ [ROOT] Failed to initialize i18n system:', error);
		}

		// Initialize client-side service layer
		try {
			await serviceAdapter.initialize();
		} catch (error) {
			console.error('❌ [ROOT] Failed to initialize client service layer:', error);
		}
	});

	// Track page changes using modern navigation lifecycle (without debug logging)
	beforeNavigate(({ from, to }) => {
		// Navigation started
	});

	afterNavigate(({ from, to }) => {
		// Navigation completed
	});
</script>

<Toaster richColors />

<ErrorBoundary
	fallback="Something went wrong with the application. Please try refreshing the page."
>
	<slot />
</ErrorBoundary>
