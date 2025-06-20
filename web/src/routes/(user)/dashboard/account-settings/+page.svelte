<script lang="ts">
	import { User, Lock, Globe, Shield } from 'lucide-svelte';
	import { supabase } from '$lib/supabase';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import { userStore } from '$lib/stores/auth';
	import TwoFactorSetup from '$lib/components/TwoFactorSetup.svelte';
	import TwoFactorDisable from '$lib/components/TwoFactorDisable.svelte';

	let email = '';
	let firstName = '';
	let lastName = '';
	let currentPassword = '';
	let newPassword = '';
	let confirmPassword = '';
	let twoFactorEnabled = false;
	let preferredLanguage = 'English';
	let distanceUnit = 'Kilometers (km)';
	let temperatureUnit = 'Celsius (°C)';
	let timezone = 'UTC+0 (London)';
	let isLoading = true;
	let isUpdatingPassword = false;
	let isUpdatingProfile = false;
	let isUpdatingPreferences = false;
	let showTwoFactorSetup = false;
	let showTwoFactorDisable = false;

	const languages = ['English', 'Nederlands', 'Deutsch', 'Français', 'Español'];
	const distanceUnits = ['Kilometers (km)', 'Miles (mi)'];
	const temperatureUnits = ['Celsius (°C)', 'Fahrenheit (°F)'];
	const timezones = [
		'UTC-12:00 (Baker Island)',
		'UTC-11:00 (American Samoa)',
		'UTC-10:00 (Hawaii)',
		'UTC-09:00 (Alaska)',
		'UTC-08:00 (Los Angeles, Vancouver)',
		'UTC-07:00 (Phoenix, Calgary)',
		'UTC-06:00 (Chicago, Mexico City)',
		'UTC-05:00 (New York, Toronto)',
		'UTC-04:00 (Santiago, Halifax)',
		'UTC-03:00 (São Paulo, Buenos Aires)',
		'UTC-02:00 (South Georgia)',
		'UTC-01:00 (Cape Verde)',
		'UTC+00:00 (London, Dublin)',
		'UTC+01:00 (Paris, Amsterdam)',
		'UTC+02:00 (Cairo, Jerusalem)',
		'UTC+03:00 (Moscow, Istanbul)',
		'UTC+04:00 (Dubai, Baku)',
		'UTC+05:00 (Karachi, Tashkent)',
		'UTC+05:30 (Mumbai, Colombo)',
		'UTC+06:00 (Dhaka, Almaty)',
		'UTC+07:00 (Bangkok, Jakarta)',
		'UTC+08:00 (Singapore, Beijing)',
		'UTC+09:00 (Tokyo, Seoul)',
		'UTC+09:30 (Adelaide)',
		'UTC+10:00 (Sydney, Brisbane)',
		'UTC+11:00 (Solomon Islands)',
		'UTC+12:00 (Auckland, Fiji)',
		'UTC+13:00 (Samoa, Tonga)'
	];

	onMount(async () => {
		await loadUserData();
	});

	async function loadUserData() {
		try {
			const { data: { user } } = await supabase.auth.getUser();
			if (user) {
				email = user.email || '';
				firstName = user.user_metadata?.first_name || '';
				lastName = user.user_metadata?.last_name || '';
				twoFactorEnabled = user.user_metadata?.totp_enabled || false;

				// Load preferences from user_metadata
				preferredLanguage = user.user_metadata?.preferred_language || 'English';
				distanceUnit = user.user_metadata?.distance_unit || 'Kilometers (km)';
				temperatureUnit = user.user_metadata?.temperature_unit || 'Celsius (°C)';
				timezone = user.user_metadata?.timezone || 'UTC+00:00 (London, Dublin)';
			}
		} catch (error) {
			console.error('Error loading user data:', error);
			toast.error('Failed to load user data');
		} finally {
			isLoading = false;
		}
	}

	async function handleSaveProfile() {
		isUpdatingProfile = true;

		try {
			const { error } = await supabase.auth.updateUser({
				data: {
					first_name: firstName,
					last_name: lastName
				}
			});

			if (error) throw error;
			toast.success('Profile updated successfully');
		} catch (error) {
			console.error('Error updating profile:', error);
			toast.error('Failed to update profile');
		} finally {
			isUpdatingProfile = false;
		}
	}

	async function handleSavePreferences() {
		isUpdatingPreferences = true;

		try {
			const { error } = await supabase.auth.updateUser({
				data: {
					preferred_language: preferredLanguage,
					distance_unit: distanceUnit,
					temperature_unit: temperatureUnit,
					timezone: timezone
				}
			});

			if (error) throw error;

			// Refresh user data to ensure UI reflects the changes
			await loadUserData();

			// Also refresh the user session to ensure userStore gets updated
			const { data: { user: refreshedUser } } = await supabase.auth.getUser();
			if (refreshedUser) {
				// Update the userStore manually to trigger UI updates
				userStore.set(refreshedUser);
			}

			toast.success('Preferences updated successfully');
		} catch (error) {
			console.error('Error updating preferences:', error);
			toast.error('Failed to update preferences');
		} finally {
			isUpdatingPreferences = false;
		}
	}

	async function handleUpdatePassword() {
		// Validate inputs
		if (!currentPassword) {
			toast.error('Please enter your current password');
			return;
		}

		if (!newPassword) {
			toast.error('Please enter a new password');
			return;
		}

		if (newPassword.length < 6) {
			toast.error('New password must be at least 6 characters long');
			return;
		}

		if (newPassword !== confirmPassword) {
			toast.error('New passwords do not match');
			return;
		}

		isUpdatingPassword = true;

		try {
			// First, verify the current password by attempting to sign in
			const { error: signInError } = await supabase.auth.signInWithPassword({
				email: email,
				password: currentPassword
			});

			if (signInError) {
				toast.error('Current password is incorrect');
				return;
			}

			// Update the password
			const { error } = await supabase.auth.updateUser({
				password: newPassword
			});

			if (error) throw error;

			toast.success('Password updated successfully!');

			// Clear password fields
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
		} catch (error) {
			console.error('Error updating password:', error);
			toast.error('Failed to update password. Please try again.');
		} finally {
			isUpdatingPassword = false;
		}
	}

	function handleTwoFactorEnabled() {
		showTwoFactorSetup = true;
	}

	function handleTwoFactorSetupClose() {
		showTwoFactorSetup = false;
		// Reload user data to check if 2FA was enabled
		loadUserData();
	}

	function handleTwoFactorDisable() {
		showTwoFactorDisable = true;
	}

	function handleTwoFactorDisableClose() {
		showTwoFactorDisable = false;
		// Reload user data to check if 2FA was disabled
		loadUserData();
	}

	// Subscribe to user store for real-time updates
	userStore.subscribe(user => {
		if (user && !isLoading) {
			email = user.email || '';
			firstName = user.user_metadata?.first_name || '';
			lastName = user.user_metadata?.last_name || '';
			twoFactorEnabled = user.user_metadata?.totp_enabled || false;

			// Load preferences from user_metadata
			preferredLanguage = user.user_metadata?.preferred_language || 'English';
			distanceUnit = user.user_metadata?.distance_unit || 'Kilometers (km)';
			temperatureUnit = user.user_metadata?.temperature_unit || 'Celsius (°C)';
			timezone = user.user_metadata?.timezone || 'UTC+00:00 (London, Dublin)';
		}
	});
