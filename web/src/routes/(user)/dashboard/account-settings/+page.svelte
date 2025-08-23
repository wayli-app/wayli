<script lang="ts">
	import { User, Globe, Shield, Trash2, Info, Lock, MapPin, Plus, Pencil } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import TwoFactorDisable from '$lib/components/TwoFactorDisable.svelte';
	import TwoFactorSetup from '$lib/components/TwoFactorSetup.svelte';
	import LanguageSelector from '$lib/components/ui/language-selector/index.svelte';
	import { translate, changeLocale, currentLocale, type SupportedLocale } from '$lib/i18n';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { sessionStore } from '$lib/stores/auth';
	import { supabase } from '$lib/supabase';

	import type { UserProfile, UserPreferences } from '$lib/types/user.types';

	// Use the reactive translation function
	let t = $derived($translate);

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let twoFactorEnabled = $state(false);
	let isUpdatingPassword = $state(false);
	let isUpdatingProfile = $state(false);
	let isUpdatingPreferences = $state(false);
	let showTwoFactorSetup = $state(false);
	let showTwoFactorDisable = $state(false);
	let profile = $state<UserProfile | null>(null);
	let preferences = $state<UserPreferences | null>(null);
	let firstNameInput = $state('');
	let lastNameInput = $state('');

	let pexelsApiKeyInput = $state('');
	let serverPexelsApiKeyAvailable = $state(false);
	let error = $state<string | null>(null);
	let homeAddressInput = $state('');
	let homeAddressInputElement: HTMLInputElement | undefined = $state(undefined);
	let isHomeAddressSearching = $state(false);
	let homeAddressSuggestions = $state<any[]>([]);
	let showHomeAddressSuggestions = $state(false);
	let selectedHomeAddress = $state<any | null>(null);
	let selectedHomeAddressIndex = $state(-1);
	let homeAddressSearchTimeout: ReturnType<typeof setTimeout> | null = null;
	let homeAddressSearchError = $state<string | null>(null);

	// Trip exclusions state
	let tripExclusions: any[] = $state([]);
	let showAddExclusionModal = $state(false);
	let showEditExclusionModal = $state(false);
	let newExclusion = $state({
		name: '',
		location: null as any
	});
	let editingExclusion = $state({
		id: '',
		name: '',
		location: null as any
	});
	let isAddingExclusion = $state(false);
	let isEditingExclusion = $state(false);
	let isDeletingExclusion = $state(false);

	// Trip exclusion address search state
	let exclusionAddressInput = $state('');
	let exclusionAddressInputElement: HTMLInputElement | undefined = $state(undefined);
	let isExclusionAddressSearching = $state(false);
	let exclusionAddressSuggestions: any[] = $state([]);
	let showExclusionAddressSuggestions = $state(false);
	let selectedExclusionAddress: any | null = $state(null);
	let selectedExclusionAddressIndex = $state(-1);
	let exclusionAddressSearchTimeout: ReturnType<typeof setTimeout> | null = null;
	let exclusionAddressSearchError: string | null = $state(null);

	// Edit exclusion address search state
	let editExclusionAddressInput = $state('');
	let editExclusionAddressInputElement: HTMLInputElement | undefined = $state(undefined);
	let isEditExclusionAddressSearching = $state(false);
	let editExclusionAddressSuggestions: any[] = $state([]);
	let showEditExclusionAddressSuggestions = $state(false);
	let selectedEditExclusionAddress: any | null = $state(null);
	let selectedEditExclusionAddressIndex = $state(-1);
	let editExclusionAddressSearchTimeout: ReturnType<typeof setTimeout> | null = null;
	let editExclusionAddressSearchError: string | null = $state(null);

	// Language selector handler
	function handleLanguageChange(data: { locale: SupportedLocale }) {
		const { locale } = data;
		changeLocale(locale);
	}

	async function loadUserData() {
		try {
			const session = await supabase.auth.getSession();
			if (!session.data.session) {
				throw new Error('No session found');
			}

			const serviceAdapter = new ServiceAdapter({ session: session.data.session });

			// Load profile and preferences separately
			const [profileResult, preferencesResult] = await Promise.all([
				serviceAdapter.getProfile(),
				serviceAdapter.getPreferences()
			]);

			// Handle profile data - Edge Functions return { success: true, data: ... }
			if (profileResult && typeof profileResult === 'object' && profileResult !== null) {
				const profileData = (profileResult as any).data || profileResult;
				profile = profileData as UserProfile;
				firstNameInput = profile.first_name || '';
				lastNameInput = profile.last_name || '';

				// Initialize home address if it exists
				if (profile.home_address) {
					if (typeof profile.home_address === 'string') {
						homeAddressInput = profile.home_address;
					} else if (
						typeof profile.home_address === 'object' &&
						(profile.home_address as any).display_name
					) {
						homeAddressInput = (profile.home_address as any).display_name;
						selectedHomeAddress = profile.home_address;
					}
				}
			}

			// Handle preferences data - Edge Functions return { success: true, data: ... }
			if (
				preferencesResult &&
				typeof preferencesResult === 'object' &&
				preferencesResult !== null
			) {
				const preferencesData = (preferencesResult as any).data || preferencesResult;
				preferences = preferencesData as UserPreferences;
				// timezoneInput = preferences.timezone || 'UTC+00:00 (London, Dublin)'; // Timezone selection hidden
				pexelsApiKeyInput = preferences.pexels_api_key || '';

				// Check if server-side Pexels API key is available
				if (preferencesData?.server_pexels_api_key_available) {
					serverPexelsApiKeyAvailable = true;
				}
			}

			// Check 2FA status using the auth-check-2fa endpoint
			try {
				console.log('🔍 [AccountSettings] Checking 2FA status...');
				const twoFactorResult = (await serviceAdapter.check2FA()) as any;
				console.log('📡 [AccountSettings] 2FA check result:', twoFactorResult);

				if (twoFactorResult && typeof twoFactorResult === 'object') {
					const twoFactorData = twoFactorResult.data || twoFactorResult;
					console.log('📊 [AccountSettings] 2FA data:', twoFactorData);
					twoFactorEnabled = twoFactorData.enabled || false;
					console.log('✅ [AccountSettings] 2FA enabled:', twoFactorEnabled);
				} else {
					console.log('⚠️ [AccountSettings] Invalid 2FA result format:', twoFactorResult);
					twoFactorEnabled = false;
				}
			} catch (error) {
				console.error('❌ [AccountSettings] Error checking 2FA status:', error);
				twoFactorEnabled = false;
			}
		} catch (error) {
			console.error('❌ [AccountSettings] Error loading user data:', error);
		}
	}

	onMount(async () => {
		await loadUserData();
		await loadTripExclusions();
	});

	async function loadTripExclusions() {
		try {
			const session = $sessionStore;
			if (!session) return;

			const serviceAdapter = new ServiceAdapter({ session });
			const result = (await serviceAdapter.getTripExclusions()) as any;

			// Edge Functions return { success: true, data: ... }
			const exclusionsData = result.data || result;
			tripExclusions = exclusionsData.exclusions || [];
		} catch (error) {
			console.error('❌ [AccountSettings] Error loading trip exclusions:', error);
		}
	}

	async function handleAddExclusion() {
		if (!newExclusion.name || !newExclusion.location) {
			toast.error('Please fill in all fields');
			return;
		}

		isAddingExclusion = true;
		try {
			const session = $sessionStore;
			if (!session) throw new Error('No session found');

			const serviceAdapter = new ServiceAdapter({ session });
			const result = (await serviceAdapter.createTripExclusion({
				name: newExclusion.name,
				location: newExclusion.location
			})) as any;

			// Edge Functions return { success: true, data: ... }
			const exclusionData = result.data || result;
			tripExclusions = [exclusionData.exclusion, ...tripExclusions];
			newExclusion = { name: '', location: null };
			exclusionAddressInput = '';
			selectedExclusionAddress = null;
			showAddExclusionModal = false;
			toast.success('Trip exclusion added successfully');
		} catch (error) {
			console.error('Error adding exclusion:', error);
			toast.error('Failed to add exclusion');
		} finally {
			isAddingExclusion = false;
		}
	}

	async function handleDeleteExclusion(exclusionId: string) {
		isDeletingExclusion = true;
		try {
			const session = $sessionStore;
			if (!session) throw new Error('No session found');

			const serviceAdapter = new ServiceAdapter({ session });
			await serviceAdapter.deleteTripExclusion(exclusionId);

			tripExclusions = tripExclusions.filter((ex) => ex.id !== exclusionId);
			toast.success('Trip exclusion deleted successfully');
		} catch (error) {
			console.error('Error deleting exclusion:', error);
			toast.error('Failed to delete exclusion');
		} finally {
			isDeletingExclusion = false;
		}
	}

	async function handleSaveProfile() {
		if (!profile) return;

		isUpdatingProfile = true;
		error = null;

		try {
			const session = await supabase.auth.getSession();
			if (!session.data.session) {
				throw new Error('No session found');
			}

			const serviceAdapter = new ServiceAdapter({ session: session.data.session });

			// Update profile data
			profile.first_name = firstNameInput.trim();
			profile.last_name = lastNameInput.trim();
			profile.home_address = selectedHomeAddress || homeAddressInput.trim() || null;

			// Update profile using service adapter
			await serviceAdapter.updateProfile({
				first_name: profile.first_name,
				last_name: profile.last_name,
				email: profile.email || '',
				home_address: profile.home_address
			});

			toast.success('Profile updated successfully!');
		} catch (error) {
			console.error('❌ [AccountSettings] Error updating profile:', error);
			toast.error('Failed to update profile. Please try again.');
		} finally {
			isUpdatingProfile = false;
		}
	}

	async function handleSavePreferences() {
		if (!preferences) return;

		isUpdatingPreferences = true;
		error = null;

		try {
			const session = await supabase.auth.getSession();
			if (!session.data.session) {
				throw new Error('No session found');
			}

			const serviceAdapter = new ServiceAdapter({ session: session.data.session });

			// Update preferences data (language is already updated via the language selector handler)
			// preferences.timezone = timezoneInput; // Timezone selection hidden
			preferences.pexels_api_key = pexelsApiKeyInput.trim();

			// Update preferences using service adapter
			await serviceAdapter.updatePreferences({
				language: preferences.language,
				// timezone: preferences.timezone, // Timezone selection hidden
				pexels_api_key: preferences.pexels_api_key
			});

			// Only adjust client locale if it differs from the just-saved preference
			if (preferences.language && preferences.language !== $currentLocale) {
				await changeLocale(preferences.language as SupportedLocale);
			}

			toast.success('Preferences updated successfully!');
		} catch (error) {
			console.error('❌ [AccountSettings] Error updating preferences:', error);
			toast.error('Failed to update preferences. Please try again.');
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
			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (!session) throw new Error('No session found');
			const serviceAdapter = new ServiceAdapter({ session });
			await serviceAdapter.updatePassword(newPassword);
			toast.success('Password updated successfully!');
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
		} catch {
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

	function handleHomeAddressInput(event: Event) {
		const target = event.target as HTMLInputElement;
		homeAddressInput = target.value;
		selectedHomeAddressIndex = -1;
		selectedHomeAddress = null;
		if (homeAddressSearchTimeout) clearTimeout(homeAddressSearchTimeout);
		if (!homeAddressInput.trim()) {
			homeAddressSuggestions = [];
			showHomeAddressSuggestions = false;
			return;
		}
		homeAddressSearchTimeout = setTimeout(() => searchHomeAddress(), 300);
	}

	function handleHomeAddressKeydown(event: KeyboardEvent) {
		if (!showHomeAddressSuggestions || homeAddressSuggestions.length === 0) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedHomeAddressIndex = Math.min(
					selectedHomeAddressIndex + 1,
					homeAddressSuggestions.length - 1
				);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedHomeAddressIndex = Math.max(selectedHomeAddressIndex - 1, 0);
				break;
			case 'Enter':
				event.preventDefault();
				if (
					selectedHomeAddressIndex >= 0 &&
					selectedHomeAddressIndex < homeAddressSuggestions.length
				) {
					selectHomeAddress(homeAddressSuggestions[selectedHomeAddressIndex]);
				}
				break;
			case 'Escape':
				event.preventDefault();
				showHomeAddressSuggestions = false;
				selectedHomeAddressIndex = -1;
				break;
		}
	}

	async function searchHomeAddress() {
		if (!homeAddressInput.trim()) {
			homeAddressSuggestions = [];
			showHomeAddressSuggestions = false;
			return;
		}

		isHomeAddressSearching = true;
		homeAddressSearchError = null;

		try {
			const session = $sessionStore;
			if (!session) return;

			const serviceAdapter = new ServiceAdapter({ session });
			const result = (await serviceAdapter.searchGeocode(homeAddressInput)) as any;

			// The Edge Functions service returns the data array directly
			homeAddressSuggestions = Array.isArray(result) ? result : [];
			showHomeAddressSuggestions = homeAddressSuggestions.length > 0;
		} catch (error) {
			console.error('❌ [AccountSettings] Error searching for home address:', error);
			homeAddressSearchError = 'Failed to search for address';
			homeAddressSuggestions = [];
			showHomeAddressSuggestions = false;
		} finally {
			isHomeAddressSearching = false;
		}
	}

	function selectHomeAddress(suggestion: any) {
		selectedHomeAddress = suggestion;
		homeAddressInput = suggestion.display_name;
		showHomeAddressSuggestions = false;
		homeAddressSuggestions = [];
	}

	// Trip exclusion address search functions
	function handleExclusionAddressInput(event: Event) {
		const target = event.target as HTMLInputElement;
		exclusionAddressInput = target.value;
		selectedExclusionAddressIndex = -1;
		selectedExclusionAddress = null;
		if (exclusionAddressSearchTimeout) clearTimeout(exclusionAddressSearchTimeout);
		if (!exclusionAddressInput.trim()) {
			exclusionAddressSuggestions = [];
			showExclusionAddressSuggestions = false;
			return;
		}
		exclusionAddressSearchTimeout = setTimeout(() => searchExclusionAddressSuggestions(), 300);
	}

	function handleExclusionAddressKeydown(event: KeyboardEvent) {
		if (!showExclusionAddressSuggestions || exclusionAddressSuggestions.length === 0) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedExclusionAddressIndex = Math.min(
					selectedExclusionAddressIndex + 1,
					exclusionAddressSuggestions.length - 1
				);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedExclusionAddressIndex = Math.max(selectedExclusionAddressIndex - 1, 0);
				break;
			case 'Enter':
				event.preventDefault();
				if (
					selectedExclusionAddressIndex >= 0 &&
					selectedExclusionAddressIndex < exclusionAddressSuggestions.length
				) {
					selectExclusionAddress(exclusionAddressSuggestions[selectedExclusionAddressIndex]);
				}
				break;
			case 'Escape':
				event.preventDefault();
				showExclusionAddressSuggestions = false;
				selectedExclusionAddressIndex = -1;
				break;
		}
	}

	async function searchExclusionAddressSuggestions() {
		if (!exclusionAddressInput.trim() || exclusionAddressInput.trim().length < 3) {
			exclusionAddressSuggestions = [];
			showExclusionAddressSuggestions = false;
			exclusionAddressSearchError = null;
			return;
		}
		isExclusionAddressSearching = true;
		showExclusionAddressSuggestions = true;
		exclusionAddressSearchError = null;
		try {
			const session = $sessionStore;
			if (!session) return;

			const serviceAdapter = new ServiceAdapter({ session });
			const data = (await serviceAdapter.searchGeocode(exclusionAddressInput.trim())) as any;

			// The Edge Functions service returns the data array directly
			if (Array.isArray(data)) {
				exclusionAddressSuggestions = data.map((result: any) => ({
					display_name: result.display_name,
					coordinates: {
						lat: parseFloat(result.lat),
						lng: parseFloat(result.lon)
					},
					address: result.address
				}));
				showExclusionAddressSuggestions = true;
				if (exclusionAddressSuggestions.length === 0) {
					exclusionAddressSearchError = 'No addresses found';
				}
			} else {
				exclusionAddressSuggestions = [];
				exclusionAddressSearchError = 'No addresses found';
				showExclusionAddressSuggestions = true;
			}
		} catch (error) {
			console.error('Error searching for exclusion address:', error);
			exclusionAddressSuggestions = [];
			exclusionAddressSearchError = 'Failed to search for address';
			showExclusionAddressSuggestions = true;
		} finally {
			isExclusionAddressSearching = false;
		}
	}

	function selectExclusionAddress(suggestion: any) {
		exclusionAddressInput = suggestion.display_name;
		selectedExclusionAddress = suggestion;
		newExclusion.location = suggestion;
		showExclusionAddressSuggestions = false;
		selectedExclusionAddressIndex = -1;
	}

	// Edit exclusion functions
	function handleEditExclusion(exclusion: any) {
		editingExclusion = {
			id: exclusion.id,
			name: exclusion.name,
			location: exclusion.location
		};
		editExclusionAddressInput = exclusion.location.display_name;
		selectedEditExclusionAddress = exclusion.location;
		showEditExclusionModal = true;
	}

	async function handleUpdateExclusion() {
		if (!editingExclusion.name || !editingExclusion.location) {
			toast.error('Please fill in all fields');
			return;
		}

		isEditingExclusion = true;
		try {
			const session = $sessionStore;
			if (!session) throw new Error('No session found');

			const serviceAdapter = new ServiceAdapter({ session });
			const result = (await serviceAdapter.updateTripExclusion({
				id: editingExclusion.id,
				name: editingExclusion.name,
				location: editingExclusion.location
			})) as any;

			if (result.success) {
				// Update the exclusion in the local array
				const index = tripExclusions.findIndex((ex) => ex.id === editingExclusion.id);
				if (index !== -1) {
					tripExclusions[index] = result.data.exclusion;
				}

				// Reset form
				editingExclusion = { id: '', name: '', location: null };
				editExclusionAddressInput = '';
				selectedEditExclusionAddress = null;
				showEditExclusionModal = false;
				toast.success('Trip exclusion updated successfully');
			}
		} catch (error) {
			console.error('Error updating exclusion:', error);
			toast.error('Failed to update exclusion');
		} finally {
			isEditingExclusion = false;
		}
	}

	// Edit exclusion address search functions
	function handleEditExclusionAddressInput(event: Event) {
		const target = event.target as HTMLInputElement;
		editExclusionAddressInput = target.value;
		selectedEditExclusionAddressIndex = -1;
		selectedEditExclusionAddress = null;
		if (editExclusionAddressSearchTimeout) clearTimeout(editExclusionAddressSearchTimeout);
		if (!editExclusionAddressInput.trim()) {
			editExclusionAddressSuggestions = [];
			showEditExclusionAddressSuggestions = false;
			return;
		}
		editExclusionAddressSearchTimeout = setTimeout(
			() => searchEditExclusionAddressSuggestions(),
			300
		);
	}

	function handleEditExclusionAddressKeydown(event: KeyboardEvent) {
		if (!showEditExclusionAddressSuggestions || editExclusionAddressSuggestions.length === 0)
			return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedEditExclusionAddressIndex = Math.min(
					selectedEditExclusionAddressIndex + 1,
					editExclusionAddressSuggestions.length - 1
				);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedEditExclusionAddressIndex = Math.max(selectedEditExclusionAddressIndex - 1, 0);
				break;
			case 'Enter':
				event.preventDefault();
				if (
					selectedEditExclusionAddressIndex >= 0 &&
					selectedEditExclusionAddressIndex < editExclusionAddressSuggestions.length
				) {
					selectEditExclusionAddress(
						editExclusionAddressSuggestions[selectedEditExclusionAddressIndex]
					);
				}
				break;
			case 'Escape':
				event.preventDefault();
				showEditExclusionAddressSuggestions = false;
				selectedEditExclusionAddressIndex = -1;
				break;
		}
	}

	async function searchEditExclusionAddressSuggestions() {
		if (!editExclusionAddressInput.trim() || editExclusionAddressInput.trim().length < 3) {
			editExclusionAddressSuggestions = [];
			showEditExclusionAddressSuggestions = false;
			editExclusionAddressSearchError = null;
			return;
		}
		isEditExclusionAddressSearching = true;
		showEditExclusionAddressSuggestions = true;
		editExclusionAddressSearchError = null;
		try {
			const session = $sessionStore;
			if (!session) return;

			const serviceAdapter = new ServiceAdapter({ session });
			const data = (await serviceAdapter.searchGeocode(editExclusionAddressInput.trim())) as any;

			// The Edge Functions service returns the data array directly
			if (Array.isArray(data)) {
				editExclusionAddressSuggestions = data.map((result: any) => ({
					display_name: result.display_name,
					coordinates: {
						lat: parseFloat(result.lat),
						lng: parseFloat(result.lon)
					},
					address: result.address
				}));
				showEditExclusionAddressSuggestions = true;
				if (editExclusionAddressSuggestions.length === 0) {
					editExclusionAddressSearchError = 'No addresses found';
				}
			} else {
				editExclusionAddressSuggestions = [];
				editExclusionAddressSearchError = 'No addresses found';
				showEditExclusionAddressSuggestions = true;
			}
		} catch (error) {
			console.error('Error searching for edit exclusion address:', error);
			editExclusionAddressSuggestions = [];
			editExclusionAddressSearchError = 'Failed to search for address';
			showEditExclusionAddressSuggestions = true;
		} finally {
			isEditExclusionAddressSearching = false;
		}
	}

	function selectEditExclusionAddress(suggestion: any) {
		editExclusionAddressInput = suggestion.display_name;
		selectedEditExclusionAddress = suggestion;
		editingExclusion.location = suggestion;
		showEditExclusionAddressSuggestions = false;
		selectedEditExclusionAddressIndex = -1;
	}
