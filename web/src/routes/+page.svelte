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
		Users
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
			// Check if a landing redirect URL is configured (admin setting)
			try {
				const [urlSetting, usernameSetting] = await Promise.all([
					readSetting(() => fluxbase.settings.get('wayli.landing_redirect_url')),
					readSetting(() => fluxbase.settings.get('wayli.landing_redirect_username'))
				]);

				// Prefer the explicit URL setting; fall back to the username setting
				const redirectUrl = urlSetting?.value;
				if (redirectUrl && typeof redirectUrl === 'string' && redirectUrl.trim()) {
					goto(redirectUrl.trim());
					return;
				}

				const redirectUser = usernameSetting?.value;
				if (redirectUser && typeof redirectUser === 'string' && redirectUser.trim()) {
					goto(`/u/${redirectUser.trim()}`);
					return;
				}
			} catch {
				// Settings not available — show normal landing page.
			}

			await checkSetupStatus();
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
	<title>{t('wayli')} - {t('wayliSubtitle')}</title>
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
					<a
						href="/auth/signup"
						class="inline-flex cursor-pointer items-center gap-2 rounded-lg border-2 border-gray-300 px-8 py-4 font-semibold text-gray-700 transition-colors dark:border-border dark:text-muted-foreground hover:bg-muted"
					>
						{t('landing.getStarted')}
						<ArrowRight class="h-5 w-5" />
					</a>
					<a
						href="/auth/signin"
						class="bg-primary hover:bg-primary/90 dark:bg-primary dark:hover:bg-primary/90 inline-flex cursor-pointer items-center gap-2 rounded-lg px-8 py-4 font-semibold text-white shadow-lg transition-colors"
					>
						{t('landing.signIn')}
					</a>
				</div>
			</div>

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
