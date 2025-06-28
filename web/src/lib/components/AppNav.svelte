<script lang="ts">
	import { page } from '$app/stores';
	import { MapPin, Calendar, BarChart, Import, Edit, Landmark, Star, ListTodo, Link, Settings, User, LogOut, Navigation, Sun, Moon, Monitor, Menu, X, Crown, Map } from 'lucide-svelte';
	import { createEventDispatcher } from 'svelte';
	import { state, setTheme, toggleSidebar, closeSidebar } from '$lib/stores/app-state.svelte';
	import { onMount } from 'svelte';

	export let isAdmin = false;

	const dispatch = createEventDispatcher();

	const navMain = [
		{ href: '/dashboard/statistics', label: 'Statistics', icon: BarChart },
		{ href: '/dashboard/trips', label: 'Trips', icon: Map },
		{ href: '/dashboard/import-export', label: 'Import/Export', icon: Import },
		{ href: '/dashboard/point-editor', label: 'GPS Point Editor', icon: Edit },
		// { href: '/dashboard/points-of-interest', label: 'Visited POIs', icon: Landmark },
		{ href: '/dashboard/want-to-visit', label: 'Want to Visit', icon: Star },
		{ href: '/dashboard/jobs', label: 'Jobs', icon: ListTodo },
		{ href: '/dashboard/integrations', label: 'Integrations', icon: Link }
	];

	// Dynamic user navigation based on admin status
	$: navUser = [
		{ href: '/dashboard/account-settings', label: 'Account Settings', icon: User },
		...(isAdmin ? [{ href: '/dashboard/server-admin-settings', label: 'Server Admin Settings', icon: Settings }] : [])
	];

	function isActive(href: string) {
		return $page.url.pathname === href;
	}

	function handleSignOut() {
		dispatch('signout');
	}

	// Handle window resize to properly manage sidebar state
	function handleResize() {
		if (window.innerWidth >= 768) { // md breakpoint
			closeSidebar();
		}
	}

	onMount(() => {
		// Initialize sidebar state based on screen size
		if (window.innerWidth >= 768) {
			closeSidebar();
		}

		window.addEventListener('resize', handleResize);
		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});
</script>

<div class="flex h-screen bg-gray-100 dark:bg-gray-900">
	<!-- Sidebar -->
	<aside
		class="fixed inset-y-0 left-0 z-50 flex w-64 flex-shrink-0 flex-col border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out dark:border-gray-700 dark:bg-gray-800 md:static md:translate-x-0 {state.isSidebarOpen
			? 'translate-x-0'
			: '-translate-x-full'}"
	>
		<!-- Sidebar Header - Fixed at top -->
		<div class="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
			<a href="/dashboard/trips" class="flex items-center cursor-pointer">
				<Navigation class="h-8 w-8 text-[rgb(37,140,244)] mr-2" />
				<span class="text-xl font-bold text-gray-900 dark:text-gray-100">Wayli</span>
			</a>
			<button
				onclick={closeSidebar}
				class="md:hidden p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<!-- Scrollable Navigation - Takes remaining space -->
		<nav class="flex-1 min-h-0 overflow-y-auto">
			<div class="p-4 space-y-1">
				{#each navMain as item}
					<a
						href={item.href}
						class="flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer {isActive(item.href) ? 'bg-[rgb(37,140,244)] text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
						onclick={closeSidebar}
					>
						<svelte:component this={item.icon} class="h-5 w-5 mr-3" />
						{item.label}
					</a>
				{/each}
			</div>
		</nav>

		<!-- Fixed Footer - Always visible at bottom -->
		<div class="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4">
			<!-- Theme Toggle -->
			<div class="mb-4 flex justify-start gap-2">
				<button
					onclick={() => setTheme('light')}
					class="p-2 rounded-lg font-medium transition-colors cursor-pointer {state.theme === 'light'
						? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
						: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
					title="Light Mode"
				>
					<Sun class="h-5 w-5" />
				</button>
				<button
					onclick={() => setTheme('dark')}
					class="p-2 rounded-lg font-medium transition-colors cursor-pointer {state.theme === 'dark'
						? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
						: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
					title="Dark Mode"
				>
					<Moon class="h-5 w-5" />
				</button>
			</div>

			<!-- User Navigation -->
			<div class="mb-4">
				<div class="space-y-1">
					{#each navUser as item}
						<a
							href={item.href}
							class="flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer {isActive(item.href) ? 'bg-[rgb(37,140,244)] text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
							onclick={closeSidebar}
						>
							<svelte:component this={item.icon} class="h-5 w-5 mr-3" />
							<span class="flex items-center">
								{item.label}
								{#if isAdmin && item.label === 'Account Settings'}
									<Crown class="h-4 w-4 ml-2 text-yellow-500" />
								{/if}
							</span>
						</a>
					{/each}
				</div>
			</div>

			<!-- Sign Out Button -->
			<button
				onclick={() => {
					handleSignOut();
					closeSidebar();
				}}
				class="w-full flex items-center px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors cursor-pointer"
			>
				<LogOut class="h-5 w-5 mr-3" />
				Sign Out
			</button>
		</div>
	</aside>

	<!-- Mobile overlay -->
	{#if state.isSidebarOpen}
		<div
			class="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 md:hidden"
			onclick={closeSidebar}
			role="presentation"
			aria-roledescription="Mobile overlay"
			aria-label="Mobile overlay"
		></div>
	{/if}

	<!-- Main Content -->
	<div class="flex-1 flex flex-col overflow-hidden">
		<!-- Top bar for mobile -->
		<div class="md:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
			<div class="flex items-center justify-between">
				<button
					onclick={toggleSidebar}
					class="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
				>
					<Menu class="h-6 w-6" />
				</button>
				<a href="/dashboard/trips" class="flex items-center cursor-pointer">
					<Navigation class="h-6 w-6 text-[rgb(37,140,244)] mr-2" />
					<span class="text-lg font-bold text-gray-900 dark:text-gray-100">Wayli</span>
				</a>
				<div class="w-6"></div>
			</div>
		</div>

		<!-- Content Area -->
		<main class="flex-1 overflow-auto">
			<slot />
		</main>
	</div>
</div>