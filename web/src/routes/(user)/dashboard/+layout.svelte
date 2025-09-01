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

	// Admin role state
	let isAdmin = $state(false);
	let isCheckingAdmin = $state(true);

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

	// Check if the current user is an admin
	async function checkAdminRole() {
		try {
			console.log('🔐 [Dashboard] Starting admin role check, userStore:', !!$userStore);
			if (!$userStore) {
				console.log('🔐 [Dashboard] No userStore, skipping admin check');
				isAdmin = false;
				isCheckingAdmin = false;
				return;
			}

			const { data: userProfile, error } = await supabase
				.from('user_profiles')
				.select('role')
				.eq('id', $userStore.id)
				.single();

			if (error) {
				console.warn('⚠️ [Dashboard] Could not check admin role:', error.message);
				isAdmin = false;
			} else {
				isAdmin = userProfile?.role === 'admin';
				console.log('🔐 [Dashboard] Admin role check:', { role: userProfile?.role, isAdmin });
			}
		} catch (error) {
			console.error('❌ [Dashboard] Error checking admin role:', error);
			isAdmin = false;
		} finally {
			isCheckingAdmin = false;
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

				if (userLanguage && ['en', 'nl', 'es'].includes(userLanguage)) {
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

			// Session manager is already initialized in root layout
			// Wait a bit for any pending auth state changes to settle
			await new Promise((resolve) => setTimeout(resolve, 100));

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

			// Check admin role with timeout
			const adminCheckPromise = checkAdminRole();
			const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second timeout

			await Promise.race([adminCheckPromise, timeoutPromise]);

			// If we hit the timeout, force completion
			if (isCheckingAdmin) {
				console.warn('⚠️ [Dashboard] Admin role check timed out, proceeding anyway');
				isCheckingAdmin = false;
				isAdmin = false;
			}

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

	// Check admin role whenever user changes
	$effect(() => {
		if ($userStore && !isCheckingAdmin) {
			checkAdminRole();
		}
	});
</script>

<AppNav {isAdmin} onSignout={handleSignout}>
	<!-- Main content area -->
	<div class="min-h-screen bg-gray-50 p-6 dark:bg-gray-900">
		{#if isCheckingAdmin}
			<div class="flex h-64 items-center justify-center">
				<div class="text-center">
					<div
						class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"
					></div>
					<p class="text-gray-600 dark:text-gray-300">Checking permissions...</p>
				</div>
			</div>
		{:else}
			<slot />
		{/if}
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
