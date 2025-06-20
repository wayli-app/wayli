<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import { toast } from 'svelte-sonner';
	import { Sun, Moon, Navigation } from 'lucide-svelte';
	import { state, setTheme } from '$lib/stores/app-state.svelte';

	export let data: PageData;

	let loading = false;
	let currentStep = 'form'; // 'form', 'initializing', 'creating'
	let formData = {
		email: '',
		password: '',
		confirmPassword: '',
		firstName: '',
		lastName: ''
	};

	async function handleSetup(event: SubmitEvent) {
		event.preventDefault();
		loading = true;

		if (formData.password !== formData.confirmPassword) {
			toast.error('Passwords do not match');
			loading = false;
			return;
		}

		try {
			// Step 1: Initialize database
			currentStep = 'initializing';
			toast.info('Initializing database...');

			const initResponse = await fetch('/api/v1/setup/init-database', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!initResponse.ok) {
				const initResult = await initResponse.json();
				toast.error(initResult.error || 'Database initialization failed');
				loading = false;
				currentStep = 'form';
				return;
			}

			toast.success('Database initialized successfully');

			// Step 2: Create first user
			currentStep = 'creating';
			toast.info('Creating your admin account...');

			const response = await fetch('/api/v1/setup/first-user', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: formData.email,
					password: formData.password,
					firstName: formData.firstName,
					lastName: formData.lastName
				})
			});

			const result = await response.json();

			if (response.ok) {
				toast.success('Setup completed successfully!');
				// Redirect to success page after a short delay
				setTimeout(() => {
					goto('/setup/success');
				}, 1500);
			} else {
				toast.error(result.error || 'Setup failed');
				loading = false;
				currentStep = 'form';
			}
		} catch (error) {
			console.error('Setup error:', error);
			toast.error('An unexpected error occurred');
			loading = false;
			currentStep = 'form';
		}
	}
</script>

<svelte:head>
	<title>Wayli Setup</title>
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
		<div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-8 border border-gray-200 dark:border-gray-700">
			<!-- Header - Same as dashboard -->
			<div class="flex items-center justify-center mb-8 pb-4 pt-4 border-gray-200 dark:border-gray-700">
				<div class="relative flex items-center cursor-pointer">
					<Navigation class="h-16 w-16 text-[rgb(37,140,244)] absolute -left-20" />
					<span class="text-4xl font-bold text-gray-900 dark:text-gray-100">Wayli</span>
				</div>
			</div>

			<!-- Welcome Message -->
			<div class="text-center mb-8">
				<h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Welcome!</h1>
				<p class="text-gray-600 dark:text-gray-400 mt-2">
					{data.message || 'Set up your first admin account'}
				</p>
			</div>

			<!-- Error Message -->
			{#if data.error}
				<div class="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
					<p class="text-red-700 dark:text-red-400 text-sm">{data.error}</p>
				</div>
			{/if}

			<!-- Setup Form -->
			{#if currentStep === 'form'}
				<form onsubmit={handleSetup} class="space-y-4">
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label for="firstName" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								First Name
							</label>
							<input
								id="firstName"
								type="text"
								bind:value={formData.firstName}
								required
								placeholder="John"
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-[rgb(37,140,244)] focus:border-transparent dark:focus:ring-[rgb(37,140,244)]"
							/>
						</div>
						<div>
							<label for="lastName" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
								Last Name
							</label>
							<input
								id="lastName"
								type="text"
								bind:value={formData.lastName}
								required
								placeholder="Doe"
								class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-[rgb(37,140,244)] focus:border-transparent dark:focus:ring-[rgb(37,140,244)]"
							/>
						</div>
					</div>

					<div>
						<label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Email Address
						</label>
						<input
							id="email"
							type="email"
							bind:value={formData.email}
							required
							placeholder="admin@example.com"
							class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-[rgb(37,140,244)] focus:border-transparent dark:focus:ring-[rgb(37,140,244)]"
						/>
					</div>

					<div>
						<label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Password
						</label>
						<input
							id="password"
							type="password"
							bind:value={formData.password}
							required
							placeholder="••••••••"
							minlength="8"
							class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-[rgb(37,140,244)] focus:border-transparent dark:focus:ring-[rgb(37,140,244)]"
						/>
					</div>

					<div>
						<label for="confirmPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Confirm Password
						</label>
						<input
							id="confirmPassword"
							type="password"
							bind:value={formData.confirmPassword}
							required
							placeholder="••••••••"
							minlength="8"
							class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-[rgb(37,140,244)] focus:border-transparent dark:focus:ring-[rgb(37,140,244)]"
						/>
					</div>

					<button
						type="submit"
						disabled={loading}
						class="w-full bg-[rgb(37,140,244)] hover:bg-[rgb(37,140,244)]/90 disabled:bg-[rgb(37,140,244)]/50 text-white font-medium py-2 px-4 rounded-md transition-colors"
					>
						{loading ? 'Setting up...' : 'Complete Setup'}
					</button>
				</form>
			{:else if currentStep === 'initializing'}
				<div class="text-center py-8">
					<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-[rgb(37,140,244)] mx-auto mb-4"></div>
					<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Initializing Database</h3>
					<p class="text-gray-600 dark:text-gray-400">Creating tables and setting up security policies...</p>
				</div>
			{:else if currentStep === 'creating'}
				<div class="text-center py-8">
					<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
					<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Creating Admin Account</h3>
					<p class="text-gray-600 dark:text-gray-400">Setting up your first admin user...</p>
				</div>
			{/if}

			<div class="mt-6 text-center">
				<p class="text-xs text-gray-500 dark:text-gray-400">
					This will initialize the database and create your first admin account.
				</p>
			</div>
		</div>
	</div>
</div>