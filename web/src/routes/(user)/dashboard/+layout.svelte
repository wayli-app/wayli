<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';

	import AppNav from '$lib/components/AppNav.svelte';
	import AiDrawer from '$lib/components/ai/AiDrawer.svelte';
	import { aiDrawer, type AiPage } from '$lib/stores/ai-drawer';
	import OnboardingChecklistBanner from '$lib/components/OnboardingChecklistBanner.svelte';
	import { Sparkles } from 'lucide-svelte';
	import { t, changeLocale, type SupportedLocale } from '$lib/i18n';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { sessionManager } from '$lib/services/session';
	import { suppressDeprecationWarnings } from '$lib/utils/suppress-warnings';
	import { userStore, sessionStore } from '$lib/stores/auth';
	import { reconnectedStore } from '$lib/stores/job-store';
	import { fluxbase } from '$lib/fluxbase';

	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { fade } from 'svelte/transition';

	// Snippet prop for rendering children
	let { children }: { children: Snippet } = $props();

	// No server-side data needed - everything is client-side

	// Admin role state
	let isAdmin = $state(false);
	let isCheckingAdmin = $state(true);

	// AI feature state
	let aiEnabled = $state(true); // Default to true until we know otherwise
	// One-time discoverability hint on the AI FAB: a pulse + "new" badge until
	// the user opens the drawer (or dismisses). Persisted in localStorage so it
	// doesn't nag returning users. Initialized false (SSR-safe) and read in
	// onMount — localStorage isn't available during server rendering.
	let aiFabHintDismissed = $state(false);

	let isInitializing = true;

	async function handleSignout() {
		try {
			// Clear client session first to avoid stale UI
			await fluxbase.auth.signOut();
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
			if (!$userStore) {
				isAdmin = false;
				isCheckingAdmin = false;
				return;
			}

			const { data: userProfile, error } = await fluxbase
				.from<Record<string, any>>('user_profiles')
				.select('role')
				.eq('id', $userStore.id)
				.single();

			if (error) {
				console.warn('⚠️ [Dashboard] Could not check admin role:', error.message);
				isAdmin = false;
			} else {
				isAdmin = userProfile?.role === 'admin';
			}
		} catch (error) {
			console.error('❌ [Dashboard] Error checking admin role:', error);
			isAdmin = false;
		} finally {
			if (!layoutDestroyed) {
				isCheckingAdmin = false;
			}
		}
	}

	// Load user preferences and apply language
	async function loadUserPreferences() {
		try {
			const session = await fluxbase.auth.getSession();
			if (!session.data?.session) return;

			const serviceAdapter = new ServiceAdapter({ session: session.data.session });
			const preferencesResult = await serviceAdapter.getPreferences();

			if (preferencesResult && typeof preferencesResult === 'object') {
				const preferencesData = (preferencesResult as any).data || preferencesResult;
				const userLanguage = preferencesData?.language;

				if (userLanguage && ['en', 'nl', 'es'].includes(userLanguage)) {
					await changeLocale(userLanguage as SupportedLocale);
				}
			}
		} catch (error) {
			console.error('❌ [Dashboard] Error loading user preferences:', error);
		}
	}

	// Check if AI features are enabled
	async function checkAIEnabled() {
		try {
			const session = await fluxbase.auth.getSession();
			if (!session.data?.session) return;

			const serviceAdapter = new ServiceAdapter({ session: session.data.session });
			aiEnabled = await serviceAdapter.isAIEnabled();
		} catch (error) {
			console.error('❌ [Dashboard] Error checking AI enabled:', error);
			// Default to false if we can't determine
			aiEnabled = false;
		}
	}

	// ponytail: route-aware AI context. The chatbot only defines explicit page
	// contexts for `default` and `plan`; other labels still drive the drawer's
	// badge + suggestions and the per-message context header. The plan page sets
	// its own richer context (trip_id, cities, …) so we never override it here —
	// we only seed a page label for non-plan routes so the assistant knows what
	// surface the user is on (statistics / trips / journal / …).
	function pageLabelFromPath(pathname: string): AiPage {
		if (pathname.endsWith('/location-data') || pathname.endsWith('/statistics'))
			return 'statistics';
		if (/\/dashboard\/travel(\/|$|\?)/.test(pathname) && !pathname.includes('/plan'))
			return 'trips';
		if (pathname.includes('/want-to-visit')) return 'want-to-visit';
		if (pathname.includes('/journal')) return 'journal';
		return 'default';
	}

	$effect(() => {
		// Re-derive whenever the route changes.
		const pathname = page.url.pathname;
		const label = pageLabelFromPath(pathname);
		const current = $aiDrawer.pageContext;
		// Don't clobber the plan page's richer context, and avoid redundant updates.
		if (label === 'plan') return;
		if (current.page === label && current.trip_id == null) return;
		// Only auto-seed generic routes; pages with their own handlers opt in.
		aiDrawer.setContext({ page: label });
	});

	// Dismiss the FAB discoverability hint the first time the drawer opens,
	// regardless of how it was opened (button, onboarding step, store call).
	$effect(() => {
		if ($aiDrawer.open && !aiFabHintDismissed) {
			aiFabHintDismissed = true;
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('wayli.ai.fab_hint_dismissed', '1');
			}
		}
	});

	let layoutDestroyed = false;
	onDestroy(() => {
		layoutDestroyed = true;
	});

	onMount(async () => {
		// Read the persisted FAB-hint dismissal now that we're in the browser.
		aiFabHintDismissed = localStorage.getItem('wayli.ai.fab_hint_dismissed') === '1';
		try {
			// Session manager is already initialized in root layout
			// Wait a bit for any pending auth state changes to settle
			await new Promise((resolve) => setTimeout(resolve, 100));
			if (layoutDestroyed) return;

			// Check if user is authenticated using session manager
			const isAuthenticated = await sessionManager.isAuthenticated();

			if (!isAuthenticated) {
				goto('/auth/signin');
				return;
			}

			// Load user preferences and apply language
			await loadUserPreferences();
			if (layoutDestroyed) return;

			// Check if AI features are enabled
			await checkAIEnabled();
			if (layoutDestroyed) return;

			// Check admin role with timeout
			const adminCheckPromise = checkAdminRole();
			const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second timeout

			await Promise.race([adminCheckPromise, timeoutPromise]);
			if (layoutDestroyed) return;

			// If we hit the timeout, force completion
			if (isCheckingAdmin) {
				console.warn('⚠️ [Dashboard] Admin role check timed out, proceeding anyway');
				isCheckingAdmin = false;
				isAdmin = false;
			}

			// Mark initialization as complete
			isInitializing = false;
		} catch (error) {
			if (!layoutDestroyed) {
				console.error('❌ [Dashboard] Error initializing dashboard:', error);
				goto('/auth/signin');
			}
		}
	});

	$effect(() => {
		// Only check authentication after initialization is complete
		if (isInitializing) return;

		// Debounce: during HMR the stores briefly reset to null.
		// Wait before redirecting so the session can re-populate them.
		if (!$userStore && !$sessionStore) {
			const timer = setTimeout(() => {
				if (!$userStore && !$sessionStore) {
					goto('/auth/signin');
				}
			}, 1500);
			return () => clearTimeout(timer);
		}
	});

	// Check admin role whenever user changes
	$effect(() => {
		if ($userStore && !isCheckingAdmin) {
			checkAdminRole();
		}
	});

	// Show toast when realtime connection is re-established
	$effect(() => {
		if ($reconnectedStore) {
			toast.success(t('realtime.reconnected'));
			reconnectedStore.set(false);
		}
	});

	// Listen for AI configuration changes
	$effect(() => {
		const handleAIConfigChange = () => {
			console.log('[Dashboard] AI configuration changed, re-checking AI status');
			checkAIEnabled();
		};

		window.addEventListener('ai-config-changed', handleAIConfigChange);

		return () => {
			window.removeEventListener('ai-config-changed', handleAIConfigChange);
		};
	});

	// Cleanup is handled by Fluxbase SDK
