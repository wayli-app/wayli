<script lang="ts">
	import { onMount } from 'svelte';

	import AppNav from '$lib/components/AppNav.svelte';
	import JobTracker from '$lib/components/JobTracker.svelte';
	import { changeLocale, type SupportedLocale } from '$lib/i18n';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { sessionManager } from '$lib/services/session';
	import { userStore, sessionStore } from '$lib/stores/auth';
	import { supabase } from '$lib/supabase';

	import { goto } from '$app/navigation';

	// No server-side data needed - everything is client-side

	let globalJobTracker: JobTracker;
	let isInitializing = true;

	async function handleSignout() {
		try {
			// Clear client session first to avoid stale UI
			await supabase.auth.signOut();
			userStore.set(null);
			sessionStore.set(null);
			// Redirect via full reload to ensure all components re-mount without auth state
			window.location.href = '/auth/signout';
		} catch (error) {
			console.error('❌ [Dashboard] Signout error:', error);
			window.location.href = '/auth/signout';
		}
	}

	// Load user preferences and apply language
	async function loadUserPreferences() {
		try {
			const session = await supabase.auth.getSession();
			if (!session.data.session) return;

			const serviceAdapter = new ServiceAdapter({ session: session.data.session });
			const preferencesResult = await serviceAdapter.getPreferences();

			if (preferencesResult && typeof preferencesResult === 'object') {
				const preferencesData = (preferencesResult as any).data || preferencesResult;
				const userLanguage = preferencesData?.language;

				if (userLanguage && ['en', 'nl'].includes(userLanguage)) {
					await changeLocale(userLanguage as SupportedLocale);
					console.log('🌍 [Dashboard] Applied user language preference:', userLanguage);
				}
			}
		} catch (error) {
			console.error('❌ [Dashboard] Error loading user preferences:', error);
		}
	}

	onMount(async () => {
		try {
			console.log('🚀 [Dashboard] Initializing dashboard...');

			// Wait for session manager to be fully initialized
			await sessionManager.initialize();
			console.log('✅ [Dashboard] Session manager initialized');

			// Wait a bit for any pending auth state changes to settle
			await new Promise(resolve => setTimeout(resolve, 100));

			// Check if user is authenticated using session manager
			const isAuthenticated = await sessionManager.isAuthenticated();
			console.log('🔐 [Dashboard] Authentication check result:', isAuthenticated);

			if (!isAuthenticated) {
				console.log('🚪 [Dashboard] User not authenticated, redirecting to signin');
				goto('/auth/signin');
				return;
			}

			// Load user preferences and apply language
			await loadUserPreferences();

			// Mark initialization as complete
			isInitializing = false;
			console.log('✅ [Dashboard] Dashboard initialization complete');
		} catch (error) {
			console.error('❌ [Dashboard] Error initializing dashboard:', error);
			goto('/auth/signin');
		}
	});

	$effect(() => {
		// Only check authentication after initialization is complete
		if (isInitializing) return;

		// Check authentication status and redirect if needed
		if (!$userStore && !$sessionStore) {
			console.log('🚪 [Dashboard] No user or session found, redirecting to signin');
			goto('/auth/signin');
		}
	});
</script>

<AppNav isAdmin={$userStore?.user_metadata?.role === 'admin'} onSignout={handleSignout}>
	<!-- Main content area -->
	<div class="min-h-screen bg-gray-50 p-6 dark:bg-gray-900">
		<slot />
	</div>
</AppNav>

<!-- Global JobTracker for all dashboard pages -->
<JobTracker
	bind:this={globalJobTracker}
	jobType={null}
	autoStart={true}
	showToasts={true}
	onJobUpdate={() => {}}
	onJobCompleted={() => {}}
/>
