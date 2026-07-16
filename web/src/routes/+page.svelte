<script lang="ts">
	import {
		MapPin,
		BarChart,
		ArrowRight,
		LogIn,
		Sun,
		Moon,
		User,
		LogOut,
		Shield,
		Users,
		BookOpen,
		Calendar
	} from 'lucide-svelte';
	import { onMount } from 'svelte';

	import LanguageSelector from '$lib/components/ui/language-selector/index.svelte';
	import { translate, messages, currentLocale } from '$lib/i18n';
	import { setTheme, initializeTheme, state as appState } from '$lib/stores/app-state.svelte';
	import { userStore, sessionStore } from '$lib/stores/auth';
	import { fluxbase } from '$lib/fluxbase';
	import { readSetting } from '$lib/utils/settings';

	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	// Use the reactive translation function
	let t = $derived($translate);

	// Check if messages are loaded
	let messagesLoaded = $derived(Object.keys($messages).length > 0);

	// Track if checking user count
	let checkingUserCount = $state(true);

	// Track if initial auth state has resolved (prevents login-button flash for logged-in users)
	let authResolved = $state(false);
	let redirectChecked = $state(false);
	let latestEntries = $state<
		Array<{
			id: string;
			trip_id: string;
			title: string;
			body: string;
			entry_date: string;
			trip_title?: string;
			trip_image_url?: string | null;
			username?: string;
		}>
	>([]);

	// Local theme state for SSR compatibility
	let currentTheme = $state<'light' | 'dark'>('light');

	async function handleLogin() {
		goto('/auth/signin');
	}

	async function handleSignOut() {
		try {
			// Ensure client session/localStorage are cleared first
			await fluxbase.auth.signOut();
		} catch (e) {
			console.warn('🏠 [LANDING] Client signout warning:', e);
		}
		// Force navigation to server-side signout to clear SSR cookies and reload UI
		window.location.href = '/auth/signout';
	}

	async function checkSetupStatus() {
		try {
			// Read setup status from app.settings (RLS allows anonymous read for public settings).
			// readSetting treats "Setting not found" (fresh install) as null -> treated as not-complete.
			const isSetupComplete = await readSetting(() =>
				fluxbase.settings.get('wayli.is_setup_complete')
			);

			// Only redirect if setup is explicitly marked as incomplete
			// If the setting doesn't exist or is undefined, assume setup is complete
			// (landing page should be accessible by default)
			const setupValue = isSetupComplete?.value;
			if (setupValue === false || setupValue === 'false') {
				goto('/auth/signup');
				return;
			}
		} catch (error) {
			console.error('🏠 [LANDING] Error checking setup status:', error);
			// On error, don't redirect - let the user access the landing page
		} finally {
			checkingUserCount = false;
		}
	}

	onMount(() => {
		// Initialize theme
		initializeTheme();

		// Get current theme from localStorage or system preference
		if (browser) {
			const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
			if (savedTheme) {
				currentTheme = savedTheme;
			} else {
				const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				currentTheme = prefersDark ? 'dark' : 'light';
			}
		}

		// Check setup status first to see if initial setup is needed
		(async () => {
			// Check if a landing redirect is configured (admin setting)
			try {
				const redirectUser = await readSetting(() =>
					fluxbase.settings.get('wayli.landing_redirect_username')
				);

				// settings.get() already returns the unwrapped value (e.g. "bart")
				if (redirectUser && typeof redirectUser === 'string' && redirectUser.trim()) {
					// Use replaceState so the back button doesn't return to the landing page
					await goto(`/u/${redirectUser.trim()}`, { replaceState: true });
					return;
				}
			} catch {
				// Settings not available — show normal landing page.
			}

			redirectChecked = true;
			await checkSetupStatus();
		})();

		// Fetch latest public journal entries for the landing page
		(async () => {
			try {
				// First get public trips with entries
				const { data: publicTrips } = await fluxbase
					.from('trips')
					.select('id, title, image_url, user_id')
					.eq('visibility', 'public')
					.in('status', ['active', 'completed'])
					.order('start_date', { ascending: false })
					.limit(10);

				const tripsList = (publicTrips as any[]) ?? [];
				if (tripsList.length === 0) return;

				const tripIds = tripsList.map((t) => t.id);
				const { data: entries } = await fluxbase
					.from('trip_entries')
					.select('id, trip_id, title, body, entry_date')
					.in('trip_id', tripIds)
					.eq('status', 'published')
					.order('entry_date', { ascending: false })
					.limit(6);

				const entriesList = (entries as any[]) ?? [];
				if (entriesList.length === 0) return;

				// Fetch usernames for the trip owners
				const userIds = [...new Set(tripsList.map((t) => t.user_id))];
				const { data: profiles } = await fluxbase
					.from('public_profiles')
					.select('id, username')
					.in('id', userIds);

				const profileMap = new Map<string, string>();
				for (const p of (profiles as any[]) ?? []) {
					profileMap.set(p.id, p.username);
				}

				const tripMap = new Map<string, any>();
				for (const t of tripsList) {
					tripMap.set(t.id, t);
				}

				latestEntries = entriesList.map((e) => {
					const trip = tripMap.get(e.trip_id);
					return {
						...e,
						trip_title: trip?.title,
						trip_image_url: trip?.image_url,
						username: trip ? profileMap.get(trip.user_id) : undefined
					};
				});
			} catch {
				// non-critical — landing page works without entries
			}
		})();

		// Resolve auth state so the top-right chrome doesn't flash the login button for logged-in users
		(async () => {
			try {
				await fluxbase.auth.getUser();
			} catch {
				// No session — show the login button.
			} finally {
				authResolved = true;
			}
		})();

		// Subscribe to user store for real-time updates
		const unsubscribe = userStore.subscribe((user) => {});

		// Also subscribe to session store for additional auth state tracking
		const sessionUnsubscribe = sessionStore.subscribe((session) => {});

		return () => {
			unsubscribe();
			sessionUnsubscribe();
		};
	});

	function handleThemeChange(theme: 'light' | 'dark') {
		setTheme(theme);
		currentTheme = theme;
	}