</script>

<div>
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<User class="h-8 w-8 text-blue-600 dark:text-gray-400" />
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
				Account Settings
			</h1>
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
		<div
			class="mb-8 rounded-xl border border-[rgb(218,218,221)] bg-white p-6 dark:border-[#23232a] dark:bg-[#23232a]"
		>
			<div class="mb-6">
				<div
					class="flex items-center gap-2"
					role="group"
					aria-labelledby="preferred-language-label"
				>
					<User class="h-5 w-5 text-gray-400" />
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
						{t('accountSettings.profile')}
					</h2>
				</div>
				<p class="mt-1 text-sm text-gray-600 dark:text-gray-100">
					{t('accountSettings.profileDescription')}
				</p>
			</div>

			<div class="space-y-6">
				<!-- Email Address Field (restored) -->
				<div class="mb-4">
					<label
						for="email"
						class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100"
						>{t('accountSettings.email')}</label
					>
					<input
						id="email"
						type="email"
						value={profile?.email}
						disabled
						class="w-full rounded-md border border-[rgb(218,218,221)] bg-gray-50 px-3 py-2 text-sm text-gray-500 placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:bg-gray-700 dark:text-gray-400 dark:placeholder:text-gray-400"
					/>
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
						{t('accountSettings.emailCannotChange')}
					</p>
				</div>

				<!-- Home Address Autocomplete Field -->
				<div class="mb-4">
					<label
						for="homeAddress"
						class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100"
						>Home Address</label
					>
					<div class="relative">
						<input
							id="homeAddress"
							type="text"
							bind:value={homeAddressInput}
							bind:this={homeAddressInputElement}
							oninput={handleHomeAddressInput}
							onkeydown={handleHomeAddressKeydown}
							placeholder={t('accountSettings.startTypingHomeAddress')}
							class="w-full rounded-md border border-[rgb(218,218,221)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:bg-[#23232a] dark:text-gray-100 dark:placeholder:text-gray-400"
						/>
						{#if isHomeAddressSearching}
							<div class="absolute top-1/2 right-3 -translate-y-1/2">
								<div
									class="h-4 w-4 animate-spin rounded-full border-2 border-[rgb(37,140,244)] border-t-transparent"
								></div>
							</div>
						{/if}
					</div>
					{#if homeAddressSuggestions.length > 0 && showHomeAddressSuggestions}
						<div
							class="mt-1 max-h-48 overflow-y-auto rounded-md border border-[rgb(218,218,221)] bg-white shadow-lg dark:border-[#3f3f46] dark:bg-[#23232a]"
						>
							{#each homeAddressSuggestions as suggestion, index (suggestion.display_name + index)}
								<button
									type="button"
									class="w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none dark:text-gray-100 dark:hover:bg-[#2d2d35] dark:focus:bg-[#2d2d35] {selectedHomeAddressIndex ===
									index
										? 'bg-[rgb(37,140,244)]/10 dark:bg-[rgb(37,140,244)]/20'
										: ''}"
									onclick={() => selectHomeAddress(suggestion)}
								>
									<div class="font-medium">{suggestion.display_name}</div>
									{#if suggestion.coordinates}
										<div class="text-xs text-gray-500 dark:text-gray-400">
											📍 {suggestion.coordinates.lat.toFixed(6)}, {suggestion.coordinates.lng.toFixed(
												6
											)}
										</div>
									{/if}
								</button>
							{/each}
							{#if homeAddressSearchError}
								<div
									class="cursor-default px-3 py-2 text-center text-sm text-gray-500 select-none dark:text-gray-400"
								>
									{homeAddressSearchError}
								</div>
							{/if}
						</div>
					{:else if showHomeAddressSuggestions && homeAddressSearchError}
						<div
							class="mt-1 max-h-48 overflow-y-auto rounded-md border border-[rgb(218,218,221)] bg-white shadow-lg dark:border-[#3f3f46] dark:bg-[#23232a]"
						>
							<div
								class="cursor-default px-3 py-2 text-center text-sm text-gray-500 select-none dark:text-gray-400"
							>
								{homeAddressSearchError}
							</div>
						</div>
					{/if}
					{#if selectedHomeAddress && selectedHomeAddress.coordinates}
						<div
							class="mt-2 rounded-md border border-green-200 bg-green-50 p-2 dark:border-green-800 dark:bg-green-900/20"
						>
							<div class="text-sm text-green-800 dark:text-green-200">
								📍 Coordinates: {selectedHomeAddress.coordinates.lat.toFixed(6)}, {selectedHomeAddress.coordinates.lng.toFixed(
									6
								)}
							</div>
							<div class="mt-1 text-xs text-green-600 dark:text-green-300">
								{selectedHomeAddress.display_name}
							</div>
						</div>
					{/if}
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Used for trip generation.</p>
				</div>

				<div class="grid gap-6 md:grid-cols-2">
					<div>
						<label
							for="firstName"
							class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100"
							>{t('accountSettings.firstName')}</label
						>
						<input
							id="firstName"
							type="text"
							bind:value={firstNameInput}
							placeholder={t('accountSettings.enterFirstName')}
							class="w-full rounded-md border border-[rgb(218,218,221)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:bg-[#23232a] dark:text-gray-100 dark:placeholder:text-gray-400"
						/>
					</div>

					<div>
						<label
							for="lastName"
							class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100"
							>{t('accountSettings.lastName')}</label
						>
						<input
							id="lastName"
							type="text"
							bind:value={lastNameInput}
							placeholder={t('accountSettings.enterLastName')}
							class="w-full rounded-md border border-[rgb(218,218,221)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:bg-[#23232a] dark:text-gray-100 dark:placeholder:text-gray-400"
						/>
					</div>
				</div>
			</div>

			<button
				class="mt-6 cursor-pointer rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90 disabled:cursor-not-allowed disabled:opacity-50"
				onclick={handleSaveProfile}
				disabled={isUpdatingProfile}
			>
				{isUpdatingProfile ? t('accountSettings.savingChanges') : t('accountSettings.saveChanges')}
			</button>
		</div>

		<!-- Security Settings -->
		<div
			class="mb-8 rounded-xl border border-[rgb(218,218,221)] bg-white p-6 dark:border-[#23232a] dark:bg-[#23232a]"
		>
			<div class="mb-6">
				<div class="flex items-center gap-2">
					<Lock class="h-5 w-5 text-gray-400" />
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
						{t('accountSettings.security')}
					</h2>
				</div>
				<p class="mt-1 text-sm text-gray-600 dark:text-gray-100">
					{t('accountSettings.securityDescription')}
				</p>
			</div>

			<div class="space-y-4">
				<div>
					<label
						for="currentPassword"
						class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100"
						>{t('accountSettings.currentPassword')}</label
					>
					<input
						id="currentPassword"
						type="password"
						bind:value={currentPassword}
						class="w-full rounded-md border border-[rgb(218,218,221)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:bg-[#23232a] dark:text-gray-100 dark:placeholder:text-gray-400"
					/>
				</div>

				<div class="grid gap-4 md:grid-cols-2">
					<div>
						<label
							for="newPassword"
							class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100"
							>{t('accountSettings.newPassword')}</label
						>
						<input
							id="newPassword"
							type="password"
							bind:value={newPassword}
							class="w-full rounded-md border border-[rgb(218,218,221)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:bg-[#23232a] dark:text-gray-100 dark:placeholder:text-gray-400"
						/>
					</div>

					<div>
						<label
							for="confirmPassword"
							class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100"
							>{t('accountSettings.confirmPassword')}</label
						>
						<input
							id="confirmPassword"
							type="password"
							bind:value={confirmPassword}
							class="w-full rounded-md border border-[rgb(218,218,221)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:bg-[#23232a] dark:text-gray-100 dark:placeholder:text-gray-400"
						/>
					</div>
				</div>

				<button
					class="cursor-pointer rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90 disabled:cursor-not-allowed disabled:opacity-50"
					onclick={handleUpdatePassword}
					disabled={isUpdatingPassword}
				>
					{isUpdatingPassword
						? t('accountSettings.updatingPassword')
						: t('accountSettings.updatePassword')}
				</button>

				<!-- Two-Factor Authentication Section -->
				<div class="mt-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<Shield class="h-5 w-5 text-gray-400" />
							<div>
								<h3 class="text-sm font-medium text-gray-900 dark:text-gray-100">
									{t('accountSettings.twoFactorAuth')}
								</h3>
								<p class="text-sm text-gray-600 dark:text-gray-400">
									{#if twoFactorEnabled}
										{t('accountSettings.twoFactorEnabled')}
									{:else}
										{t('accountSettings.twoFactorDisabled')}
									{/if}
								</p>
							</div>
						</div>

						{#if twoFactorEnabled}
							<div class="flex items-center gap-2">
								<span
									class="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/20 dark:text-green-400"
								>
									{t('accountSettings.enabled')}
								</span>
								<button
									class="cursor-pointer text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
									onclick={handleTwoFactorDisable}
								>
									{t('accountSettings.disable')}
								</button>
							</div>
						{:else}
							<button
								class="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[rgb(37,140,244)]/10 px-3 py-1.5 text-sm font-medium text-[rgb(37,140,244)] hover:bg-[rgb(37,140,244)]/20"
								onclick={handleTwoFactorEnabled}
							>
								<Shield class="h-4 w-4" />
								{t('accountSettings.setup2FA')}
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Preferences -->
		<div
			class="rounded-xl border border-[rgb(218,218,221)] bg-white p-6 dark:border-[#23232a] dark:bg-[#23232a]"
		>
			<div class="mb-6">
				<div class="flex items-center gap-2">
					<Globe class="h-5 w-5 text-gray-400" />
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
						{t('accountSettings.preferences')}
					</h2>
				</div>
				<p class="mt-1 text-sm text-gray-600 dark:text-gray-100">
					Configure your language, units, and display preferences
				</p>
			</div>

			<div class="grid gap-6 md:grid-cols-2">
				<div>
					<span
						class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100"
						id="preferred-language-label">{t('accountSettings.preferredLanguage')}</span
					>
					<div class="flex items-center" role="group" aria-labelledby="preferred-language-label">
						<LanguageSelector
							variant="default"
							size="md"
							showLabel={true}
							position="bottom-left"
							onChange={handleLanguageChange}
						/>
					</div>
				</div>

				<!-- Timezone selection hidden - using automatic timezone detection based on location -->
				<!--
				<div>
					<label
						for="timezone"
						class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100"
						>Timezone</label
					>
					<select
						id="timezone"
						bind:value={timezoneInput}
						class="w-full rounded-md border border-[rgb(218,218,221)] bg-white px-3 py-2 text-sm text-gray-900 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:bg-[#23232a] dark:text-gray-100"
					>
						{#each timezones as tz}
							<option value={tz}>{tz}</option>
						{/each}
					</select>
				</div>
				-->
			</div>

			<!-- Pexels API Key Section - Only show if server key is not available -->
			{#if !serverPexelsApiKeyAvailable}
				<div
					class="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20"
				>
					<div class="flex items-start gap-3">
						<Info class="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
						<div class="flex-1">
							<h3 class="mb-1 text-sm font-medium text-blue-900 dark:text-blue-100">
								Trip Image Suggestions
							</h3>
							<p class="mb-3 text-sm text-blue-700 dark:text-blue-300">
								Configure a Pexels API key to get better quality trip image suggestions based on
								your travel destinations. Without an API key, the system will use fallback image
								services.
								<a
									href="https://www.pexels.com/api/"
									target="_blank"
									rel="noopener noreferrer"
									class="underline hover:text-blue-800 dark:hover:text-blue-200"
									>Get your free API key here</a
								>.
							</p>

							<div>
								<label
									for="pexels-api-key"
									class="mb-1 block text-sm font-medium text-blue-900 dark:text-blue-100"
									>Pexels API Key</label
								>
								<input
									type="text"
									id="pexels-api-key"
									bind:value={pexelsApiKeyInput}
									placeholder={t('accountSettings.enterPexelsApiKey')}
									class="w-full rounded-md border border-blue-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-blue-700 dark:bg-gray-800 dark:text-gray-100"
								/>
								<p class="mt-1 text-xs text-blue-600 dark:text-blue-400">
									{pexelsApiKeyInput
										? '✅ API key configured - high-quality trip image suggestions enabled'
										: 'ℹ️ No API key - trip image suggestions will use fallback services'}
								</p>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<button
				class="mt-6 cursor-pointer rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90 disabled:cursor-not-allowed disabled:opacity-50"
				onclick={handleSavePreferences}
				disabled={isUpdatingPreferences}
			>
				{isUpdatingPreferences
					? t('accountSettings.savingPreferences')
					: t('accountSettings.savePreferences')}
			</button>
		</div>

		<!-- Trip Exclusions -->
		<div
			class="mt-8 rounded-xl border border-[rgb(218,218,221)] bg-white p-6 dark:border-[#23232a] dark:bg-[#23232a]"
		>
			<div class="mb-6">
				<div class="flex items-center gap-2">
					<MapPin class="h-5 w-5 text-gray-400" />
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
						{t('accountSettings.tripExclusions')}
					</h2>
				</div>
				<p class="mt-1 text-sm text-gray-600 dark:text-gray-100">
					{t('accountSettings.tripExclusionsDescription')}
				</p>
			</div>

			<div class="space-y-4">
				{#if tripExclusions.length > 0}
					<div class="space-y-3">
						{#each tripExclusions as exclusion (exclusion.id)}
							<div
								class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
							>
								<div class="flex-1">
									<div class="font-medium text-gray-900 dark:text-gray-100">{exclusion.name}</div>
									<div class="text-sm text-gray-600 dark:text-gray-400">
										{exclusion.location.display_name}
									</div>
									{#if exclusion.location.coordinates}
										<div class="text-xs text-gray-500 dark:text-gray-500">
											📍 {exclusion.location.coordinates.lat.toFixed(6)}, {exclusion.location.coordinates.lng.toFixed(
												6
											)}
										</div>
									{/if}
								</div>
								<div class="flex items-center gap-2">
									<button
										onclick={() => handleEditExclusion(exclusion)}
										class="rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/20"
									>
										<Pencil class="h-4 w-4" />
									</button>
									<button
										onclick={() => handleDeleteExclusion(exclusion.id)}
										disabled={isDeletingExclusion}
										class="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:hover:bg-red-900/20"
									>
										<Trash2 class="h-4 w-4" />
									</button>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="py-8 text-center text-gray-500 dark:text-gray-400">
						<MapPin class="mx-auto mb-4 h-12 w-12 opacity-50" />
						<p>{t('accountSettings.noTripExclusions')}</p>
						<p class="text-sm">
							{t('accountSettings.addTripExclusionsHint')}
						</p>
					</div>
				{/if}

				{#if tripExclusions.length < 10}
					<button
						onclick={() => (showAddExclusionModal = true)}
						class="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-3 text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-300"
					>
						<Plus class="h-4 w-4" />
						{t('accountSettings.addTripExclusion')}
					</button>
				{:else}
					<div class="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
						{t('accountSettings.maxTripExclusionsReached')}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Two-Factor Authentication Setup Modal -->
<TwoFactorSetup
	open={showTwoFactorSetup}
	onClose={handleTwoFactorSetupClose}
	onEnabled={handleTwoFactorSetupClose}
/>

<!-- Two-Factor Authentication Disable Modal -->
<TwoFactorDisable
	open={showTwoFactorDisable}
	onClose={handleTwoFactorDisableClose}
	onDisabled={handleTwoFactorDisableClose}
/>

<!-- Add Trip Exclusion Modal -->
{#if showAddExclusionModal}
	<!-- Modal Overlay -->
	<div
		class="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/40 backdrop-blur-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
		tabindex="0"
		role="button"
		aria-label="Close modal"
		onclick={() => (showAddExclusionModal = false)}
		onkeydown={(e) => {
			if (e.key === 'Escape' || e.key === 'Enter') {
				e.preventDefault();
				showAddExclusionModal = false;
			}
		}}
	>
		<!-- Modal Box -->
		<div
			class="animate-fade-in relative w-full max-w-md cursor-default rounded-2xl border border-gray-200 bg-white p-8 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			tabindex="0"
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					showAddExclusionModal = false;
				}
			}}
		>
			<h3 class="mb-6 text-center text-2xl font-bold text-gray-900 dark:text-gray-100">
				Add Trip Exclusion
			</h3>
			<div class="space-y-6">
				<div>
					<label
						for="add-exclusion-name"
						class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label
					>
					<input
						id="add-exclusion-name"
						type="text"
						bind:value={newExclusion.name}
						placeholder={t('accountSettings.exclusionExampleLabel')}
						class="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-gray-900 transition focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
					/>
				</div>
				<div>
					<label
						for="add-exclusion-address"
						class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Address</label
					>
					<div class="relative">
						<input
							id="add-exclusion-address"
							type="text"
							bind:value={exclusionAddressInput}
							bind:this={exclusionAddressInputElement}
							oninput={handleExclusionAddressInput}
							onkeydown={handleExclusionAddressKeydown}
							placeholder={t('accountSettings.startTypingAddress')}
							class="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-gray-900 transition focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
						/>
						{#if isExclusionAddressSearching}
							<div class="absolute top-1/2 right-3 -translate-y-1/2">
								<div
									class="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
								></div>
							</div>
						{/if}
					</div>
					{#if exclusionAddressSuggestions.length > 0 && showExclusionAddressSuggestions}
						<div
							class="mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
						>
							{#each exclusionAddressSuggestions as suggestion, index (suggestion.display_name + index)}
								<button
									type="button"
									class="w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none dark:text-gray-100 dark:hover:bg-gray-700 dark:focus:bg-gray-700 {selectedExclusionAddressIndex ===
									index
										? 'bg-blue-500/10 dark:bg-blue-500/20'
										: ''}"
									onclick={() => selectExclusionAddress(suggestion)}
								>
									<div class="font-medium">{suggestion.display_name}</div>
									{#if suggestion.coordinates}
										<div class="text-xs text-gray-500 dark:text-gray-400">
											📍 {suggestion.coordinates.lat.toFixed(6)}, {suggestion.coordinates.lng.toFixed(
												6
											)}
										</div>
									{/if}
								</button>
							{/each}
							{#if exclusionAddressSearchError}
								<div
									class="cursor-default px-3 py-2 text-center text-sm text-gray-500 select-none dark:text-gray-400"
								>
									{exclusionAddressSearchError}
								</div>
							{/if}
						</div>
					{:else if showExclusionAddressSuggestions && exclusionAddressSearchError}
						<div
							class="mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
						>
							<div
								class="cursor-default px-3 py-2 text-center text-sm text-gray-500 select-none dark:text-gray-400"
							>
								{exclusionAddressSearchError}
							</div>
						</div>
					{/if}
					{#if selectedExclusionAddress && selectedExclusionAddress.coordinates}
						<div
							class="mt-2 rounded-md border border-green-200 bg-green-50 p-2 dark:border-green-800 dark:bg-green-900/20"
						>
							<div class="text-sm text-green-800 dark:text-green-200">
								📍 Coordinates: {selectedExclusionAddress.coordinates.lat.toFixed(6)}, {selectedExclusionAddress.coordinates.lng.toFixed(
									6
								)}
							</div>
							<div class="mt-1 text-xs text-green-600 dark:text-green-300">
								{selectedExclusionAddress.display_name}
							</div>
						</div>
					{/if}
				</div>
				<div class="mt-4 flex gap-3">
					<button
						onclick={handleAddExclusion}
						disabled={isAddingExclusion || !newExclusion.name || !newExclusion.location}
						class="flex-1 cursor-pointer rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow transition-all duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isAddingExclusion ? 'Adding...' : 'Add Exclusion'}
					</button>
					<button
						onclick={() => (showAddExclusionModal = false)}
						class="flex-1 cursor-pointer rounded-lg border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 shadow transition-all duration-200 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Trip Exclusion Modal -->
{#if showEditExclusionModal}
	<!-- Modal Overlay -->
	<div
		class="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/40 backdrop-blur-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
		tabindex="0"
		role="button"
		aria-label="Close modal"
		onclick={() => (showEditExclusionModal = false)}
		onkeydown={(e) => {
			if (e.key === 'Escape' || e.key === 'Enter') {
				e.preventDefault();
				showEditExclusionModal = false;
			}
		}}
	>
		<!-- Modal Box -->
		<div
			class="animate-fade-in relative w-full max-w-md cursor-default rounded-2xl border border-gray-200 bg-white p-8 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			tabindex="0"
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					showEditExclusionModal = false;
				}
			}}
		>
			<h3 class="mb-6 text-center text-2xl font-bold text-gray-900 dark:text-gray-100">
				Edit Trip Exclusion
			</h3>
			<div class="space-y-6">
				<div>
					<label
						for="edit-exclusion-name"
						class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label
					>
					<input
						id="edit-exclusion-name"
						type="text"
						bind:value={editingExclusion.name}
						placeholder={t('accountSettings.exclusionExampleLabel')}
						class="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-gray-900 transition focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
					/>
				</div>
				<div>
					<label
						for="edit-exclusion-address"
						class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Address</label
					>
					<div class="relative">
						<input
							id="edit-exclusion-address"
							type="text"
							bind:value={editExclusionAddressInput}
							bind:this={editExclusionAddressInputElement}
							oninput={handleEditExclusionAddressInput}
							onkeydown={handleEditExclusionAddressKeydown}
							placeholder={t('accountSettings.startTypingAddress')}
							class="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-gray-900 transition focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
						/>
						{#if isEditExclusionAddressSearching}
							<div class="absolute top-1/2 right-3 -translate-y-1/2">
								<div
									class="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
								></div>
							</div>
						{/if}
					</div>
					{#if editExclusionAddressSuggestions.length > 0 && showEditExclusionAddressSuggestions}
						<div
							class="mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
						>
							{#each editExclusionAddressSuggestions as suggestion, index (suggestion.display_name + index)}
								<button
									type="button"
									class="w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none dark:text-gray-100 dark:hover:bg-gray-700 dark:focus:bg-gray-700 {selectedEditExclusionAddressIndex ===
									index
										? 'bg-blue-500/10 dark:bg-blue-500/20'
										: ''}"
									onclick={() => selectEditExclusionAddress(suggestion)}
								>
									<div class="font-medium">{suggestion.display_name}</div>
									{#if suggestion.coordinates}
										<div class="text-xs text-gray-500 dark:text-gray-400">
											📍 {suggestion.coordinates.lat.toFixed(6)}, {suggestion.coordinates.lng.toFixed(
												6
											)}
										</div>
									{/if}
								</button>
							{/each}
							{#if editExclusionAddressSearchError}
								<div
									class="cursor-default px-3 py-2 text-center text-sm text-gray-500 select-none dark:text-gray-400"
								>
									{editExclusionAddressSearchError}
								</div>
							{/if}
						</div>
					{:else if showEditExclusionAddressSuggestions && editExclusionAddressSearchError}
						<div
							class="mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
						>
							<div
								class="cursor-default px-3 py-2 text-center text-sm text-gray-500 select-none dark:text-gray-400"
							>
								{editExclusionAddressSearchError}
							</div>
						</div>
					{/if}
					{#if selectedEditExclusionAddress && selectedEditExclusionAddress.coordinates}
						<div
							class="mt-2 rounded-md border border-green-200 bg-green-50 p-2 dark:border-green-800 dark:bg-green-900/20"
						>
							<div class="text-sm text-green-800 dark:text-green-200">
								📍 Coordinates: {selectedEditExclusionAddress.coordinates.lat.toFixed(6)}, {selectedEditExclusionAddress.coordinates.lng.toFixed(
									6
								)}
							</div>
							<div class="mt-1 text-xs text-green-600 dark:text-green-300">
								{selectedEditExclusionAddress.display_name}
							</div>
						</div>
					{/if}
				</div>
				<div class="mt-4 flex gap-3">
					<button
						onclick={handleUpdateExclusion}
						disabled={isEditingExclusion || !editingExclusion.name || !editingExclusion.location}
						class="flex-1 cursor-pointer rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow transition-all duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isEditingExclusion ? 'Updating...' : 'Update Exclusion'}
					</button>
					<button
						onclick={() => (showEditExclusionModal = false)}
						class="flex-1 cursor-pointer rounded-lg border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 shadow transition-all duration-200 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