</script>

<div>
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<User class="h-7 w-7 text-[rgb(37,140,244)]" />
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Account Settings</h1>
		</div>
	</div>

	{#if isLoading}
		<!-- Loading State -->
		<div class="flex items-center justify-center py-12">
			<div class="text-center">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[rgb(37,140,244)] mx-auto mb-4"></div>
				<p class="text-gray-600 dark:text-gray-400">Loading account settings...</p>
			</div>
		</div>
	{:else}
		<!-- Profile Settings -->
		<div class="mb-8 rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6">
			<div class="mb-6">
				<div class="flex items-center gap-2">
					<User class="h-5 w-5 text-gray-400" />
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Profile Settings</h2>
				</div>
				<p class="mt-1 text-sm text-gray-600">Manage your personal information and account details</p>
			</div>

			<div class="space-y-6">
				<div>
					<label for="email" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Email Address</label>
					<input
						id="email"
						type="email"
						bind:value={email}
						disabled
						class="w-full rounded-md border border-[rgb(218,218,221)] bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
					/>
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Email address cannot be changed yet.</p>
				</div>

				<div class="grid gap-6 md:grid-cols-2">
					<div>
						<label for="firstName" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">First Name</label>
						<input
							id="firstName"
							type="text"
							bind:value={firstName}
							placeholder="Enter your first name"
							class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
						/>
					</div>

					<div>
						<label for="lastName" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Last Name</label>
						<input
							id="lastName"
							type="text"
							bind:value={lastName}
							placeholder="Enter your last name"
							class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
						/>
					</div>
				</div>
			</div>

			<button
				class="mt-6 rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
				on:click={handleSaveProfile}
				disabled={isUpdatingProfile}
			>
				{isUpdatingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
			</button>
		</div>

		<!-- Security Settings -->
		<div class="mb-8 rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6">
			<div class="mb-6">
				<div class="flex items-center gap-2">
					<Lock class="h-5 w-5 text-gray-400" />
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Security Settings</h2>
				</div>
				<p class="mt-1 text-sm text-gray-600">Manage your password and security preferences</p>
			</div>

			<div class="space-y-4">
				<div>
					<label for="currentPassword" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Current Password</label>
					<input
						id="currentPassword"
						type="password"
						bind:value={currentPassword}
						class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
					/>
				</div>

				<div class="grid gap-4 md:grid-cols-2">
					<div>
						<label for="newPassword" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">New Password</label>
						<input
							id="newPassword"
							type="password"
							bind:value={newPassword}
							class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
						/>
					</div>

					<div>
						<label for="confirmPassword" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Confirm Password</label>
						<input
							id="confirmPassword"
							type="password"
							bind:value={confirmPassword}
							class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
						/>
					</div>
				</div>

				<button
					class="rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					on:click={handleUpdatePassword}
					disabled={isUpdatingPassword}
				>
					{isUpdatingPassword ? 'Updating Password...' : 'Update Password'}
				</button>

				<!-- Two-Factor Authentication Section -->
				<div class="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<Shield class="h-5 w-5 text-gray-400" />
							<div>
								<h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">Two-Factor Authentication</h3>
								<p class="text-sm text-gray-600 dark:text-gray-400">
									{#if twoFactorEnabled}
										Your account is protected with 2FA
									{:else}
										Add an extra layer of security to your account
									{/if}
								</p>
							</div>
						</div>

						{#if twoFactorEnabled}
							<div class="flex items-center gap-2">
								<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
									Enabled
								</span>
								<button
									class="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 cursor-pointer"
									on:click={handleTwoFactorDisable}
								>
									Disable
								</button>
							</div>
						{:else}
							<button
								class="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[rgb(37,140,244)] bg-[rgb(37,140,244)]/10 rounded-md hover:bg-[rgb(37,140,244)]/20 cursor-pointer"
								on:click={handleTwoFactorEnabled}
							>
								<Shield class="h-4 w-4" />
								Set Up 2FA
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Preferences -->
		<div class="rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6">
			<div class="mb-6">
				<div class="flex items-center gap-2">
					<Globe class="h-5 w-5 text-gray-400" />
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Preferences</h2>
				</div>
				<p class="mt-1 text-sm text-gray-600">Configure your language, units, and display preferences</p>
			</div>

			<div class="grid gap-6 md:grid-cols-2">
				<div>
					<label for="language" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Preferred Language</label>
					<select
						id="language"
						bind:value={preferredLanguage}
						class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
					>
						{#each languages as language}
							<option value={language}>{language}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="distanceUnit" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Distance Unit</label>
					<select
						id="distanceUnit"
						bind:value={distanceUnit}
						class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
					>
						{#each distanceUnits as unit}
							<option value={unit}>{unit}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="temperatureUnit" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Temperature Unit</label>
					<select
						id="temperatureUnit"
						bind:value={temperatureUnit}
						class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
					>
						{#each temperatureUnits as unit}
							<option value={unit}>{unit}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="timezone" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Timezone</label>
					<select
						id="timezone"
						bind:value={timezone}
						class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
					>
						{#each timezones as tz}
							<option value={tz}>{tz}</option>
						{/each}
					</select>
				</div>
			</div>

			<button
				class="mt-6 rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
				on:click={handleSavePreferences}
				disabled={isUpdatingPreferences}
			>
				{isUpdatingPreferences ? 'Saving Preferences...' : 'Save Preferences'}
			</button>
		</div>
	{/if}
</div>

<!-- Two-Factor Authentication Setup Modal -->
<TwoFactorSetup
	open={showTwoFactorSetup}
	on:close={handleTwoFactorSetupClose}
	on:enabled={handleTwoFactorSetupClose}
/>

<!-- Two-Factor Authentication Disable Modal -->
<TwoFactorDisable
	open={showTwoFactorDisable}
	on:close={handleTwoFactorDisableClose}
	on:disabled={handleTwoFactorDisableClose}
/>