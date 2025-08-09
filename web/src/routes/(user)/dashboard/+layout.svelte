<script lang="ts">
	import { userStore, sessionStore } from '$lib/stores/auth';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import AppNav from '$lib/components/AppNav.svelte';
	import JobTracker from '$lib/components/JobTracker.svelte';
	import { onMount, onDestroy } from 'svelte';
	import type { PageData } from './$types';
	import { page } from '$app/stores';
	import { changeLocale, type SupportedLocale } from '$lib/i18n';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';

	let { data } = $props<{ data: PageData }>();

	let unsubscribe: (() => void) | null = null;
	let globalJobTracker: JobTracker;

	async function handleSignout() {
		try {
			// Clear client stores first
			userStore.set(null);
			sessionStore.set(null);
			// authStore.set(null); // This line was removed from the new_code, so it's removed here.

			// Then redirect to server-side signout endpoint
			goto('/auth/signout');
		} catch (error) {
			console.error('❌ [Dashboard] Signout error:', error);
			// Even if there's an error, try to redirect to signout
			goto('/auth/signout');
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
			// Initialize user store with server data
			if (data.user) {
				userStore.set(data.user as any);
			}

			// Load user preferences and apply language
			await loadUserPreferences();
		} catch (error) {
			console.error('❌ [Dashboard] Error initializing user store:', error);
		}
	});

	$effect(() => {
		if ($userStore !== data.user) {
			// Update user store when server data changes
			userStore.set(data.user as any);
		}
	});

	$effect(() => {
		if (!$userStore && !data.user) {
			// User signed out, redirect to signin
			goto('/auth/signin');
		}
	});
</script>

<AppNav isAdmin={data.isAdmin} on:signout={handleSignout}>
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
