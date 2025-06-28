<script lang="ts">
	import { User, Settings, Bell, Globe, Shield, Key, QrCode, Download, Upload, Trash2, Save, X, Check, AlertCircle, Info, Lock } from 'lucide-svelte';
	import { supabase } from '$lib/supabase';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import { userStore } from '$lib/stores/auth';
	import TwoFactorSetup from '$lib/components/TwoFactorSetup.svelte';
	import TwoFactorDisable from '$lib/components/TwoFactorDisable.svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';
	import type { UserProfile, UserPreferences } from '$lib/types/user.types';

	let currentPassword = '';
	let newPassword = '';
	let confirmPassword = '';
	let twoFactorEnabled = false;
	let isUpdatingPassword = false;
	let isUpdatingProfile = false;
	let isUpdatingPreferences = false;
	let showTwoFactorSetup = false;
	let showTwoFactorDisable = false;
	let profile: UserProfile | null = null;
	let preferences: UserPreferences | null = null;
	let firstNameInput = '';
	let lastNameInput = '';
	let preferredLanguageInput = '';
	let notificationsEnabledInput = true;
	let timezoneInput = 'UTC+00:00 (London, Dublin)';
	let error: string | null = null;

	const languages = ['en', 'nl'];
	const timezones = [
		'UTC-12:00 (International Date Line West)',
		'UTC-11:00 (Samoa)',
		'UTC-10:00 (Hawaii)',
		'UTC-09:00 (Alaska)',
		'UTC-08:00 (Pacific Time)',
		'UTC-07:00 (Mountain Time)',
		'UTC-06:00 (Central Time)',
		'UTC-05:00 (Eastern Time)',
		'UTC-04:00 (Atlantic Time)',
		'UTC-03:00 (Brasilia)',
		'UTC-02:00 (Mid-Atlantic)',
		'UTC-01:00 (Azores)',
		'UTC+00:00 (London, Dublin)',
		'UTC+01:00 (Paris, Berlin)',
		'UTC+02:00 (Eastern Europe)',
		'UTC+03:00 (Moscow)',
		'UTC+04:00 (Gulf)',
		'UTC+05:00 (Pakistan)',
		'UTC+06:00 (Bangladesh)',
		'UTC+07:00 (Bangkok)',
		'UTC+08:00 (Beijing)',
		'UTC+09:00 (Tokyo)',
		'UTC+10:00 (Sydney)',
		'UTC+11:00 (Solomon Islands)',
		'UTC+12:00 (Auckland, Fiji)',
		'UTC+13:00 (Samoa, Tonga)'
	];

	async function testWithRealToken() {
		console.log('Testing with real access token...');
		try {
			// Get the actual access token from localStorage
			const supabaseKey = localStorage.getItem('sb-wayli-auth-token');
			if (!supabaseKey) {
				console.log('No auth token found in localStorage');
				return;
			}

			const tokenData = JSON.parse(supabaseKey);
			const accessToken = tokenData.access_token;

			if (!accessToken) {
				console.log('No access token found in token data');
				return;
			}

			console.log('Using access token:', accessToken.substring(0, 20) + '...');

			// Make request with real access token
			const response = await fetch('https://wayli.int.hazen.nu/auth/v1/user', {
				method: 'GET',
				headers: {
					'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMTExMjAwLCJleHAiOjE5MDc4Nzc2MDB9.p3mtD6vcbnzcbBNBXVo1lwUGuiIBI_3pq__9h-jAnEs',
					'Authorization': `Bearer ${accessToken}`
				}
			});

			console.log('Response status:', response.status);
			const data = await response.text();
			console.log('Response data:', data);

		} catch (error) {
			console.error('Real token test failed:', error);
		}
	}

	async function testTokens() {
		console.log('Testing available tokens...');
		try {
			// Check localStorage for Supabase tokens
			console.log('Checking localStorage...');
			const supabaseKey = localStorage.getItem('sb-wayli-auth-token');
			console.log('Supabase auth token in localStorage:', supabaseKey ? 'Found' : 'Not found');

			if (supabaseKey) {
				try {
					const tokenData = JSON.parse(supabaseKey);
					console.log('Token data:', {
						access_token: tokenData.access_token ? 'Present' : 'Missing',
						refresh_token: tokenData.refresh_token ? 'Present' : 'Missing',
						expires_at: tokenData.expires_at,
						expires_in: tokenData.expires_in
					});
				} catch (e) {
					console.log('Token data is not valid JSON');
				}
			}

			// Check cookies for tokens
			console.log('Checking cookies...');
			const cookies = document.cookie.split(';');
			const authCookies = cookies.filter(cookie => cookie.includes('sb-'));
			console.log('Auth cookies found:', authCookies.length);
			authCookies.forEach(cookie => {
				const [name, value] = cookie.trim().split('=');
				console.log(`Cookie: ${name} = ${value ? 'Present' : 'Missing'}`);
			});

		} catch (error) {
			console.error('Token test failed:', error);
		}
	}

	async function testDirectFetch() {
		console.log('Testing direct fetch to Supabase...');
		try {
			// Test 1: Try to fetch from the auth endpoint directly
			console.log('Test 1: Fetching auth endpoint directly...');
			const response = await fetch('https://wayli.int.hazen.nu/auth/v1/user', {
				method: 'GET',
				headers: {
					'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMTExMjAwLCJleHAiOjE5MDc4Nzc2MDB9.p3mtD6vcbnzcbBNBXVo1lwUGuiIBI_3pq__9h-jAnEs',
					'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMTExMjAwLCJleHAiOjE5MDc4Nzc2MDB9.p3mtD6vcbnzcbBNBXVo1lwUGuiIBI_3pq__9h-jAnEs'
				}
			});

			console.log('Response status:', response.status);
			const data = await response.text();
			console.log('Response data:', data);

		} catch (error) {
			console.error('Direct fetch test failed:', error);
		}
	}

	async function testSession() {
		console.log('Testing current session...');
		try {
			// Test 1: Check current user using secure authentication
			console.log('Test 1: Getting current user...');
			const { data: { user }, error: userError } = await supabase.auth.getUser();
			console.log('User result:', { user: user?.id, error: userError });

			if (user) {
				console.log('User found:', {
					userId: user.id,
					email: user.email,
					metadata: user.user_metadata
				});
			} else {
				console.log('No user found - user needs to sign in');
			}

		} catch (error) {
			console.error('User test failed:', error);
		}
	}

	async function testSupabaseConfig() {
		console.log('Testing Supabase configuration...');
		try {
			// Check if environment variables are available
			console.log('Checking environment variables...');

			// Test the centralized configuration
			const { getSupabaseConfig } = await import('$lib/core/config/environment');
			const config = getSupabaseConfig();
			console.log('Supabase config validation passed:', config);

		} catch (error) {
			console.error('Config test failed:', error);
		}
	}

	async function testSupabaseAuth() {
		console.log('Testing Supabase auth operations...');
		try {
			// Test 1: Check if supabase object exists
			console.log('Test 1: Checking supabase object...');
			console.log('supabase object:', supabase);
			console.log('supabase.auth object:', supabase.auth);

			// Test 2: Check if we can access getUser method
			console.log('Test 2: Checking getUser method...');
			console.log('getUser method exists:', typeof supabase.auth.getUser === 'function');

			// Test 3: Try to get user with timeout
			console.log('Test 3: Calling getUser with timeout...');
			const getUserPromise = supabase.auth.getUser();
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => reject(new Error('getUser timed out after 5 seconds')), 5000);
			});

			const { data: { user }, error } = await Promise.race([getUserPromise, timeoutPromise]) as any;
			console.log('Test 3 complete: getUser() completed');
			console.log('getUser result:', { user: user?.id, error });

			if (user) {
				console.log('Current user metadata:', user.user_metadata);
				console.log('Current user email:', user.email);
			}
		} catch (error) {
			console.error('Test failed:', error);
			console.error('Error details:', {
				name: error instanceof Error ? error.name : 'Unknown',
				message: error instanceof Error ? error.message : String(error)
			});
		}
	}

	async function loadUserData() {
		try {
			error = null;

			// Get user data from our server API
			const response = await fetch('/api/v1/auth/profile', {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error('Failed to get user data');
			}

			const result = await response.json();

			if (!result.success) {
				throw new Error(result.error?.message || 'Failed to load user data');
			}

			console.log('User data loaded from API:', result);

			// Set profile and preferences from API response
			profile = result.data.profile;
			preferences = result.data.preferences;
			twoFactorEnabled = result.data.two_factor_enabled;

			console.log('Profile data loaded:', profile);
			console.log('Preferences data loaded:', preferences);

			// Initialize input fields with loaded data
			if (profile) {
				firstNameInput = profile.first_name || '';
				lastNameInput = profile.last_name || '';
			}
			if (preferences) {
				preferredLanguageInput = preferences.language || 'en';
				notificationsEnabledInput = preferences.notifications_enabled ?? true;
				timezoneInput = preferences.timezone || 'UTC+00:00 (London, Dublin)';
			}
		} catch (error) {
			console.error('Error loading user data:', error);
			error = error instanceof Error ? error.message : 'Failed to load user data';
			toast.error('Failed to load user data');
		}
	}

	onMount(async () => {
		await loadUserData();
	});

	async function handleSaveProfile() {
		console.log('handleSaveProfile called with:', { firstNameInput, lastNameInput });
		isUpdatingProfile = true;
		try {
			console.log('Step 1: Calling server API directly...');
			const response = await fetch('/api/v1/auth/profile', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					first_name: firstNameInput,
					last_name: lastNameInput
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to update profile');
			}

			const result = await response.json();
			console.log('Profile updated successfully:', result);

			// Update local profile data
			if (profile) {
				profile.first_name = firstNameInput;
				profile.last_name = lastNameInput;
				profile.full_name = `${firstNameInput} ${lastNameInput}`.trim();
			}

			toast.success('Profile updated successfully');
		} catch (error) {
			console.error('Error updating profile:', error);
			toast.error('Failed to update profile');
		} finally {
			isUpdatingProfile = false;
		}
	}

	async function handleSavePreferences() {
		console.log('handleSavePreferences called with:', { preferredLanguageInput, notificationsEnabledInput, timezoneInput });
		isUpdatingPreferences = true;
		try {
			console.log('Step 1: Calling server API directly...');
			const response = await fetch('/api/v1/auth/preferences', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					language: preferredLanguageInput,
					notifications_enabled: notificationsEnabledInput,
					timezone: timezoneInput
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to update preferences');
			}

			const result = await response.json();
			console.log('Preferences updated successfully:', result);

			// Update local preferences data
			if (preferences) {
				preferences.language = preferredLanguageInput;
				preferences.notifications_enabled = notificationsEnabledInput;
				preferences.timezone = timezoneInput;
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
			const response = await fetch('/api/v1/auth/password', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					currentPassword,
					newPassword
				})
			});

			const result = await response.json();
			if (!result.success) throw new Error(result.message || 'Update failed');
			toast.success('Password updated successfully!');
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
		} catch (error) {
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
</script>

<div>
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<User class="h-8 w-8 text-blue-600 dark:text-gray-400" />
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Account Settings</h1>
		</div>
	</div>

	{#if error}
		<!-- Error State -->
		<div class="flex items-center justify-center py-12">
			<div class="text-center">
				<p class="text-red-600 dark:text-red-400">{error}</p>
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
				<p class="mt-1 text-sm text-gray-600 dark:text-gray-100">Manage your personal information and account details</p>
			</div>

			<div class="space-y-6">
				<div>
					<label for="email" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Email Address</label>
					<input
						id="email"
						type="email"
						value={profile?.email}
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
							bind:value={firstNameInput}
							placeholder="Enter your first name"
							class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
						/>
					</div>

					<div>
						<label for="lastName" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Last Name</label>
						<input
							id="lastName"
							type="text"
							bind:value={lastNameInput}
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
				<p class="mt-1 text-sm text-gray-600 dark:text-gray-100">Manage your password and security preferences</p>
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
				<p class="mt-1 text-sm text-gray-600 dark:text-gray-100">Configure your language, units, and display preferences</p>
			</div>

			<div class="grid gap-6 md:grid-cols-2">
				<div>
					<label for="language" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Preferred Language</label>
					<select
						id="language"
						bind:value={preferredLanguageInput}
						class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
					>
						{#each languages as language}
							<option value={language}>{language}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="notificationsEnabled" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Notifications Enabled</label>
					<select
						id="notificationsEnabled"
						bind:value={notificationsEnabledInput}
						class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
					>
						<option value={true}>Enabled</option>
						<option value={false}>Disabled</option>
					</select>
				</div>

				<div>
					<label for="timezone" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Timezone</label>
					<select
						id="timezone"
						bind:value={timezoneInput}
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