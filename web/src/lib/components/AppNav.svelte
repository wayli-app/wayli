<script lang="ts">
	import {
		Globe,
		Import,
		Star,
		Link,
		Newspaper,
		Users,
		Database,
		MapPin,
		Sun,
		Moon,
		Menu
	} from 'lucide-svelte';

	import { translate } from '$lib/i18n';
	import { setTheme, initializeTheme } from '$lib/stores/app-state.svelte';
	import { fade } from 'svelte/transition';
	import { userStore } from '$lib/stores/auth';
	import { fluxbase } from '$lib/fluxbase';
	import { pendingTripCount } from '$lib/stores/trip-suggestions';
	import { pendingFriendRequestCount } from '$lib/stores/friends.svelte';

	import NotificationsButton from './NotificationsButton.svelte';
	import UserMenu from './UserMenu.svelte';
	import RealtimeConnectionStatus from './RealtimeConnectionStatus.svelte';

	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { focusTrap } from '$lib/utils/focus-trap';

	let {
		isAdmin = false,
		children,
		onSignout,
		realtimeConnectionStatus = 'disconnected'
	} = $props<{
		isAdmin?: boolean;
		children?: unknown;
		onSignout?: () => void;
		realtimeConnectionStatus?: 'connecting' | 'connected' | 'disconnected' | 'error';
	}>();

	// Use the reactive translation function
	let t = $derived($translate);

	// Local state for SSR compatibility
	let currentTheme = $state<'light' | 'dark'>('light');
	let isSidebarOpen = $state(false);

	// Whether the user has already visited the Travel page. Once true, we stop
	// showing the suggested-trips count badge on the sidebar — they've seen it.
	let travelVisited = $state(false);

	// Reactive navigation items that update with language changes and AI enabled state
	let navMain = $derived([
		{ href: '/dashboard/travel', label: t('common.navigation.travel'), icon: Globe },
		{ href: '/dashboard/feed', label: t('common.navigation.feed'), icon: Newspaper },
		{ href: '/dashboard/friends', label: t('common.navigation.friends'), icon: Users },
		{ href: '/dashboard/want-to-visit', label: t('common.navigation.wantToVisit'), icon: Star },
		{ href: '/dashboard/import-export', label: t('common.navigation.importExport'), icon: Import },
		{ href: '/dashboard/connections', label: t('common.navigation.connections'), icon: Link },
		{ href: '/dashboard/data-editor', label: t('common.navigation.dataEditor'), icon: Database },
		{ href: '/dashboard/statistics', label: t('common.navigation.statistics'), icon: MapPin }
	]);

	// Force reactive update after navigation
	afterNavigate(() => {
		// This will trigger a reactive update of the page store
	});

	// Load user profile for onboarding indicator
	onMount(async () => {
		// Initialize theme
		if (browser) {
			initializeTheme();
			const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
			if (savedTheme) {
				currentTheme = savedTheme;
			} else {
				const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				currentTheme = prefersDark ? 'dark' : 'light';
			}

			// Read the "has visited Travel page" flag, and keep it in sync
			// across tabs/windows via storage events (so the badge disappears
			// from an open dashboard the moment the user opens Travel).
			travelVisited = localStorage.getItem('wayli.travel_visited') === '1';
			window.addEventListener('storage', (e: StorageEvent) => {
				if (e.key === 'wayli.travel_visited') {
					travelVisited = localStorage.getItem('wayli.travel_visited') === '1';
				}
			});
			// AppNav is the persistent app shell, so this listener lives for the
			// session; no teardown needed.
		}

		if ($userStore) {
			// Fetch pending trip suggestions count
			try {
				const { count } = await fluxbase
					.from('trips')
					.select('*', { count: 'exact', head: true })
					.eq('status', 'pending');
				pendingTripCount.set(count ?? 0);
			} catch {
				// non-critical
			}

			// Fetch pending friend request count
			try {
				const { count: friendCount } = await fluxbase
					.from('user_connections')
					.select('*', { count: 'exact', head: true })
					.eq('friend_id', $userStore.id)
					.eq('status', 'pending');
				pendingFriendRequestCount.set(friendCount ?? 0);
			} catch {
				// non-critical
			}
		}
	});

	function handleThemeChange(theme: 'light' | 'dark') {
		setTheme(theme);
		currentTheme = theme;
	}

	// Single-button toggle for the header (replaces the two-button sidebar control).
	function toggleTheme() {
		handleThemeChange(currentTheme === 'dark' ? 'light' : 'dark');
	}

	function handleToggleSidebar() {
		isSidebarOpen = !isSidebarOpen;
	}

	function handleCloseSidebar() {
		isSidebarOpen = false;
	}

	// Handle window resize to properly manage sidebar state
	function handleResize() {
		if (window.innerWidth >= 768) {
			// md breakpoint
			isSidebarOpen = false;
		}
	}

	onMount(() => {
		// Initialize sidebar state based on screen size
		if (window.innerWidth >= 768) {
			isSidebarOpen = false;
		}

		window.addEventListener('resize', handleResize);
		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && isSidebarOpen) isSidebarOpen = false;
	}}
