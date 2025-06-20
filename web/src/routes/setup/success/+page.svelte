<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { Sun, Moon } from 'lucide-svelte';
	import { state, setTheme } from '$lib/stores/app-state.svelte';

	export let data: PageData;

	let showCheckmark = false;
	let showContent = false;

	onMount(() => {
		// Animate the content appearance
		setTimeout(() => {
			showContent = true;
		}, 100);

		// Animate the checkmark
		setTimeout(() => {
			showCheckmark = true;
		}, 300);
	});

	function handleConfirm() {
		goto('/auth/signin');
	}
</script>

<svelte:head>
	<title>Setup Complete - Wayli</title>
</svelte:head>

<!-- Theme Toggle in Top Right -->
<div class="fixed top-4 right-4 z-50 flex items-center gap-2">
	<button
		onclick={() => setTheme('light')}
		class="p-2 rounded-lg font-medium transition-colors cursor-pointer {state.theme === 'light'
			? 'bg-[rgb(37,140,244)]/10 text-[rgb(37,140,244)] dark:bg-[rgb(37,140,244)]/20 dark:text-[rgb(37,140,244)]'
			: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
		title="Light Mode"
	>
		<Sun class="h-4 w-4" />
	</button>
	<button
		onclick={() => setTheme('dark')}
		class="p-2 rounded-lg font-medium transition-colors cursor-pointer {state.theme === 'dark'
			? 'bg-[rgb(37,140,244)]/10 text-[rgb(37,140,244)] dark:bg-[rgb(37,140,244)]/20 dark:text-[rgb(37,140,244)]'
			: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
		title="Dark Mode"
	>
		<Moon class="h-4 w-4" />
	</button>
</div>

<div class="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
	<div class="w-full max-w-md">
		<div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-8 text-center border border-gray-200 dark:border-gray-700">
			<!-- Success Animation -->
			<div class="mb-8">
				<div class="relative mx-auto w-24 h-24">
					<!-- Circle Background -->
					<div class="absolute inset-0 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
						<div class="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center transition-all duration-500 ease-out {showCheckmark ? 'scale-100' : 'scale-0'}">
							<!-- Checkmark -->
							<svg
								class="w-12 h-12 text-white transition-all duration-700 ease-out {showCheckmark ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="3"
									d="M5 13l4 4L19 7"
								/>
							</svg>
						</div>
					</div>

					<!-- Animated Ring -->
					<div class="absolute inset-0 rounded-full border-4 border-green-300 dark:border-green-600 animate-pulse"></div>
				</div>
			</div>

			<!-- Content -->
			<div class="transition-all duration-500 ease-out {showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}">
				<h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
					Setup Complete!
				</h1>

				<p class="text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
					{data.message || 'Wayli has been successfully installed and configured. Your admin account is ready to use.'}
				</p>

				<!-- What was set up -->
				<div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 mb-8 text-left">
					<h3 class="font-semibold text-green-800 dark:text-green-300 mb-3">✅ What was configured:</h3>
					<ul class="text-sm text-green-700 dark:text-green-400 space-y-2">
						<li class="flex items-center">
							<span class="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
							Database tables and security policies
						</li>
						<li class="flex items-center">
							<span class="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
							PostGIS spatial data support
						</li>
						<li class="flex items-center">
							<span class="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
							Your admin account with full privileges
						</li>
						<li class="flex items-center">
							<span class="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
							User preferences and profile settings
						</li>
						<li class="flex items-center">
							<span class="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
							Tracking data storage for OwnTracks
						</li>
					</ul>
				</div>

				<!-- Next Steps -->
				<div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-8 text-left">
					<h3 class="font-semibold text-blue-800 dark:text-blue-300 mb-3">🚀 Next Steps:</h3>
					<ul class="text-sm text-blue-700 dark:text-blue-400 space-y-2">
						<li class="flex items-center">
							<span class="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
							Log in with your admin credentials
						</li>
						<li class="flex items-center">
							<span class="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
							Explore the dashboard and features
						</li>
						<li class="flex items-center">
							<span class="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
							Configure OwnTracks or other tracking apps
						</li>
						<li class="flex items-center">
							<span class="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
							Invite other users to join Wayli
						</li>
					</ul>
				</div>

				<!-- Confirm Button -->
				<button
					onclick={handleConfirm}
					class="w-full bg-[rgb(37,140,244)] hover:bg-[rgb(37,140,244)]/90 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 shadow-lg hover:shadow-xl cursor-pointer"
				>
					Continue to login
				</button>

				<p class="text-xs text-gray-500 dark:text-gray-400 mt-4">
					You'll be redirected to the login page where you can sign in with your admin account.
				</p>
			</div>
		</div>
	</div>
</div>

<style>
	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.animate-pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}
</style>