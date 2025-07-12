<script lang="ts">
	import { User, Settings, Bell, Globe, Shield, Key, QrCode, Download, Upload, Trash2, Save, X, Check, AlertCircle, Info, Lock, MapPin, Plus, Pencil } from 'lucide-svelte';
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

	let timezoneInput = 'UTC+00:00 (London, Dublin)';
	let error: string | null = null;
	let homeAddressInput = '';
	let homeAddressInputElement: HTMLInputElement | undefined;
	let isHomeAddressSearching = false;
	let homeAddressSuggestions: any[] = [];
	let showHomeAddressSuggestions = false;
	let selectedHomeAddress: any | null = null;
	let selectedHomeAddressIndex = -1;
	let homeAddressSearchTimeout: ReturnType<typeof setTimeout> | null = null;
	let homeAddressSearchError: string | null = null;

	// Trip exclusions state
	let tripExclusions: any[] = [];
	let showAddExclusionModal = false;
	let showEditExclusionModal = false;
	let newExclusion = {
		name: '',
		location: null as any
	};
	let editingExclusion = {
		id: '',
		name: '',
		location: null as any
	};
	let isAddingExclusion = false;
	let isEditingExclusion = false;
	let isDeletingExclusion = false;

	// Trip exclusion address search state
	let exclusionAddressInput = '';
	let exclusionAddressInputElement: HTMLInputElement | undefined;
	let isExclusionAddressSearching = false;
	let exclusionAddressSuggestions: any[] = [];
	let showExclusionAddressSuggestions = false;
	let selectedExclusionAddress: any | null = null;
	let selectedExclusionAddressIndex = -1;
	let exclusionAddressSearchTimeout: ReturnType<typeof setTimeout> | null = null;
	let exclusionAddressSearchError: string | null = null;

	// Edit exclusion address search state
	let editExclusionAddressInput = '';
	let editExclusionAddressInputElement: HTMLInputElement | undefined;
	let isEditExclusionAddressSearching = false;
	let editExclusionAddressSuggestions: any[] = [];
	let showEditExclusionAddressSuggestions = false;
	let selectedEditExclusionAddress: any | null = null;
	let selectedEditExclusionAddressIndex = -1;
	let editExclusionAddressSearchTimeout: ReturnType<typeof setTimeout> | null = null;
	let editExclusionAddressSearchError: string | null = null;

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

			// Get Supabase configuration
			const { getSupabaseConfig } = await import('$lib/core/config/environment');
			const config = getSupabaseConfig();

			// Make request with real access token
			const response = await fetch(`${config.url}/auth/v1/user`, {
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

			// Get Supabase configuration
			const { getSupabaseConfig } = await import('$lib/core/config/environment');
			const config = getSupabaseConfig();

			const response = await fetch(`${config.url}/auth/v1/user`, {
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

				// Initialize home address if it exists
				if (profile.home_address) {
					if (typeof profile.home_address === 'string') {
						homeAddressInput = profile.home_address;
					} else if (typeof profile.home_address === 'object' && profile.home_address.display_name) {
						homeAddressInput = profile.home_address.display_name;
						selectedHomeAddress = profile.home_address;
					}
				}
			}
			if (preferences) {
				preferredLanguageInput = preferences.language || 'en';
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
		await loadTripExclusions();
	});

	async function loadTripExclusions() {
		try {
			const response = await fetch('/api/v1/trip-exclusions', {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error('Failed to load trip exclusions');
			}

			const result = await response.json();
			if (result.success) {
				tripExclusions = result.data.exclusions || [];
			}
		} catch (error) {
			console.error('Error loading trip exclusions:', error);
		}
	}

	async function handleAddExclusion() {
		if (!newExclusion.name || !newExclusion.location) {
			toast.error('Please fill in all fields');
			return;
		}

		isAddingExclusion = true;
		try {
			const response = await fetch('/api/v1/trip-exclusions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					name: newExclusion.name,
					location: newExclusion.location
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to add exclusion');
			}

			const result = await response.json();
			if (result.success) {
				tripExclusions = [result.data.exclusion, ...tripExclusions];
				newExclusion = { name: '', location: null };
				exclusionAddressInput = '';
				selectedExclusionAddress = null;
				showAddExclusionModal = false;
				toast.success('Trip exclusion added successfully');
			}
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
			const response = await fetch('/api/v1/trip-exclusions', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ id: exclusionId })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to delete exclusion');
			}

			tripExclusions = tripExclusions.filter(ex => ex.id !== exclusionId);
			toast.success('Trip exclusion deleted successfully');
		} catch (error) {
			console.error('Error deleting exclusion:', error);
			toast.error('Failed to delete exclusion');
		} finally {
			isDeletingExclusion = false;
		}
	}

	async function handleSaveProfile() {
		console.log('handleSaveProfile called with:', { firstNameInput, lastNameInput, selectedHomeAddress });
		isUpdatingProfile = true;
		try {
			console.log('Step 1: Calling server API directly...');
			const body: any = {
				first_name: firstNameInput,
				last_name: lastNameInput
			};
			if (selectedHomeAddress) {
				body.home_address = selectedHomeAddress;
			}
			const response = await fetch('/api/v1/auth/profile', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body)
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
				if (selectedHomeAddress) {
					profile.home_address = selectedHomeAddress;
				}
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
		console.log('handleSavePreferences called with:', { preferredLanguageInput, timezoneInput });
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
		homeAddressSearchTimeout = setTimeout(() => searchHomeAddressSuggestions(), 300);
	}

	function handleHomeAddressKeydown(event: KeyboardEvent) {
		if (!showHomeAddressSuggestions || homeAddressSuggestions.length === 0) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedHomeAddressIndex = Math.min(selectedHomeAddressIndex + 1, homeAddressSuggestions.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedHomeAddressIndex = Math.max(selectedHomeAddressIndex - 1, 0);
				break;
			case 'Enter':
				event.preventDefault();
				if (selectedHomeAddressIndex >= 0 && selectedHomeAddressIndex < homeAddressSuggestions.length) {
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

	async function searchHomeAddressSuggestions() {
		if (!homeAddressInput.trim() || homeAddressInput.trim().length < 3) {
			homeAddressSuggestions = [];
			showHomeAddressSuggestions = false;
			homeAddressSearchError = null;
			return;
		}
		isHomeAddressSearching = true;
		showHomeAddressSuggestions = true;
		homeAddressSearchError = null;
		try {
			const response = await fetch(`/api/v1/geocode/search?q=${encodeURIComponent(homeAddressInput.trim())}`);
			const data = await response.json();
			const results = data.data?.results;
			if (response.ok && data.success && Array.isArray(results)) {
				homeAddressSuggestions = results.map((result: any) => ({
					display_name: result.display_name,
					coordinates: {
						lat: parseFloat(result.lat),
						lng: parseFloat(result.lon)
					},
					address: result.address
				}));
				showHomeAddressSuggestions = true;
				if (homeAddressSuggestions.length === 0) {
					homeAddressSearchError = 'No addresses found';
				}
			} else {
				homeAddressSuggestions = [];
				homeAddressSearchError = 'No addresses found';
				showHomeAddressSuggestions = true;
			}
		} catch (error) {
			console.error('Error searching for home address:', error);
			homeAddressSuggestions = [];
			homeAddressSearchError = 'Failed to search for home address';
			showHomeAddressSuggestions = true;
		} finally {
			isHomeAddressSearching = false;
		}
	}

	function selectHomeAddress(suggestion: any) {
		console.log('selectHomeAddress called with:', suggestion);
		homeAddressInput = suggestion.display_name;
		selectedHomeAddress = suggestion;
		showHomeAddressSuggestions = false;
		selectedHomeAddressIndex = -1;
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
				selectedExclusionAddressIndex = Math.min(selectedExclusionAddressIndex + 1, exclusionAddressSuggestions.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedExclusionAddressIndex = Math.max(selectedExclusionAddressIndex - 1, 0);
				break;
			case 'Enter':
				event.preventDefault();
				if (selectedExclusionAddressIndex >= 0 && selectedExclusionAddressIndex < exclusionAddressSuggestions.length) {
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
			const response = await fetch(`/api/v1/geocode/search?q=${encodeURIComponent(exclusionAddressInput.trim())}`);
			const data = await response.json();
			const results = data.data?.results;
			if (response.ok && data.success && Array.isArray(results)) {
				exclusionAddressSuggestions = results.map((result: any) => ({
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
		console.log('selectExclusionAddress called with:', suggestion);
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
			const response = await fetch('/api/v1/trip-exclusions', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					id: editingExclusion.id,
					name: editingExclusion.name,
					location: editingExclusion.location
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to update exclusion');
			}

			const result = await response.json();
			if (result.success) {
				// Update the exclusion in the local array
				const index = tripExclusions.findIndex(ex => ex.id === editingExclusion.id);
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
		editExclusionAddressSearchTimeout = setTimeout(() => searchEditExclusionAddressSuggestions(), 300);
	}

	function handleEditExclusionAddressKeydown(event: KeyboardEvent) {
		if (!showEditExclusionAddressSuggestions || editExclusionAddressSuggestions.length === 0) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedEditExclusionAddressIndex = Math.min(selectedEditExclusionAddressIndex + 1, editExclusionAddressSuggestions.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedEditExclusionAddressIndex = Math.max(selectedEditExclusionAddressIndex - 1, 0);
				break;
			case 'Enter':
				event.preventDefault();
				if (selectedEditExclusionAddressIndex >= 0 && selectedEditExclusionAddressIndex < editExclusionAddressSuggestions.length) {
					selectEditExclusionAddress(editExclusionAddressSuggestions[selectedEditExclusionAddressIndex]);
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
			const response = await fetch(`/api/v1/geocode/search?q=${encodeURIComponent(editExclusionAddressInput.trim())}`);
			const data = await response.json();
			const results = data.data?.results;
			if (response.ok && data.success && Array.isArray(results)) {
				editExclusionAddressSuggestions = results.map((result: any) => ({
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
		console.log('selectEditExclusionAddress called with:', suggestion);
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
				<!-- Email Address Field (restored) -->
				<div class="mb-4">
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

				<!-- Home Address Autocomplete Field -->
				<div class="mb-4">
					<label for="homeAddress" class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-[#23232a] dark:text-gray-100">Home Address</label>
					<div class="relative">
						<input
							id="homeAddress"
							type="text"
							bind:value={homeAddressInput}
							bind:this={homeAddressInputElement}
							on:input={handleHomeAddressInput}
							on:keydown={handleHomeAddressKeydown}
							placeholder="Start typing your home address..."
							class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
						/>
						{#if isHomeAddressSearching}
							<div class="absolute right-3 top-1/2 -translate-y-1/2">
								<div class="animate-spin h-4 w-4 border-2 border-[rgb(37,140,244)] border-t-transparent rounded-full"></div>
							</div>
						{/if}
					</div>
					{#if homeAddressSuggestions.length > 0 && showHomeAddressSuggestions}
						<div class="mt-1 border border-[rgb(218,218,221)] dark:border-[#3f3f46] rounded-md bg-white dark:bg-[#23232a] shadow-lg max-h-48 overflow-y-auto">
							{#each homeAddressSuggestions as suggestion, index}
								<button
									type="button"
									class="w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-[#2d2d35] focus:bg-gray-50 dark:focus:bg-[#2d2d35] focus:outline-none {selectedHomeAddressIndex === index ? 'bg-[rgb(37,140,244)]/10 dark:bg-[rgb(37,140,244)]/20' : ''}"
									on:click={() => selectHomeAddress(suggestion)}
								>
									<div class="font-medium">{suggestion.display_name}</div>
									{#if suggestion.coordinates}
										<div class="text-xs text-gray-500 dark:text-gray-400">
											📍 {suggestion.coordinates.lat.toFixed(6)}, {suggestion.coordinates.lng.toFixed(6)}
										</div>
									{/if}
								</button>
							{/each}
							{#if homeAddressSearchError}
								<div class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-center select-none cursor-default">
									{homeAddressSearchError}
								</div>
							{/if}
						</div>
					{:else if showHomeAddressSuggestions && homeAddressSearchError}
						<div class="mt-1 border border-[rgb(218,218,221)] dark:border-[#3f3f46] rounded-md bg-white dark:bg-[#23232a] shadow-lg max-h-48 overflow-y-auto">
							<div class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-center select-none cursor-default">
								{homeAddressSearchError}
							</div>
						</div>
					{/if}
					{#if selectedHomeAddress && selectedHomeAddress.coordinates}
						<div class="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
							<div class="text-sm text-green-800 dark:text-green-200">
								📍 Coordinates: {selectedHomeAddress.coordinates.lat.toFixed(6)}, {selectedHomeAddress.coordinates.lng.toFixed(6)}
							</div>
							<div class="text-xs text-green-600 dark:text-green-300 mt-1">
								{selectedHomeAddress.display_name}
							</div>
						</div>
					{/if}
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
						Used for trip generation.
					</p>
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

		<!-- Trip Exclusions -->
		<div class="mt-8 rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6">
			<div class="mb-6">
				<div class="flex items-center gap-2">
					<MapPin class="h-5 w-5 text-gray-400" />
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Trip Exclusions</h2>
				</div>
				<p class="mt-1 text-sm text-gray-600 dark:text-gray-100">
					Configure places to exclude from automatic trip generation. Maximum 10 exclusions allowed.
				</p>
			</div>

			<div class="space-y-4">
				{#if tripExclusions.length > 0}
					<div class="space-y-3">
						{#each tripExclusions as exclusion}
							<div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
								<div class="flex-1">
									<div class="font-medium text-gray-900 dark:text-gray-100">{exclusion.name}</div>
									<div class="text-sm text-gray-600 dark:text-gray-400">{exclusion.location.display_name}</div>
									{#if exclusion.location.coordinates}
										<div class="text-xs text-gray-500 dark:text-gray-500">
											📍 {exclusion.location.coordinates.lat.toFixed(6)}, {exclusion.location.coordinates.lng.toFixed(6)}
										</div>
									{/if}
								</div>
								<div class="flex items-center gap-2">
									<button
										on:click={() => handleEditExclusion(exclusion)}
										class="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
									>
										<Pencil class="w-4 h-4" />
									</button>
									<button
										on:click={() => handleDeleteExclusion(exclusion.id)}
										disabled={isDeletingExclusion}
										class="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
									>
										<Trash2 class="w-4 h-4" />
									</button>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="text-center py-8 text-gray-500 dark:text-gray-400">
						<MapPin class="w-12 h-12 mx-auto mb-4 opacity-50" />
						<p>No trip exclusions configured</p>
						<p class="text-sm">Add exclusions to prevent certain places from being considered as trips</p>
					</div>
				{/if}

				{#if tripExclusions.length < 10}
					<button
						on:click={() => showAddExclusionModal = true}
						class="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
					>
						<Plus class="w-4 h-4" />
						Add Trip Exclusion
					</button>
				{:else}
					<div class="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
						Maximum of 10 trip exclusions reached
					</div>
				{/if}
			</div>
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

<!-- Add Trip Exclusion Modal -->
{#if showAddExclusionModal}
	<!-- Modal Overlay -->
	<div class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 transition-all cursor-pointer"
		on:click={() => showAddExclusionModal = false}>
		<!-- Modal Box -->
		<div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-200 dark:border-gray-700 relative animate-fade-in cursor-default"
			on:click|stopPropagation>
			<h3 class="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100 text-center">Add Trip Exclusion</h3>
			<div class="space-y-6">
				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
					<input
						type="text"
						bind:value={newExclusion.name}
						placeholder="e.g., Work Office"
						class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Address</label>
					<div class="relative">
						<input
							type="text"
							bind:value={exclusionAddressInput}
							bind:this={exclusionAddressInputElement}
							on:input={handleExclusionAddressInput}
							on:keydown={handleExclusionAddressKeydown}
							placeholder="Start typing an address..."
							class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
						/>
						{#if isExclusionAddressSearching}
							<div class="absolute right-3 top-1/2 -translate-y-1/2">
								<div class="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
							</div>
						{/if}
					</div>
					{#if exclusionAddressSuggestions.length > 0 && showExclusionAddressSuggestions}
						<div class="mt-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 shadow-lg max-h-48 overflow-y-auto">
							{#each exclusionAddressSuggestions as suggestion, index}
								<button
									type="button"
									class="w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 focus:outline-none {selectedExclusionAddressIndex === index ? 'bg-blue-500/10 dark:bg-blue-500/20' : ''}"
									on:click={() => selectExclusionAddress(suggestion)}
								>
									<div class="font-medium">{suggestion.display_name}</div>
									{#if suggestion.coordinates}
										<div class="text-xs text-gray-500 dark:text-gray-400">
											📍 {suggestion.coordinates.lat.toFixed(6)}, {suggestion.coordinates.lng.toFixed(6)}
										</div>
									{/if}
								</button>
							{/each}
							{#if exclusionAddressSearchError}
								<div class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-center select-none cursor-default">
									{exclusionAddressSearchError}
								</div>
							{/if}
						</div>
					{:else if showExclusionAddressSuggestions && exclusionAddressSearchError}
						<div class="mt-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 shadow-lg max-h-48 overflow-y-auto">
							<div class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-center select-none cursor-default">
								{exclusionAddressSearchError}
							</div>
						</div>
					{/if}
					{#if selectedExclusionAddress && selectedExclusionAddress.coordinates}
						<div class="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
							<div class="text-sm text-green-800 dark:text-green-200">
								📍 Coordinates: {selectedExclusionAddress.coordinates.lat.toFixed(6)}, {selectedExclusionAddress.coordinates.lng.toFixed(6)}
							</div>
							<div class="text-xs text-green-600 dark:text-green-300 mt-1">
								{selectedExclusionAddress.display_name}
							</div>
						</div>
					{/if}
				</div>
				<div class="flex gap-3 mt-4">
					<button
						on:click={handleAddExclusion}
						disabled={isAddingExclusion || !newExclusion.name || !newExclusion.location}
						class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow transition-all duration-200 py-3 px-6 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isAddingExclusion ? 'Adding...' : 'Add Exclusion'}
					</button>
					<button
						on:click={() => showAddExclusionModal = false}
						class="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 font-semibold rounded-lg shadow transition-all duration-200 py-3 px-6 cursor-pointer"
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
	<div class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 transition-all cursor-pointer"
		on:click={() => showEditExclusionModal = false}>
		<!-- Modal Box -->
		<div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-200 dark:border-gray-700 relative animate-fade-in cursor-default"
			on:click|stopPropagation>
			<h3 class="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100 text-center">Edit Trip Exclusion</h3>
			<div class="space-y-6">
				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
					<input
						type="text"
						bind:value={editingExclusion.name}
						placeholder="e.g., Work Office"
						class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Address</label>
					<div class="relative">
						<input
							type="text"
							bind:value={editExclusionAddressInput}
							bind:this={editExclusionAddressInputElement}
							on:input={handleEditExclusionAddressInput}
							on:keydown={handleEditExclusionAddressKeydown}
							placeholder="Start typing an address..."
							class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
						/>
						{#if isEditExclusionAddressSearching}
							<div class="absolute right-3 top-1/2 -translate-y-1/2">
								<div class="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
							</div>
						{/if}
					</div>
					{#if editExclusionAddressSuggestions.length > 0 && showEditExclusionAddressSuggestions}
						<div class="mt-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 shadow-lg max-h-48 overflow-y-auto">
							{#each editExclusionAddressSuggestions as suggestion, index}
								<button
									type="button"
									class="w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 focus:outline-none {selectedEditExclusionAddressIndex === index ? 'bg-blue-500/10 dark:bg-blue-500/20' : ''}"
									on:click={() => selectEditExclusionAddress(suggestion)}
								>
									<div class="font-medium">{suggestion.display_name}</div>
									{#if suggestion.coordinates}
										<div class="text-xs text-gray-500 dark:text-gray-400">
											📍 {suggestion.coordinates.lat.toFixed(6)}, {suggestion.coordinates.lng.toFixed(6)}
										</div>
									{/if}
								</button>
							{/each}
							{#if editExclusionAddressSearchError}
								<div class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-center select-none cursor-default">
									{editExclusionAddressSearchError}
								</div>
							{/if}
						</div>
					{:else if showEditExclusionAddressSuggestions && editExclusionAddressSearchError}
						<div class="mt-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 shadow-lg max-h-48 overflow-y-auto">
							<div class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-center select-none cursor-default">
								{editExclusionAddressSearchError}
							</div>
						</div>
					{/if}
					{#if selectedEditExclusionAddress && selectedEditExclusionAddress.coordinates}
						<div class="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
							<div class="text-sm text-green-800 dark:text-green-200">
								📍 Coordinates: {selectedEditExclusionAddress.coordinates.lat.toFixed(6)}, {selectedEditExclusionAddress.coordinates.lng.toFixed(6)}
							</div>
							<div class="text-xs text-green-600 dark:text-green-300 mt-1">
								{selectedEditExclusionAddress.display_name}
							</div>
						</div>
					{/if}
				</div>
				<div class="flex gap-3 mt-4">
					<button
						on:click={handleUpdateExclusion}
						disabled={isEditingExclusion || !editingExclusion.name || !editingExclusion.location}
						class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow transition-all duration-200 py-3 px-6 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isEditingExclusion ? 'Updating...' : 'Update Exclusion'}
					</button>
					<button
						on:click={() => showEditExclusionModal = false}
						class="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 font-semibold rounded-lg shadow transition-all duration-200 py-3 px-6 cursor-pointer"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}