/>

<div class="bg-background flex h-screen flex-col">
	<!-- Unified top bar: spans the full width on every screen size.
	     Left: hamburger (mobile only) + logo; Right: status + personal actions. -->
	<header
		class="border-border bg-card z-30 flex h-14 flex-shrink-0 items-center justify-between border-b px-4"
	>
		<div class="flex items-center gap-2">
			<button
				onclick={handleToggleSidebar}
				class="text-muted-foreground hover:text-foreground flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md p-1 md:hidden"
				aria-label={t('common.navigation.menu')}
			>
				<Menu class="h-6 w-6" />
			</button>
			<a href="/" class="flex cursor-pointer items-center">
				<img src="/logo-icon.svg" alt="Wayli" class="mr-1.5 h-7 w-7" />
				<span class="text-foreground text-lg font-bold">Wayli</span>
			</a>
		</div>
		<!-- Right cluster: realtime status, theme, notifications, account. -->
		<div class="flex items-center gap-1">
			<div class="px-1">
				<RealtimeConnectionStatus status={realtimeConnectionStatus} compact={true} />
			</div>
			<button
				onclick={toggleTheme}
				class="text-muted-foreground hover:text-foreground flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md p-1 transition-colors"
				title={currentTheme === 'dark'
					? t('common.navigation.lightMode')
					: t('common.navigation.darkMode')}
				aria-label={currentTheme === 'dark'
					? t('common.navigation.lightMode')
					: t('common.navigation.darkMode')}
			>
				{#if currentTheme === 'dark'}
					<Sun class="h-5 w-5" />
				{:else}
					<Moon class="h-5 w-5" />
				{/if}
			</button>
			<NotificationsButton />
			<UserMenu {isAdmin} {onSignout} />
		</div>
	</header>

	<!-- Body: sidebar + content side by side, below the top bar. -->
	<div class="flex min-h-0 flex-1">
		<!-- Mobile overlay -->
		{#if isSidebarOpen}
			<div
				transition:fade={{ duration: 150 }}
				class="fixed inset-0 top-14 z-40 bg-black/50 transition-opacity duration-300 md:hidden"
				onclick={handleCloseSidebar}
				role="presentation"
				aria-roledescription="Mobile overlay"
				aria-label="Mobile overlay"
			></div>
		{/if}

		<!-- Sidebar: navigation only (logo bar moved to the unified top bar). -->
		<aside
			use:focusTrap={isSidebarOpen}
			class="border-border bg-card fixed top-14 bottom-0 left-0 z-50 flex w-64 flex-shrink-0 flex-col border-r transition-transform duration-300 ease-in-out md:static md:translate-x-0 {isSidebarOpen
				? 'translate-x-0'
				: '-translate-x-full'}"
		>
			<!-- Scrollable Navigation - Takes remaining space -->
			<nav class="min-h-0 flex-1 overflow-y-auto">
				<div class="space-y-1 p-4">
					{#each navMain as item (item.href)}
						<a
							href={item.href}
							class="flex min-h-[44px] cursor-pointer items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors {$page
								.url.pathname === item.href ||
							(item.href === '/dashboard/travel' &&
								$page.url.pathname.startsWith('/dashboard/travel'))
								? 'bg-primary text-primary-foreground'
								: 'text-muted-foreground hover:bg-muted'}"
							onclick={handleCloseSidebar}
						>
							<item.icon class="mr-3 h-5 w-5" />
							{item.label}
							{#if item.href === '/dashboard/travel' && $pendingTripCount > 0 && !travelVisited}
								<span
									class="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white"
								>
									{$pendingTripCount}
								</span>
							{/if}
							{#if item.href === '/dashboard/friends' && $pendingFriendRequestCount > 0}
								<span
									class="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white"
								>
									{$pendingFriendRequestCount}
								</span>
							{/if}
						</a>
					{/each}
				</div>
			</nav>
		</aside>

		<!-- Main Content (inert while the mobile sidebar drawer is open, to
		     keep focus trapped in the drawer) -->
		<div class="flex flex-1 flex-col overflow-hidden" inert={isSidebarOpen ? '' : undefined}>
			<!-- Content Area -->
			<main class="flex-1 overflow-auto pb-24 md:pb-0">
				{#if children}
					{@render children()}
				{/if}
			</main>
		</div>
	</div>
</div>