</script>

<svelte:head>
	<title>Wayli · Privacy-first location tracking</title>
</svelte:head>

<!-- Loading State -->
{#if !messagesLoaded || checkingUserCount}
	<div
		class="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-background dark:via-card dark:to-background"
	>
		<div class="text-center">
			<div class="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
			<p class="text-muted-foreground">
				{checkingUserCount ? 'Checking system status...' : 'Loading translations...'}
			</p>
		</div>
	</div>
{:else}
	<!-- Theme Toggle, Language Selector, and User/Login Button in Top Right -->
	<div
		class="fixed right-4 z-40 flex items-center gap-3 transition-all duration-300 {appState.storageBannerVisible
			? 'top-16'
			: 'top-4'}"
	>
		<!-- Language Selector -->
		<LanguageSelector variant="minimal" size="sm" showLabel={false} position="bottom-right" />

		<!-- Theme Toggle -->
		<div class="flex gap-2">
			<button
				onclick={() => handleThemeChange('light')}
				class="cursor-pointer rounded-lg p-2 font-medium transition-colors {currentTheme === 'light'
					? 'bg-primary/10 text-primary dark:bg-primary/40 dark:text-primary'
					: 'text-gray-700 hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted'}"
				title={t('landing.lightMode')}
			>
				<Sun class="h-4 w-4" />
			</button>
			<button
				onclick={() => handleThemeChange('dark')}
				class="cursor-pointer rounded-lg p-2 font-medium transition-colors {currentTheme === 'dark'
					? 'bg-primary/10 text-primary dark:bg-primary/40 dark:text-primary'
					: 'text-gray-700 hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted'}"
				title={t('landing.darkMode')}
			>
				<Moon class="h-4 w-4" />
			</button>
		</div>

		{#if $userStore && $userStore.email}
			<!-- User Menu -->
			<div class="group relative">
				<a
					href="/dashboard/statistics"
					class="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 font-medium text-gray-700 shadow-lg transition-colors dark:text-muted-foreground bg-card border-border hover:bg-muted"
				>
					<User class="h-4 w-4" />
					{($userStore.email?.split('@')[0] || 'User').charAt(0).toUpperCase() +
						($userStore.email?.split('@')[0] || 'User').slice(1)}
				</a>

				<!-- Dropdown Menu -->
				<div
					class="invisible absolute top-full right-0 mt-2 w-48 rounded-lg border opacity-0 shadow-lg transition-all duration-200 group-hover:visible group-hover:opacity-100 bg-card border-border"
				>
					<div class="py-2">
						<a
							href="/dashboard/statistics"
							class="block cursor-pointer px-4 py-2 text-sm text-gray-700 transition-colors dark:text-muted-foreground hover:bg-muted"
						>
							{t('common.navigation.dashboard')}
						</a>
						<a
							href="/dashboard/travel"
							class="block cursor-pointer px-4 py-2 text-sm text-gray-700 transition-colors dark:text-muted-foreground hover:bg-muted"
						>
							Journal
						</a>
						<a
							href="/dashboard/account-settings"
							class="block cursor-pointer px-4 py-2 text-sm text-gray-700 transition-colors dark:text-muted-foreground hover:bg-muted"
						>
							{t('common.navigation.accountSettings')}
						</a>
						<hr class="my-2 border-border" />
						<button
							onclick={handleSignOut}
							class="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-sm text-red-600 transition-colors dark:text-red-400 hover:bg-muted"
						>
							<LogOut class="h-4 w-4" />
							{t('common.navigation.signOut')}
						</button>
					</div>
				</div>
			</div>
		{:else if authResolved}
			<!-- Login Button -->
			<button
				onclick={handleLogin}
				class="bg-primary hover:bg-primary/90 dark:bg-primary dark:hover:bg-primary/90 inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 font-medium text-white shadow-lg transition-colors"
			>
				<LogIn class="h-4 w-4" />
				{t('landing.login')}
			</button>
		{/if}
	</div>

	{#if !redirectChecked}
		<!-- Minimal loader while checking for redirect — prevents landing page flash -->
		<div class="flex min-h-screen items-center justify-center bg-background">
			<div class="border-primary h-8 w-8 animate-spin rounded-full border-2"></div>
		</div>
	{:else}
		<!-- Hero Section -->
		<div
			class="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 transition-colors duration-300 dark:from-background dark:via-card dark:to-background"
		>
			<div class="container mx-auto px-4 py-16">
				<!-- Hero Content -->
				<div class="mx-auto mb-16 max-w-4xl text-center">
					<!-- Logo with text -->
					<div class="mx-auto mb-6 flex justify-center">
						<div class="bg-card/80 rounded-2xl p-4 backdrop-blur-sm dark:backdrop-blur-md">
							<img src="/logo.svg" alt="Wayli logo" class="h-32 w-auto md:h-40" />
						</div>
					</div>
					<p
						class="mb-4 text-2xl font-semibold text-gray-800 transition-colors duration-300 md:text-3xl dark:text-muted-foreground"
					>
						{t('landing.yourPersonalTracker')}
					</p>
					<p
						class="mb-8 text-lg leading-relaxed text-gray-600 transition-colors duration-300 md:text-xl dark:text-muted-foreground"
					>
						{t('landing.selfHostedTagline')}
					</p>
					<div class="flex flex-col justify-center gap-4 sm:flex-row">
						{#if $userStore && authResolved}
							<!-- Logged in: Dashboard + Travel -->
							<a
								href="/dashboard/statistics"
								class="bg-primary hover:bg-primary/90 inline-flex cursor-pointer items-center gap-2 rounded-lg px-8 py-4 font-semibold text-white shadow-lg transition-colors"
							>
								{t('common.navigation.dashboard')}
								<ArrowRight class="h-5 w-5" />
							</a>
							<a
								href="/dashboard/travel"
								class="inline-flex cursor-pointer items-center gap-2 rounded-lg border-2 border-border px-8 py-4 font-semibold text-foreground transition-colors hover:bg-muted"
							>
								<BookOpen class="h-5 w-5" />
								Journal
							</a>
						{:else}
							<!-- Anonymous: Get Started + Sign In -->
							<a
								href="/auth/signup"
								class="inline-flex cursor-pointer items-center gap-2 rounded-lg border-2 border-border px-8 py-4 font-semibold text-foreground transition-colors hover:bg-muted"
							>
								{t('landing.getStarted')}
								<ArrowRight class="h-5 w-5" />
							</a>
							<a
								href="/auth/signin"
								class="bg-primary hover:bg-primary/90 inline-flex cursor-pointer items-center gap-2 rounded-lg px-8 py-4 font-semibold text-white shadow-lg transition-colors"
							>
								{t('landing.signIn')}
							</a>
						{/if}
					</div>
				</div>

				<!-- Latest Journal Entries -->
				{#if latestEntries.length > 0}
					<div class="mx-auto mb-16 max-w-6xl px-4">
						<div class="mb-6 flex items-center gap-2">
							<BookOpen class="text-primary h-5 w-5" />
							<h2 class="text-foreground text-xl font-bold">Latest Journal Entries</h2>
						</div>
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{#each latestEntries as entry (entry.id)}
								<a
									href={entry.username ? `/u/${entry.username}/trips/${entry.trip_id}` : '#'}
									class="group bg-card border-border overflow-hidden rounded-xl border transition-all duration-300 hover:shadow-lg"
								>
									{#if entry.trip_image_url}
										<div class="h-32 overflow-hidden">
											<img
												src={entry.trip_image_url}
												alt={entry.trip_title || ''}
												class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
											/>
										</div>
									{/if}
									<div class="p-4">
										<div class="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs">
											<Calendar class="h-3 w-3" />
											{new Date(entry.entry_date).toLocaleDateString(undefined, {
												month: 'long',
												day: 'numeric',
												year: 'numeric'
											})}
										</div>
										<h3 class="text-foreground mb-1 font-bold">
											{entry.title || entry.trip_title || 'Untitled'}
										</h3>
										{#if entry.body}
											<p class="text-muted-foreground line-clamp-3 text-sm">
												{entry.body
													.replace(/[#*`>\-]/g, '')
													.trim()
													.slice(0, 150)}
											</p>
										{/if}
										{#if entry.trip_title && entry.title}
											<div class="text-muted-foreground/70 mt-2 text-xs">
												{entry.trip_title}
											</div>
										{/if}
									</div>
								</a>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Features Grid -->
				<div class="mb-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
					<!-- Feature 1: Privacy First -->
					<div
						class="rounded-xl border border-gray-200/50 bg-white/50 p-6 text-center backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-lg dark:border-border/50 dark:bg-card/50"
					>
						<div
							class="bg-primary/10 dark:bg-primary/20 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full transition-colors duration-300"
						>
							<Shield class="text-primary h-8 w-8 dark:text-muted-foreground" />
						</div>
						<h3
							class="mb-2 text-xl font-semibold text-gray-900 transition-colors duration-300 dark:text-foreground"
						>
							{t('landing.privacyFirst')}
						</h3>
						<p
							class="text-sm text-gray-600 transition-colors duration-300 dark:text-muted-foreground"
						>
							{t('landing.privacyFirstDescription')}
						</p>
					</div>

					<!-- Feature 2: Automatic Trip Detection -->
					<div
						class="rounded-xl border border-gray-200/50 bg-white/50 p-6 text-center backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-lg dark:border-border/50 dark:bg-card/50"
					>
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 transition-colors duration-300 dark:bg-green-900/20"
						>
							<MapPin class="h-8 w-8 text-green-600 dark:text-green-400" />
						</div>
						<h3
							class="mb-2 text-xl font-semibold text-gray-900 transition-colors duration-300 dark:text-foreground"
						>
							{t('landing.automaticTripDetection')}
						</h3>
						<p
							class="text-sm text-gray-600 transition-colors duration-300 dark:text-muted-foreground"
						>
							{t('landing.automaticTripDescription')}
						</p>
					</div>

					<!-- Feature 3: Beautiful Analytics -->
					<div
						class="rounded-xl border border-gray-200/50 bg-white/50 p-6 text-center backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-lg dark:border-border/50 dark:bg-card/50"
					>
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 transition-colors duration-300 dark:bg-purple-900/20"
						>
							<BarChart class="h-8 w-8 text-purple-600 dark:text-purple-400" />
						</div>
						<h3
							class="mb-2 text-xl font-semibold text-gray-900 transition-colors duration-300 dark:text-foreground"
						>
							{t('landing.beautifulAnalytics')}
						</h3>
						<p
							class="text-sm text-gray-600 transition-colors duration-300 dark:text-muted-foreground"
						>
							{t('landing.beautifulAnalyticsDescription')}
						</p>
					</div>

					<!-- Feature 4: Multi-User Support -->
					<div
						class="rounded-xl border border-gray-200/50 bg-white/50 p-6 text-center backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-lg dark:border-border/50 dark:bg-card/50"
					>
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 transition-colors duration-300 dark:bg-orange-900/20"
						>
							<Users class="h-8 w-8 text-orange-600 dark:text-orange-400" />
						</div>
						<h3
							class="mb-2 text-xl font-semibold text-gray-900 transition-colors duration-300 dark:text-foreground"
						>
							{t('landing.multiUserSupport')}
						</h3>
						<p
							class="text-sm text-gray-600 transition-colors duration-300 dark:text-muted-foreground"
						>
							{t('landing.multiUserDescription')}
						</p>
					</div>
				</div>
			</div>
		</div>
	{/if}
{/if}