</script>

<AppNav {isAdmin} onSignout={handleSignout}>
	<!-- Onboarding Checklist Banner (above main content) -->
	{#if $userStore?.id && !isCheckingAdmin}
		<OnboardingChecklistBanner userId={$userStore.id} {isAdmin} {aiEnabled} />
	{/if}

	<!-- Main content area: always render children so the slot is never
	     conditionally destroyed/recreated (which crashes Svelte's DOM
	     reconciliation when a child page is mid-async-mount). The loading
	     spinner overlays on top instead. -->
	<div class="bg-background min-h-screen p-6">
		<div>
			{@render children()}
		</div>
		{#if isCheckingAdmin}
			<div
				class="bg-background absolute inset-0 top-14 flex items-center justify-center"
				style="z-index: 10;"
			>
				<div class="text-center">
					<div
						class="border-primary mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2"
					></div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Global floating AI button (bottom-right) — opens the AI drawer -->
	{#if aiEnabled && !isCheckingAdmin}
		<button
			type="button"
			onclick={() => {
				aiDrawer.toggle();
				if (!aiFabHintDismissed) {
					aiFabHintDismissed = true;
					localStorage.setItem('wayli.ai.fab_hint_dismissed', '1');
				}
			}}
			class="bg-primary hover:bg-primary/90 text-primary-foreground fixed right-6 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all hover:scale-105 {!aiFabHintDismissed
				? 'animate-pulse'
				: ''}"
			style="bottom: calc(1.5rem + env(safe-area-inset-bottom)); right: calc(1.5rem + env(safe-area-inset-right))"
			aria-label={t('common.navigation.ask') || 'AI'}
			title={t('common.navigation.ask') || 'AI'}
		>
			<Sparkles class="h-6 w-6" />
			{#if !aiFabHintDismissed}
				<span
					class="bg-primary ring-background absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ring-2"
				>
					{t('common.badges.new')}
				</span>
			{/if}
		</button>
	{/if}

	<!-- Global AI drawer (mounted once; controlled by aiDrawer store) -->
	<AiDrawer />
</AppNav>
