<script lang="ts">
	import { goto } from '$app/navigation';
	import { MapPin, Globe, Calendar, BarChart, ArrowRight, LogIn, Sun, Moon, User, LogOut } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { state, setTheme } from '$lib/stores/app-state.svelte';
	import { userStore } from '$lib/stores/auth';
	import { supabase } from '$lib/supabase';

	async function handleLogin() {
		goto('/auth/signin');
	}

	async function handleSignOut() {
		await supabase.auth.signOut();
		goto('/auth/signin');
	}

	onMount(() => {
		console.log('🏠 [LANDING] Page mounted');
		// Theme is already initialized in the store

		// Subscribe to user store for debugging
		const unsubscribe = userStore.subscribe(user => {
			console.log('🏠 [LANDING] User state:', user ? `Logged in - ${user.email}` : 'Not logged in');
		});

		return unsubscribe;
	});
</script>

<!-- Theme Toggle and User/Login Button in Top Right -->
<div class="fixed top-4 right-4 z-50 flex items-center gap-3">
	<!-- Theme Toggle -->
	<div class="flex gap-2">
		<button
			onclick={() => setTheme('light')}
			class="p-2 rounded-lg font-medium transition-colors cursor-pointer {state.theme === 'light'
				? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
				: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
			title="Light Mode"
		>
			<Sun class="h-4 w-4" />
		</button>
		<button
			onclick={() => setTheme('dark')}
			class="p-2 rounded-lg font-medium transition-colors cursor-pointer {state.theme === 'dark'
				? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
				: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
			title="Dark Mode"
		>
			<Moon class="h-4 w-4" />
		</button>
	</div>

	{#if $userStore}
		<!-- User Menu -->
		<div class="relative group">
			<a
				href="/dashboard/trips"
				class="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
			>
				<User class="h-4 w-4" />
				{($userStore.email?.split('@')[0] || 'User').charAt(0).toUpperCase() + ($userStore.email?.split('@')[0] || 'User').slice(1)}
			</a>

			<!-- Dropdown Menu -->
			<div class="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
				<div class="py-2">
					<a
						href="/dashboard/trips"
						class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
					>
						Dashboard
					</a>
					<a
						href="/dashboard/account-settings"
						class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
					>
						Account Settings
					</a>
					<hr class="my-2 border-gray-200 dark:border-gray-700" />
					<button
						onclick={handleSignOut}
						class="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 cursor-pointer"
					>
						<LogOut class="h-4 w-4" />
						Sign Out
					</button>
				</div>
			</div>
		</div>
	{:else}
		<!-- Login Button -->
		<button
			onclick={handleLogin}
			class="inline-flex items-center gap-2 px-4 py-2 bg-[rgb(37,140,244)] hover:bg-[rgb(37,140,244)]/90 text-white font-medium rounded-lg transition-colors shadow-lg cursor-pointer"
		>
			<LogIn class="h-4 w-4" />
			Login
		</button>
	{/if}
</div>

<!-- Hero Section -->
<div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 transition-colors duration-300">
	<div class="container mx-auto px-4 py-16">
		<!-- Hero Content -->
		<div class="text-center max-w-4xl mx-auto mb-16">
			<h1 class="text-5xl md:text-7xl font-bold text-gray-900 dark:text-gray-100 mb-6 transition-colors duration-300">
				Welcome to <span class="text-[rgb(37,140,244)]">Wayli</span>
			</h1>
			<p class="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 leading-relaxed transition-colors duration-300">
				Your personal travel companion. Track your journeys, discover new places, and create unforgettable memories.
			</p>
			<div class="flex flex-col sm:flex-row gap-4 justify-center">
				<a
					href="/auth/signup"
					class="inline-flex items-center gap-2 px-8 py-4 bg-[rgb(37,140,244)] hover:bg-[rgb(37,140,244)]/90 text-white font-semibold rounded-lg transition-colors shadow-lg cursor-pointer"
				>
					Get Started
					<ArrowRight class="h-5 w-5" />
				</a>
				<a
					href="/auth/signin"
					class="inline-flex items-center gap-2 px-8 py-4 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
				>
					Sign In
				</a>
			</div>
		</div>

		<!-- Features Grid -->
		<div class="grid md:grid-cols-3 gap-8 mb-16">
			<div class="text-center p-6 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 transition-all duration-300 hover:shadow-lg">
				<div class="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-4 transition-colors duration-300">
					<MapPin class="h-8 w-8 text-[rgb(37,140,244)]" />
				</div>
				<h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2 transition-colors duration-300">
					Track Your Journey
				</h3>
				<p class="text-gray-600 dark:text-gray-400 transition-colors duration-300">
					Record every location you visit with precise coordinates and timestamps.
				</p>
			</div>

			<div class="text-center p-6 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 transition-all duration-300 hover:shadow-lg">
				<div class="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-4 transition-colors duration-300">
					<Globe class="h-8 w-8 text-green-600 dark:text-green-400" />
				</div>
				<h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2 transition-colors duration-300">
					Discover the World
				</h3>
				<p class="text-gray-600 dark:text-gray-400 transition-colors duration-300">
					Explore new destinations and keep track of places you want to visit.
				</p>
			</div>

			<div class="text-center p-6 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 transition-all duration-300 hover:shadow-lg">
				<div class="mx-auto w-16 h-16 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center mb-4 transition-colors duration-300">
					<BarChart class="h-8 w-8 text-purple-600 dark:text-purple-400" />
				</div>
				<h3 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2 transition-colors duration-300">
					Analyze Your Travels
				</h3>
				<p class="text-gray-600 dark:text-gray-400 transition-colors duration-300">
					Get insights into your travel patterns and statistics.
				</p>
			</div>
		</div>

		<!-- Call to Action -->
		<div class="text-center bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-gray-200/50 dark:border-gray-700/50 transition-all duration-300">
			<h2 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4 transition-colors duration-300">
				Ready to Start Your Adventure?
			</h2>
			<p class="text-gray-600 dark:text-gray-400 mb-6 transition-colors duration-300">
				Join thousands of travelers who trust Wayli to document their journeys.
			</p>
			<a
				href="/auth/signup"
				class="inline-flex items-center gap-2 px-6 py-3 bg-[rgb(37,140,244)] hover:bg-[rgb(37,140,244)]/90 text-white font-medium rounded-lg transition-colors cursor-pointer"
			>
				Create Your Account
				<ArrowRight class="h-4 w-4" />
			</a>
		</div>
	</div>
</div>
