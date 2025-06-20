<script lang="ts">
	import { User, Lock, Globe } from 'lucide-svelte';
	import { supabase } from '$lib/supabase';
	import { toast } from 'svelte-sonner';

	let username = 'testuser';
	let email = 'user@email.com';
	let firstName = 'Test';
	let lastName = 'User';
	let currentPassword = '';
	let newPassword = '';
	let confirmPassword = '';
	let twoFactorEnabled = false;
	let preferredLanguage = 'English';
	let distanceUnit = 'Kilometers (km)';
	let temperatureUnit = 'Celsius (°C)';
	let timezone = 'UTC+0 (London)';

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

	async function handleSaveProfile() {
		try {
			const { error } = await supabase.auth.updateUser({
				data: {
					first_name: firstName,
					last_name: lastName,
					username: username
				}
			});

			if (error) throw error;
			toast.success('Profile updated successfully');
		} catch (error) {
			toast.error('Failed to update profile');
		}
	}

	async function handleUpdatePassword() {
		if (newPassword !== confirmPassword) {
			toast.error('Passwords do not match');
			return;
		}

		try {
			const { error } = await supabase.auth.updateUser({
				password: newPassword
			});

			if (error) throw error;
			toast.success('Password updated successfully');
			newPassword = '';
			confirmPassword = '';
			currentPassword = '';
		} catch (error) {
			toast.error('Failed to update password');
		}
	}
</script>

<div>
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<User class="h-7 w-7 text-[rgb(37,140,244)]" />
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Account Settings</h1>
		</div>
	</div>

	<!-- Profile Settings -->
	<div class="mb-8 rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6">
		<div class="mb-6">
			<div class="flex items-center gap-2">
				<User class="h-5 w-5 text-gray-400" />
				<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Profile Settings</h2>
			</div>
			<p class="mt-1 text-sm text-gray-600">Manage your personal information and account details</p>
		</div>

		<div class="grid gap-6 md:grid-cols-2">
			<div>
				<label for="username" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Username</label>
				<input
					id="username"
					type="text"
					bind:value={username}
					class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
				/>
			</div>

			<div>
				<label for="email" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Email Address</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
				/>
			</div>

			<div>
				<label for="firstName" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">First Name</label>
				<input
					id="firstName"
					type="text"
					bind:value={firstName}
					class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
				/>
			</div>

			<div>
				<label for="lastName" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Last Name</label>
				<input
					id="lastName"
					type="text"
					bind:value={lastName}
					class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
				/>
			</div>
		</div>

		<button
			class="mt-6 rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90 cursor-pointer"
			on:click={handleSaveProfile}
		>
			Save Profile Changes
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
				class="rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90 cursor-pointer"
				on:click={handleUpdatePassword}
			>
				Update Password
			</button>

			<div class="mt-6 flex items-center gap-3">
				<label for="twoFactor" class="text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Two-Factor Authentication</label>
				<div class="relative inline-flex cursor-pointer items-center">
					<input id="twoFactor" type="checkbox" bind:checked={twoFactorEnabled} class="peer sr-only">
					<div class="h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[rgb(37,140,244)] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-4 peer-focus:ring-[rgb(37,140,244)]/20"></div>
				</div>
				<p class="text-sm text-gray-600">Add an extra layer of security to your account</p>
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
	</div>
</div>