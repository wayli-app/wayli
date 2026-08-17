<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { Toaster } from 'svelte-sonner';

	import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';
	import ReauthenticationModal from '$lib/components/ReauthenticationModal.svelte';
	import { initializeI18n } from '$lib/i18n';
	import { serviceAdapter } from '$lib/services/service-layer-adapter';
	import { sessionManager } from '$lib/services/session';
	import { initializeTheme } from '$lib/stores/app-state.svelte';
	import { loadPublicSettings } from '$lib/stores/settings.svelte';
	import { suppressDeprecationWarnings } from '$lib/utils/suppress-warnings';

	import { beforeNavigate, afterNavigate } from '$app/navigation';

	let { children }: { children: Snippet } = $props();

	onMount(async () => {
		// Suppress "Invalid or expired token" errors from Fluxbase SDK
		// These happen when a session expires while the user is on a public page
		window.addEventListener('unhandledrejection', (e) => {
			const msg = e.reason?.message || String(e.reason || '');
			if (msg.includes('Invalid or expired token') || msg.includes('JWT')) {
				e.preventDefault();
			}
		});

		// Initialize theme
		initializeTheme();
		// Suppress deprecation warnings from third-party libraries
		suppressDeprecationWarnings();

		// Initialize session management first
		try {
			await sessionManager.initialize();
		} catch (error) {
			console.error('❌ [ROOT] Failed to initialize session manager:', error);
		}

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

		// Fetch all visible wayli.* settings in one bulk request (cached in the
		// settings store). Fire-and-forget — public pages read from the cache via
		// fallbacks until it resolves, then re-render when values arrive. This
		// replaces the per-page fluxbase.settings.get('wayli.x') calls that each
		// fired a request and 404'd when the key was unset.
		try {
			await loadPublicSettings();
		} catch {
			// Non-fatal: callers fall back to defaults.
		}
	});

	// Track page changes using modern navigation lifecycle (without debug logging)
	beforeNavigate(() => {
		// Navigation started
	});

	afterNavigate(() => {
		// Navigation completed
	});
</script>

<svelte:head>
	<title>Wayli</title>
</svelte:head>

<Toaster richColors position="top-right" closeButton />

<ErrorBoundary>
	{@render children?.()}
</ErrorBoundary>

<!-- Global re-authentication modal for sensitive actions -->
<ReauthenticationModal />
