<script lang="ts">
	import {
		User,
		Globe,
		Shield,
		Trash2,
		Info,
		Lock,
		MapPin,
		Plus,
		Pencil,
		Image,
		Loader2,
		Check,
		X
	} from 'lucide-svelte';
	import { onMount } from 'svelte';
	import Input from '$lib/components/ui/input/index.svelte';
	import { toast } from 'svelte-sonner';

	import OnboardingWelcome from '$lib/components/OnboardingWelcome.svelte';
	import TwoFactorSetup from '$lib/components/TwoFactorSetup.svelte';
	import TwoFactorDisable from '$lib/components/TwoFactorDisable.svelte';
	import LanguageSelector from '$lib/components/ui/language-selector/index.svelte';
	import { translate, changeLocale, currentLocale, type SupportedLocale } from '$lib/i18n';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { sessionManager } from '$lib/services/session';
	import { sessionStore } from '$lib/stores/auth';
	import { fluxbase } from '$lib/fluxbase';
	import { readSetting } from '$lib/utils/settings';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	import type { UserProfile, UserPreferences } from '$lib/types/user.types';

	// Use the reactive translation function
	let t = $derived($translate);

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let isUpdatingPassword = $state(false);
	let isUpdatingProfile = $state(false);
	let isUpdatingPreferences = $state(false);
	let profile = $state<UserProfile | null>(null);
	let preferences = $state<UserPreferences | null>(null);
	let firstNameInput = $state('');
	let lastNameInput = $state('');
	let usernameInput = $state('');
	let usernameStatus = $state<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
	let originalUsername = $state('');

	const USERNAME_RE = /^[a-z0-9-]{3,30}$/;
	const usernamePreview = $derived(
		usernameInput && USERNAME_RE.test(usernameInput)
			? `${window.location.origin}/u/${usernameInput}`
			: ''
	);

	let usernameCheckTimer: ReturnType<typeof setTimeout> | null = null;

	async function checkUsernameAvailability() {
		const value = usernameInput.trim();
		if (!value) {
			usernameStatus = 'idle';
			return;
		}
		if (!USERNAME_RE.test(value)) {
			usernameStatus = 'invalid';
			return;
		}
		// If unchanged from the user's current username, no need to check
		if (value === originalUsername) {
			usernameStatus = 'available';
			return;
		}
		usernameStatus = 'checking';
		try {
			const { data } = await fluxbase
				.from('public_profiles')
				.select('id')
				.eq('username', value)
				.limit(1);
			usernameStatus = (data as any[])?.length > 0 ? 'taken' : 'available';
		} catch {
			usernameStatus = 'idle';
		}
	}

	function onUsernameInput() {
		usernameStatus = 'idle';
		if (usernameCheckTimer) clearTimeout(usernameCheckTimer);
		usernameCheckTimer = setTimeout(checkUsernameAvailability, 500);
	}

	let pexelsApiKeyInput = $state('');
	let preferredUnit = $state('metric');
	let preferredTimezone = $state('');
	let pexelsApiKeyConfigured = $state(false);
	let pexelsApiKeyUpdatedAt = $state<string | null>(null);
	let serverPexelsApiKeyAvailable = $state(false);
	let pexelsRateLimitEnabled = $state(false);
	let pexelsRateLimit = $state(200);
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

	// Onboarding state
	let showOnboardingModal = $state(false);
	let isOnboarding = $derived($page.url.searchParams.get('onboarding') === 'true');

	// Admin state for onboarding
	let isAdmin = $state(false);

	// Two-Factor Authentication state
	let twoFactorEnabled = $state(false);
	let showTwoFactorSetup = $state(false);
	let showTwoFactorDisable = $state(false);
	let isCheckingTwoFactor = $state(false);

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

	// AI Settings - user override controlled by Fluxbase SDK
	// Note: User-level AI provider configuration is managed via Fluxbase SDK
	let aiAllowUserOverride = $state(false);

	// Handle Escape key for modals
	$effect(() => {
		if (showAddExclusionModal || showEditExclusionModal) {
			const handleKeydown = (e: KeyboardEvent) => {
				if (e.key === 'Escape') {
					if (showAddExclusionModal) {
						showAddExclusionModal = false;
					} else if (showEditExclusionModal) {
						showEditExclusionModal = false;
					}
				}
			};

			window.addEventListener('keydown', handleKeydown);

			return () => {
				window.removeEventListener('keydown', handleKeydown);
			};
		}
	});

	// Language selector handler
	function handleLanguageChange(data: { locale: SupportedLocale }) {
		const { locale } = data;
		changeLocale(locale);

		// Update preferences object so it saves correctly
		if (preferences) {
			preferences.language = locale;
		}
	}

	async function loadUserData() {
		try {
			const session = await fluxbase.auth.getSession();
			if (!session.data || !session.data?.session) {
				throw new Error('No session found');
			}

			const serviceAdapter = new ServiceAdapter({ session: session.data?.session });

			// Load profile and preferences (server settings loaded via admin endpoint if needed)
			const [profileResult, preferencesResult] = await Promise.all([
				serviceAdapter.getProfile(),
				serviceAdapter.getPreferences()
			]);

			// Handle profile data - Edge Functions return { success: true, data: ... }
			if (profileResult && typeof profileResult === 'object' && profileResult !== null) {
				const profileData = (profileResult as any).data || profileResult;
				profile = profileData as UserProfile;
				firstNameInput = profile.first_name || '';
				usernameInput = (profile as any).username || '';
				originalUsername = (profile as any).username || '';
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
				preferredTimezone = preferences.timezone || '';
				preferredUnit = (preferences as any).preferences?.units || 'metric';
			}

			// Load user Pexels API key secret metadata
			try {
				const secretMeta = await fluxbase.settings.getSecret('pexels_api_key');
				if (secretMeta) {
					pexelsApiKeyConfigured = true;
					pexelsApiKeyUpdatedAt = secretMeta.updated_at;
				} else {
					pexelsApiKeyConfigured = false;
					pexelsApiKeyUpdatedAt = null;
				}
			} catch {
				// Secret doesn't exist yet
				pexelsApiKeyConfigured = false;
				pexelsApiKeyUpdatedAt = null;
			}

			// Check if server Pexels API key is available
			// This is only relevant for admins, regular users don't need this info
			// For now, we'll assume it's not available unless explicitly configured
			serverPexelsApiKeyAvailable = false;

			// Load user's personal Pexels rate limit using settings SDK.
			// "Setting not found" is the normal case for users who haven't configured one;
			// readSetting returns null for it (so no noisy console.error on every fresh account).
			try {
				const userRateLimit = await readSetting(() =>
					fluxbase.settings.getUserSetting('wayli.pexels_rate_limit')
				);

				if (userRateLimit === undefined || userRateLimit === null) {
					// Use server default
					pexelsRateLimitEnabled = false;
					pexelsRateLimit = 200;
				} else {
					let loadedRateLimit: number | null = null;

					if (typeof userRateLimit === 'number') {
						loadedRateLimit = userRateLimit;
					} else if (
						typeof userRateLimit === 'object' &&
						userRateLimit !== null &&
						'value' in userRateLimit
					) {
						const val = userRateLimit.value;
						loadedRateLimit = typeof val === 'number' ? val : null;
					}

					if (loadedRateLimit === null || loadedRateLimit === 0) {
						// Unlimited or invalid
						pexelsRateLimitEnabled = false;
						pexelsRateLimit = 200; // Default when re-enabled
					} else {
						pexelsRateLimitEnabled = true;
						pexelsRateLimit = loadedRateLimit;
					}
				}
			} catch (err) {
				console.error('Failed to load user rate limit:', err);
				pexelsRateLimitEnabled = false;
				pexelsRateLimit = 200;
			}
		} catch (error) {
			console.error('❌ [AccountSettings] Error loading user data:', error);
		}
	}

	async function loadAISettings() {
		try {
			const session = await fluxbase.auth.getSession();
			if (!session.data || !session.data?.session) return;

			const serviceAdapter = new ServiceAdapter({ session: session.data?.session });

			// Load app-level AI settings to check if user override is allowed
			const result = await serviceAdapter.getAllSettings();
			if (result?.app?.ai) {
				aiAllowUserOverride = result.app.ai.allow_user_provider_override ?? false;
			}

			// Note: User-level AI provider configuration is now managed via Fluxbase SDK
			// The SDK handles user provider settings when aiAllowUserOverride is true
		} catch (error) {
			console.error('❌ [AccountSettings] Error loading AI settings:', error);
		}
	}

	// Check if current user is an admin
	async function checkAdminRole() {
		try {
			const { data: userData } = await fluxbase.auth.getUser();
			if (!userData || !userData.user) return;

			const { data: userProfile, error } = await fluxbase
				.from<Record<string, any>>('user_profiles')
				.select('role')
				.eq('id', userData.user.id)
				.single();

			if (!error && userProfile) {
				isAdmin = userProfile.role === 'admin';
			}
		} catch (error) {
			console.error('Error checking admin role:', error);
		}
	}

	onMount(async () => {
		await loadUserData();
		await loadTripExclusions();
		await check2FAStatus();
		await loadAISettings();
		await checkAdminRole();

		// Show onboarding modal if this is first login
		if (isOnboarding) {
			showOnboardingModal = true;
		}
	});

	async function check2FAStatus() {
		isCheckingTwoFactor = true;
		try {
			// Check if user is authenticated via Fluxbase
			const { data: userData } = await fluxbase.auth.getUser();
			if (!userData || !userData.user) {
				console.warn('⚠️ [AccountSettings] No authenticated user for 2FA status check');
				return;
			}

			// Call get2FAStatus directly on fluxbase SDK (doesn't require session wrapper)
			const { data, error } = await fluxbase.auth.get2FAStatus();

			if (error) {
				throw new Error(error.message || 'Failed to get 2FA status');
			}

			if (!data) {
				console.warn('⚠️ [AccountSettings] No 2FA status data returned');
				twoFactorEnabled = false;
				return;
			}

			// SDK 2FA status is { all: Factor[]; totp: Factor[] }.
			twoFactorEnabled = Array.isArray(data.totp) && data.totp.length > 0;
		} catch (error) {
			console.error('❌ [AccountSettings] Error checking 2FA status:', error);
			twoFactorEnabled = false;
		} finally {
			isCheckingTwoFactor = false;
		}
	}

	async function handle2FASetupSuccess() {
		showTwoFactorSetup = false;
		toast.success('Two-factor authentication enabled successfully!');
		// Re-check 2FA status from server to ensure it's properly enabled
		await check2FAStatus();
	}

	async function handle2FADisableSuccess() {
		showTwoFactorDisable = false;
		toast.success('Two-factor authentication disabled successfully!');
		// Re-check 2FA status from server to ensure it's properly disabled
		await check2FAStatus();
	}

	// Require re-authentication before enabling 2FA (sensitive action)
	async function handleEnable2FA() {
		const confirmed = await sessionManager.requireReauth();
		if (confirmed) {
			showTwoFactorSetup = true;
		}
	}

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

	async function handleOnboardingComplete(homeAddress: any) {
		try {
			// Save home address if provided
			if (homeAddress && profile) {
				profile.home_address = homeAddress;
				selectedHomeAddress = homeAddress;
				homeAddressInput = homeAddress.display_name || '';

				const session = await fluxbase.auth.getSession();
				if (!session.data?.session) {
					throw new Error('No active session');
				}
				const serviceAdapter = new ServiceAdapter({ session: session.data.session });

				await serviceAdapter.updateProfile({
					first_name: profile.first_name || '',
					last_name: profile.last_name || '',
					email: profile.email || '',
					home_address: homeAddress
				});
			}

			// Mark onboarding as completed
			if (profile) {
				const { error } = await fluxbase
					.from<Record<string, any>>('user_profiles')
					.eq('id', profile.id)
					.update({ onboarding_completed: true });

				if (error) {
					console.error('Error marking onboarding as completed:', error);
					throw new Error(error.message || 'Failed to update onboarding status');
				}
			}

			toast.success('Welcome! Your profile is all set.');
			showOnboardingModal = false;

			// Dispatch event to notify components that onboarding is complete
			window.dispatchEvent(new CustomEvent('onboarding-completed'));

			goto('/dashboard/account-settings', { replaceState: true });
		} catch (error) {
			console.error('Error completing onboarding:', error);
			toast.error('Failed to save settings');
		}
	}

	async function handleOnboardingSkip() {
		try {
			// Mark onboarding as completed and home address as skipped
			if (profile) {
				const { error } = await fluxbase
					.from<Record<string, any>>('user_profiles')
					.eq('id', profile.id)
					.update({
						onboarding_completed: true,
						home_address_skipped: true
					});

				if (error) {
					console.error('Error marking onboarding as skipped:', error);
					throw new Error(error.message || 'Failed to update onboarding status');
				}
			}

			toast.info('You can add your home address anytime from Account Settings');
			showOnboardingModal = false;

			// Dispatch event to notify components that onboarding is complete
			window.dispatchEvent(new CustomEvent('onboarding-completed'));

			goto('/dashboard/account-settings', { replaceState: true });
		} catch (error) {
			console.error('Error skipping onboarding:', error);
			toast.error('Failed to skip onboarding');
		}
	}

	async function handleSkipHomeAddressField() {
		try {
			if (profile) {
				const { error } = await fluxbase
					.from<Record<string, any>>('user_profiles')
					.eq('id', profile.id)
					.update({ home_address_skipped: true });

				if (error) {
					console.error('Error skipping home address:', error);
					throw new Error(error.message || 'Failed to update home address skip status');
				}

				toast.info('You can add your home address later if you change your mind');

				// Reload to update UI
				await loadUserData();
			}
		} catch (error) {
			console.error('Error skipping home address:', error);
			toast.error('Failed to skip home address field');
		}
	}

	async function handleSaveProfile() {
		if (!profile) return;

		// Block save if username is invalid or taken
		const trimmedUsername = usernameInput.trim();
		if (trimmedUsername && trimmedUsername !== originalUsername) {
			if (!USERNAME_RE.test(trimmedUsername)) {
				toast.error('Username format is invalid');
				return;
			}
			if (usernameStatus === 'taken') {
				toast.error('This username is already taken');
				return;
			}
			if (usernameStatus !== 'available') {
				toast.error('Please wait for the username check to complete');
				return;
			}
		}

		isUpdatingProfile = true;
		error = null;

		try {
			const session = await fluxbase.auth.getSession();
			if (!session.data || !session.data?.session) {
				throw new Error('No session found');
			}

			const serviceAdapter = new ServiceAdapter({ session: session.data?.session });

			// Update profile data
			profile.first_name = firstNameInput.trim();
			profile.last_name = lastNameInput.trim();
			(profile as any).username = usernameInput.trim() || null;
			profile.home_address = selectedHomeAddress || homeAddressInput.trim() || null;

			// Update profile using service adapter
			await serviceAdapter.updateProfile({
				first_name: profile.first_name,
				last_name: profile.last_name,
				username: (profile as any).username,
				email: profile.email || '',
				home_address: profile.home_address
			});

			toast.success('Profile updated successfully!');
		} catch (error) {
			console.error('❌ [AccountSettings] Error updating profile:', error);
			const msg = error instanceof Error ? error.message : '';
			if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('already exists')) {
				toast.error('This username is already taken. Please choose another.');
			} else {
				toast.error('Failed to update profile. Please try again.');
			}
		} finally {
			isUpdatingProfile = false;
		}
	}

	async function handleSavePreferences() {
		if (!preferences) return;

		isUpdatingPreferences = true;
		error = null;

		try {
			const session = await fluxbase.auth.getSession();
			if (!session.data || !session.data?.session) {
				throw new Error('No session found');
			}

			const serviceAdapter = new ServiceAdapter({ session: session.data?.session });

			// Update preferences using service adapter
			await serviceAdapter.updatePreferences({
				language: preferences.language,
				timezone: preferredTimezone || null,
				preferences: {
					...(preferences.preferences || {}),
					units: preferredUnit
				}
			});

			// Save Pexels API key as encrypted user secret
			if (pexelsApiKeyInput.trim()) {
				await fluxbase.settings.setSecret('pexels_api_key', pexelsApiKeyInput.trim(), {
					description: 'Personal Pexels API key for trip image suggestions'
				});
				pexelsApiKeyConfigured = true;
				pexelsApiKeyUpdatedAt = new Date().toISOString();
				pexelsApiKeyInput = ''; // Clear input after save
			}

			// Save personal Pexels rate limit using settings SDK
			if (pexelsApiKeyConfigured) {
				if (pexelsRateLimitEnabled) {
					await fluxbase.settings.setSetting('wayli.pexels_rate_limit', { limit: pexelsRateLimit });
				} else {
					// Clear user setting to use server default (ignore 404 if it doesn't exist)
					try {
						await fluxbase.settings.deleteSetting('wayli.pexels_rate_limit');
					} catch {
						// Setting doesn't exist, which is fine
					}
				}
			} else {
				// No API key = no personal rate limit (ignore 404 if it doesn't exist)
				try {
					await fluxbase.settings.deleteSetting('wayli.pexels_rate_limit');
				} catch {
					// Setting doesn't exist, which is fine
				}
			}

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

	async function clearPexelsApiKey() {
		try {
			await fluxbase.settings.deleteSecret('pexels_api_key');
			pexelsApiKeyConfigured = false;
			pexelsApiKeyUpdatedAt = null;

			// Auto-clear personal rate limit when API key is cleared (ignore 404 if it doesn't exist)
			try {
				await fluxbase.settings.deleteSetting('wayli.pexels_rate_limit');
			} catch {
				// Setting doesn't exist, which is fine
			}
			pexelsRateLimitEnabled = false;
			pexelsRateLimit = 200; // Reset to default value

			toast.success(t('accountSettings.pexelsKeyCleared'));
		} catch (error) {
			console.error('❌ [AccountSettings] Error clearing Pexels API key:', error);
			toast.error('Failed to clear API key. Please try again.');
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
			const { data } = await fluxbase.auth.getSession();
			if (!data?.session) throw new Error('No session found');
			const serviceAdapter = new ServiceAdapter({ session: data.session });
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

<svelte:head>
	<title>{t('accountSettings.title')} - Wayli</title>
</svelte:head>

<div>
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<User class="text-primary dark:text-primary h-8 w-8" />
			<h1 class="text-3xl font-bold tracking-tight text-foreground">Account Settings</h1>
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
		<div class="mb-8 rounded-xl border border-border bg-white p-6 dark:border-border dark:bg-card">
			<div class="mb-6">
				<div
					class="flex items-center gap-2"
					role="group"
					aria-labelledby="preferred-language-label"
				>
					<User class="h-5 w-5 text-muted-foreground" />
					<h2 class="text-xl font-semibold text-foreground">
						{t('accountSettings.profile')}
					</h2>
				</div>
				<p class="mt-1 text-sm text-gray-600 dark:text-foreground">
					{t('accountSettings.profileDescription')}
				</p>
			</div>

			<div class="space-y-6">
				<!-- Email Address Field (restored) -->
				<div class="mb-4">
					<label
						for="email"
						class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-card dark:text-foreground"
						>{t('accountSettings.email')}</label
					>
					<Input id="email" type="email" value={profile?.email} disabled class="w-full" />
					<p class="mt-1 text-xs text-muted-foreground">
						{t('accountSettings.emailCannotChange')}
					</p>
				</div>

				<!-- Home Address Autocomplete Field -->
				<div class="mb-4">
					<label
						for="homeAddress"
						class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-card dark:text-foreground"
					>
						{t('accountSettings.homeLocationOptional')}
						{#if !homeAddressInput && !profile?.home_address_skipped}
							<span
								class="bg-primary/10 text-primary dark:bg-primary/30 ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium dark:text-muted-foreground"
							>
								{t('accountSettings.recommended')}
							</span>
						{/if}
					</label>

					<!-- Context help -->
					<p class="mb-2 text-sm text-muted-foreground">
						{t('accountSettings.homeLocationContext')}
					</p>

					<div class="relative">
						<input
							id="homeAddress"
							type="text"
							bind:value={homeAddressInput}
							bind:this={homeAddressInputElement}
							oninput={handleHomeAddressInput}
							onkeydown={handleHomeAddressKeydown}
							placeholder={t('accountSettings.startTypingHomeAddress')}
							class="w-full"
						/>
						{#if isHomeAddressSearching}
							<div class="absolute top-1/2 right-3 -translate-y-1/2">
								<div
									class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
								></div>
							</div>
						{/if}
					</div>
					{#if homeAddressSuggestions.length > 0 && showHomeAddressSuggestions}
						<div
							class="mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-white shadow-lg dark:border-border dark:bg-card"
						>
							{#each homeAddressSuggestions as suggestion, index (suggestion.display_name + index)}
								<button
									type="button"
									class="w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-muted focus:bg-muted focus:outline-none dark:text-foreground dark:hover:bg-muted dark:focus:bg-muted {selectedHomeAddressIndex ===
									index
										? 'bg-primary/10 dark:bg-primary/20'
										: ''}"
									onclick={() => selectHomeAddress(suggestion)}
								>
									<div class="font-medium">{suggestion.display_name}</div>
									{#if suggestion.coordinates}
										<div class="text-xs text-muted-foreground">
											📍 {suggestion.coordinates.lat.toFixed(6)}, {suggestion.coordinates.lng.toFixed(
												6
											)}
										</div>
									{/if}
								</button>
							{/each}
							{#if homeAddressSearchError}
								<div
									class="cursor-default px-3 py-2 text-center text-sm text-muted-foreground select-none"
								>
									{homeAddressSearchError}
								</div>
							{/if}
						</div>
					{:else if showHomeAddressSuggestions && homeAddressSearchError}
						<div
							class="mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-white shadow-lg dark:border-border dark:bg-card"
						>
							<div
								class="cursor-default px-3 py-2 text-center text-sm text-muted-foreground select-none"
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

					<!-- Skip button if field is empty -->
					{#if !homeAddressInput && !profile?.home_address_skipped}
						<button
							type="button"
							onclick={handleSkipHomeAddressField}
							class="mt-2 text-sm text-muted-foreground hover:text-muted-foreground"
						>
							{t('accountSettings.skipThisField')}
						</button>
					{/if}

					<p class="mt-1 text-xs text-muted-foreground">
						💡 {t('accountSettings.tripDetectionHelp')}
					</p>
				</div>

				<div class="grid gap-6 md:grid-cols-2">
					<div>
						<label
							for="firstName"
							class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-card dark:text-foreground"
							>{t('accountSettings.firstName')}</label
						>
						<Input
							id="firstName"
							type="text"
							bind:value={firstNameInput}
							placeholder={t('accountSettings.enterFirstName')}
							class="w-full"
						/>
					</div>

					<div>
						<label
							for="lastName"
							class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-card dark:text-foreground"
							>{t('accountSettings.lastName')}</label
						>
						<Input
							id="lastName"
							type="text"
							bind:value={lastNameInput}
							placeholder={t('accountSettings.enterLastName')}
							class="w-full"
						/>
					</div>
				</div>
			</div>

			<button
				class="bg-primary hover:bg-primary/90 mt-6 cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
				onclick={handleSaveProfile}
				disabled={isUpdatingProfile}
			>
				{isUpdatingProfile ? t('accountSettings.savingChanges') : t('common.actions.saveChanges')}
			</button>
		</div>

		<!-- Security Settings -->
		<div class="mb-8 rounded-xl border border-border bg-white p-6 dark:border-border dark:bg-card">
			<div class="mb-6">
				<div class="flex items-center gap-2">
					<Lock class="h-5 w-5 text-muted-foreground" />
					<h2 class="text-xl font-semibold text-foreground">
						{t('accountSettings.security')}
					</h2>
				</div>
				<p class="mt-1 text-sm text-gray-600 dark:text-foreground">
					{t('accountSettings.securityDescription')}
				</p>
			</div>

			<div class="space-y-4">
				<div>
					<label
						for="currentPassword"
						class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-card dark:text-foreground"
						>{t('accountSettings.currentPassword')}</label
					>
					<Input id="currentPassword" type="password" bind:value={currentPassword} class="w-full" />
				</div>

				<div class="grid gap-4 md:grid-cols-2">
					<div>
						<label
							for="newPassword"
							class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-card dark:text-foreground"
							>{t('accountSettings.newPassword')}</label
						>
						<Input id="newPassword" type="password" bind:value={newPassword} class="w-full" />
					</div>

					<div>
						<label
							for="confirmPassword"
							class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-card dark:text-foreground"
							>{t('common.fields.confirmPassword')}</label
						>
						<Input
							id="confirmPassword"
							type="password"
							bind:value={confirmPassword}
							class="w-full"
						/>
					</div>
				</div>

				<!-- Public Profile -->
				<div
					class="mb-8 rounded-xl border border-border bg-white p-6 dark:border-border dark:bg-card"
				>
					<div class="mb-6">
						<div class="flex items-center gap-2">
							<Globe class="h-5 w-5 text-muted-foreground" />
							<h2 class="text-xl font-semibold text-foreground">Public Profile</h2>
						</div>
						<p class="mt-1 text-sm text-muted-foreground">
							Set a public username to share your travel journal with the world.
						</p>
					</div>

					<div>
						<label for="username" class="mb-1.5 block text-sm font-medium text-foreground">
							Username
						</label>
						<input
							id="username"
							type="text"
							bind:value={usernameInput}
							oninput={onUsernameInput}
							placeholder="e.g. bart"
							class="focus:ring-primary w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
						/>
						<p class="mt-1 text-xs text-muted-foreground">
							Lowercase letters, numbers, and hyphens. 3–30 characters.
						</p>
						{#if usernameStatus === 'checking'}
							<p class="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
								<Loader2 class="h-3 w-3 animate-spin" /> Checking availability...
							</p>
						{:else if usernameStatus === 'available'}
							<p class="mt-2 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
								<Check class="h-3 w-3" /> Available
							</p>
						{:else if usernameStatus === 'taken'}
							<p class="mt-2 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
								<X class="h-3 w-3" /> This username is already taken
							</p>
						{:else if usernameStatus === 'invalid'}
							<p class="mt-2 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
								<X class="h-3 w-3" /> Invalid format (lowercase, numbers, hyphens, 3–30 chars)
							</p>
						{/if}
						{#if usernamePreview}
							<p class="mt-2 text-xs text-primary break-all">
								🌐 {usernamePreview}
							</p>
						{/if}
					</div>
				</div>

				<button
					class="bg-primary hover:bg-primary/90 cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
					onclick={handleUpdatePassword}
					disabled={isUpdatingPassword}
				>
					{isUpdatingPassword
						? t('accountSettings.updatingPassword')
						: t('accountSettings.updatePassword')}
				</button>
			</div>
		</div>

		<!-- Two-Factor Authentication -->
		<div class="mb-8 rounded-xl border border-border bg-white p-6 dark:border-border dark:bg-card">
			<div class="mb-6">
				<div class="flex items-center gap-2">
					<Shield class="h-5 w-5 text-muted-foreground" />
					<h2 class="text-xl font-semibold text-foreground">
						{t('accountSettings.twoFactorAuthentication')}
					</h2>
				</div>
				<p class="mt-1 text-sm text-gray-600 dark:text-foreground">
					{t('accountSettings.twoFactorAuthDescription')}
				</p>
			</div>

			{#if isCheckingTwoFactor}
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
					></div>
					<span>{t('auth.checking2FAStatus')}</span>
				</div>
			{:else}
				<div class="space-y-4">
					<!-- Current Status -->
					<div
						class="flex items-center justify-between rounded-lg border p-4 {twoFactorEnabled
							? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
							: ' bg-gray-50 dark:bg-card'} border-border"
					>
						<div class="flex items-center gap-3">
							<div
								class="flex h-10 w-10 items-center justify-center rounded-full {twoFactorEnabled
									? 'bg-green-100 dark:bg-green-900/30'
									: 'bg-gray-200 dark:bg-muted'}"
							>
								<Shield
									class="h-5 w-5 {twoFactorEnabled
										? 'text-green-600 dark:text-green-400'
										: 'text-muted-foreground'}"
								/>
							</div>
							<div>
								<p class="font-medium text-foreground">
									{twoFactorEnabled ? t('accountSettings.enabled') : t('accountSettings.disabled')}
								</p>
								<p class="text-sm text-muted-foreground">
									{twoFactorEnabled
										? t('accountSettings.twoFactorEnabled')
										: t('accountSettings.2faStatusDisabled')}
								</p>
							</div>
						</div>
						{#if twoFactorEnabled}
							<button
								onclick={() => (showTwoFactorDisable = true)}
								class="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 bg-card"
							>
								{t('accountSettings.disable')}
							</button>
						{:else}
							<button
								onclick={handleEnable2FA}
								class="bg-primary hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
							>
								{t('accountSettings.enable2FA')}
							</button>
						{/if}
					</div>

					<!-- Info Message -->
					<div
						class="bg-primary/5 dark:bg-primary/20 flex items-start gap-3 rounded-lg border border-primary/20 p-3 dark:border-primary/30"
					>
						<Info class="text-primary mt-0.5 h-4 w-4 flex-shrink-0 dark:text-muted-foreground" />
						<p class="text-primary text-xs dark:text-muted-foreground">
							{t('accountSettings.2faInfoMessage')}
						</p>
					</div>
				</div>
			{/if}
		</div>

		<!-- Preferences -->
		<div class="rounded-xl border border-border bg-white p-6 dark:border-border dark:bg-card">
			<div class="mb-6">
				<div class="flex items-center gap-2">
					<Globe class="h-5 w-5 text-muted-foreground" />
					<h2 class="text-xl font-semibold text-foreground">
						{t('accountSettings.preferences')}
					</h2>
				</div>
				<p class="mt-1 text-sm text-gray-600 dark:text-foreground">
					{t('accountSettings.preferencesSubtitle')}
				</p>
			</div>

			<div class="grid gap-6 md:grid-cols-2">
				<div>
					<span
						class="mb-1.5 block text-sm font-medium text-gray-900 dark:bg-card dark:text-foreground"
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

				<!-- Units -->
				<div>
					<span class="mb-1.5 block text-sm font-medium text-foreground">Distance units</span>
					<select
						bind:value={preferredUnit}
						class="border-border focus:ring-primary rounded-md border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
					>
						<option value="metric">Metric (km, m)</option>
						<option value="imperial">Imperial (mi, ft)</option>
					</select>
				</div>

				<!-- Timezone -->
				<div>
					<span class="mb-1.5 block text-sm font-medium text-foreground">Timezone</span>
					<select
						bind:value={preferredTimezone}
						class="border-border focus:ring-primary rounded-md border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
					>
						<option value="">Browser default</option>
						<option value="UTC">UTC</option>
						<option value="Europe/Amsterdam">Europe/Amsterdam</option>
						<option value="Europe/London">Europe/London</option>
						<option value="Europe/Berlin">Europe/Berlin</option>
						<option value="Europe/Paris">Europe/Paris</option>
						<option value="America/New_York">America/New_York</option>
						<option value="America/Chicago">America/Chicago</option>
						<option value="America/Denver">America/Denver</option>
						<option value="America/Los_Angeles">America/Los_Angeles</option>
						<option value="Asia/Tokyo">Asia/Tokyo</option>
						<option value="Asia/Singapore">Asia/Singapore</option>
						<option value="Australia/Sydney">Australia/Sydney</option>
					</select>
				</div>
			</div>

			<button
				class="bg-primary hover:bg-primary/90 mt-6 cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
				onclick={handleSavePreferences}
				disabled={isUpdatingPreferences}
			>
				{isUpdatingPreferences
					? t('accountSettings.savingPreferences')
					: t('accountSettings.savePreferences')}
			</button>
		</div>

		<!-- Danger Zone -->
		<div
			class="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 p-6 dark:border-destructive/30 dark:bg-destructive/5"
		>
			<div class="mb-4">
				<div class="flex items-center gap-2">
					<Trash2 class="h-5 w-5 text-destructive" />
					<h2 class="text-xl font-semibold text-foreground">Danger Zone</h2>
				</div>
				<p class="mt-1 text-sm text-muted-foreground">
					Irreversible actions. Proceed with caution.
				</p>
			</div>
			<button
				type="button"
				onclick={() => {
					if (
						confirm(
							'This will permanently delete your account and all associated data (trips, journal entries, photos, place visits). This cannot be undone. Are you sure?'
						)
					) {
						toast.error(
							'Account deletion is not yet implemented. Please contact your server administrator.'
						);
					}
				}}
				class="border-destructive/40 text-destructive hover:bg-destructive/10 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
			>
				Delete my account
			</button>
		</div>

		<!-- AI Settings - User-level provider configuration is managed via Fluxbase SDK -->
		<!-- When aiAllowUserOverride is true, users can configure their own AI provider through the SDK -->

		<!-- Trips Settings -->
		<div class="mt-8 rounded-xl border border-border bg-white p-6 dark:border-border dark:bg-card">
			<div class="mb-6">
				<div class="flex items-center gap-2">
					<MapPin class="h-5 w-5 text-muted-foreground" />
					<h2 class="text-xl font-semibold text-foreground">
						{t('accountSettings.trips')}
					</h2>
				</div>
				<p class="mt-1 text-sm text-gray-600 dark:text-foreground">
					{t('accountSettings.tripsDescription')}
				</p>
			</div>

			<!-- Pexels API Key Section -->
			<div class="mb-8">
				<div class="mb-4 flex items-center gap-2">
					<Image class="h-5 w-5 text-muted-foreground" />
					<h3 class="text-lg font-semibold text-foreground">
						{t('accountSettings.tripImageSuggestionsTitle')}
					</h3>
				</div>

				<p class="mb-4 text-sm text-muted-foreground">
					{t('accountSettings.tripImageSuggestionsDescription')}
				</p>

				{#if serverPexelsApiKeyAvailable}
					<div
						class="mb-4 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20"
					>
						<Info class="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" />
						<div class="text-xs text-green-700 dark:text-green-300">
							<p class="font-medium">✅ {t('accountSettings.serverPexelsKeyConfigured')}</p>
							<p class="mt-1">
								{t('accountSettings.serverPexelsKeyDetails')}
							</p>
						</div>
					</div>
				{/if}

				<div>
					<label for="pexels-api-key" class="mb-1.5 block text-sm font-medium text-foreground"
						>{serverPexelsApiKeyAvailable
							? t('accountSettings.personalPexelsApiKeyOptional')
							: t('accountSettings.personalPexelsApiKey')}</label
					>
					{#if pexelsApiKeyConfigured}
						<div class="flex items-center gap-2">
							<div
								class="flex flex-1 items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 dark:border-green-800 dark:bg-green-900/20"
							>
								<span class="text-sm font-medium text-green-700 dark:text-green-300">
									{t('accountSettings.secretConfigured')}
								</span>
								{#if pexelsApiKeyUpdatedAt}
									<span class="text-xs text-green-600 dark:text-green-400">
										({new Date(pexelsApiKeyUpdatedAt).toLocaleDateString()})
									</span>
								{/if}
							</div>
							<button
								type="button"
								onclick={clearPexelsApiKey}
								class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
							>
								{t('accountSettings.clearSecret')}
							</button>
						</div>
						<div class="mt-2">
							<Input
								type="password"
								id="pexels-api-key"
								bind:value={pexelsApiKeyInput}
								placeholder={t('accountSettings.enterNewKeyToReplace')}
								class="w-full"
							/>
						</div>
					{:else}
						<Input
							type="password"
							id="pexels-api-key"
							bind:value={pexelsApiKeyInput}
							placeholder={serverPexelsApiKeyAvailable
								? t('accountSettings.leaveEmptyToUseServerKey')
								: t('accountSettings.enterPexelsApiKey')}
							class="w-full"
						/>
					{/if}
					<p class="mt-1.5 text-xs text-muted-foreground">
						{#if pexelsApiKeyConfigured}
							✅ {t('accountSettings.usingPersonalApiKey')}
						{:else if serverPexelsApiKeyAvailable}
							ℹ️ {t('accountSettings.usingServerApiKey')}
						{:else}
							⚠️ {t('accountSettings.noApiKeyConfigured')}
						{/if}
					</p>
				</div>

				<!-- Personal Rate Limit Configuration (show if personal key is configured or being entered) -->
				{#if pexelsApiKeyConfigured || pexelsApiKeyInput.trim().length > 0}
					<div class="mt-4 space-y-2 border-t pt-4 border-border">
						<h4 class="text-sm font-medium text-foreground">Personal Rate Limit</h4>

						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={pexelsRateLimitEnabled}
								class="text-primary focus:ring-primary h-4 w-4 rounded border-gray-300 dark:border-border dark:bg-muted"
							/>
							<span class="text-sm text-muted-foreground">Set custom rate limit</span>
						</label>

						{#if !pexelsRateLimitEnabled}
							<p class="text-xs text-muted-foreground">
								Using default: <span class="font-medium">200 requests/hour</span>
							</p>
						{/if}

						{#if pexelsRateLimitEnabled}
							<div class="space-y-2">
								<div class="flex items-center gap-2">
									<Input
										type="number"
										bind:value={pexelsRateLimit}
										min="1"
										max="10000"
										placeholder="200"
										class="focus:border-primary focus:ring-primary w-24 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:ring-1 focus:outline-none dark:border-border dark:bg-muted dark:text-foreground"
									/>
									<span class="text-sm text-muted-foreground">requests per hour</span>
								</div>
								<p class="text-xs text-muted-foreground">
									Pexels free tier: 200/hour. Paid plans offer higher limits.
								</p>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Info notification -->
				<div
					class="bg-primary/5 dark:bg-primary/20 mt-4 flex items-start gap-3 rounded-lg border border-primary/20 p-3 dark:border-primary/30"
				>
					<Info class="text-primary mt-0.5 h-4 w-4 flex-shrink-0 dark:text-muted-foreground" />
					<p class="text-primary text-xs dark:text-muted-foreground">
						{t('accountSettings.dontHavePexelsApiKey')}
						<a
							href="https://www.pexels.com/api/"
							target="_blank"
							rel="noopener noreferrer"
							class="hover:text-primary/80 font-medium underline dark:hover:text-muted-foreground"
							>{t('accountSettings.getApiKey')}</a
						>.
					</p>
				</div>
			</div>

			<!-- Excluded Zones Section -->
			<div>
				<div class="mb-4 flex items-center gap-2">
					<MapPin class="h-5 w-5 text-muted-foreground" />
					<h3 class="text-lg font-semibold text-foreground">
						{t('accountSettings.excludedZones')}
					</h3>
				</div>
				<p class="mb-4 text-sm text-muted-foreground">
					{t('accountSettings.excludedZonesDescription')}
				</p>
				<p class="mb-4 text-xs text-muted-foreground">
					{t('accountSettings.excludedZonesHelp')}
				</p>
			</div>

			<div class="space-y-4">
				{#if tripExclusions.length > 0}
					<div class="space-y-3">
						{#each tripExclusions as exclusion (exclusion.id)}
							<div
								class="flex items-center justify-between rounded-lg border bg-gray-50 p-3 dark:bg-card border-border"
							>
								<div class="flex-1">
									<div class="font-medium text-foreground">{exclusion.name}</div>
									<!-- Dual-purpose badges -->
									<div class="mt-1 flex gap-2">
										<span
											class="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
											title={t('accountSettings.excludedZoneTripsBadge')}
										>
											🧳 {t('accountSettings.excludedZoneTripsBadge')}
										</span>
										<span
											class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300"
											title={t('accountSettings.excludedZonePlacesBadge')}
										>
											📍 {t('accountSettings.excludedZonePlacesBadge')}
										</span>
									</div>
									<div class="text-sm text-muted-foreground">
										{exclusion.location.display_name}
									</div>
									{#if exclusion.location.coordinates}
										<div class="text-xs text-muted-foreground">
											📍 {exclusion.location.coordinates.lat.toFixed(6)}, {exclusion.location.coordinates.lng.toFixed(
												6
											)}
										</div>
									{/if}
								</div>
								<div class="flex items-center gap-2">
									<button
										onclick={() => handleEditExclusion(exclusion)}
										class="text-primary hover:bg-primary/5 hover:text-primary/80 dark:hover:bg-primary/20 rounded-lg p-2 transition-colors"
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
					<div class="py-8 text-center text-muted-foreground">
						<MapPin class="mx-auto mb-4 h-12 w-12 opacity-50" />
						<p>{t('accountSettings.noExcludedZones')}</p>
						<p class="text-sm">
							{t('accountSettings.addExcludedZonesHint')}
						</p>
					</div>
				{/if}

				{#if tripExclusions.length < 10}
					<button
						onclick={() => (showAddExclusionModal = true)}
						class="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-3 text-gray-600 transition-colors hover:border-border dark:border-border dark:text-muted-foreground dark:hover:border-border hover:text-muted-foreground"
					>
						<Plus class="h-4 w-4" />
						{t('accountSettings.addTripExclusion')}
					</button>
				{:else}
					<div class="py-4 text-center text-sm text-muted-foreground">
						{t('accountSettings.maxTripExclusionsReached')}
					</div>
				{/if}
			</div>

			<!-- Save Button for Trips Section -->
			<button
				class="bg-primary hover:bg-primary/90 mt-6 cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
				onclick={handleSavePreferences}
				disabled={isUpdatingPreferences}
			>
				{isUpdatingPreferences
					? t('accountSettings.savingPreferences')
					: t('accountSettings.savePreferences')}
			</button>
		</div>
	{/if}
</div>

<!-- Add Trip Exclusion Modal -->
{#if showAddExclusionModal}
	<!-- Modal Overlay -->
	<div
		class="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/60 backdrop-blur-sm"
		onclick={() => (showAddExclusionModal = false)}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				showAddExclusionModal = false;
			}
		}}
		role="button"
		tabindex="0"
		aria-label="Close modal"
	>
		<!-- Modal Box -->
		<div
			class="animate-fade-in relative w-full max-w-md cursor-default rounded-2xl border p-8 shadow-2xl bg-card border-border"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<h3 class="mb-6 text-center text-2xl font-bold text-foreground">
				{t('accountSettings.addTripExclusionModal')}
			</h3>
			<div class="space-y-6">
				<div>
					<label
						for="add-exclusion-name"
						class="mb-2 block text-sm font-medium text-muted-foreground"
						>{t('common.fields.name')}</label
					>
					<Input
						id="add-exclusion-name"
						type="text"
						bind:value={newExclusion.name}
						placeholder={t('accountSettings.exclusionExampleLabel')}
						class="w-full"
					/>
				</div>
				<div>
					<label
						for="add-exclusion-address"
						class="mb-2 block text-sm font-medium text-muted-foreground"
						>{t('common.fields.address')}</label
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
							class="w-full"
						/>
						{#if isExclusionAddressSearching}
							<div class="absolute top-1/2 right-3 -translate-y-1/2">
								<div
									class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
								></div>
							</div>
						{/if}
					</div>
					{#if exclusionAddressSuggestions.length > 0 && showExclusionAddressSuggestions}
						<div
							class="mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-300 shadow-lg dark:border-border bg-card"
						>
							{#each exclusionAddressSuggestions as suggestion, index (suggestion.display_name + index)}
								<button
									type="button"
									class="w-full px-3 py-2 text-left text-sm text-gray-900 focus:bg-muted focus:outline-none dark:text-foreground dark:focus:bg-muted {selectedExclusionAddressIndex ===
									index
										? 'bg-primary/10 dark:bg-primary/20'
										: ''} hover:bg-muted"
									onclick={() => selectExclusionAddress(suggestion)}
								>
									<div class="font-medium">{suggestion.display_name}</div>
									{#if suggestion.coordinates}
										<div class="text-xs text-muted-foreground">
											📍 {suggestion.coordinates.lat.toFixed(6)}, {suggestion.coordinates.lng.toFixed(
												6
											)}
										</div>
									{/if}
								</button>
							{/each}
							{#if exclusionAddressSearchError}
								<div
									class="cursor-default px-3 py-2 text-center text-sm text-muted-foreground select-none"
								>
									{exclusionAddressSearchError}
								</div>
							{/if}
						</div>
					{:else if showExclusionAddressSuggestions && exclusionAddressSearchError}
						<div
							class="mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-300 shadow-lg dark:border-border bg-card"
						>
							<div
								class="cursor-default px-3 py-2 text-center text-sm text-muted-foreground select-none"
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
						class="bg-primary hover:bg-primary/90 flex-1 cursor-pointer rounded-lg px-6 py-3 font-semibold text-white shadow transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isAddingExclusion ? t('common.status.adding') : t('accountSettings.addExclusion')}
					</button>
					<button
						onclick={() => (showAddExclusionModal = false)}
						class="flex-1 cursor-pointer rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 shadow transition-all duration-200 dark:border-border dark:text-muted-foreground bg-card hover:bg-muted"
					>
						{t('common.actions.cancel')}
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
		class="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/60 backdrop-blur-sm"
		onclick={() => (showEditExclusionModal = false)}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				showEditExclusionModal = false;
			}
		}}
		role="button"
		tabindex="0"
		aria-label="Close modal"
	>
		<!-- Modal Box -->
		<div
			class="animate-fade-in relative w-full max-w-md cursor-default rounded-2xl border p-8 shadow-2xl bg-card border-border"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<h3 class="mb-6 text-center text-2xl font-bold text-foreground">
				{t('accountSettings.editTripExclusionModal')}
			</h3>
			<div class="space-y-6">
				<div>
					<label
						for="edit-exclusion-name"
						class="mb-2 block text-sm font-medium text-muted-foreground"
						>{t('common.fields.name')}</label
					>
					<Input
						id="edit-exclusion-name"
						type="text"
						bind:value={editingExclusion.name}
						placeholder={t('accountSettings.exclusionExampleLabel')}
						class="w-full"
					/>
				</div>
				<div>
					<label
						for="edit-exclusion-address"
						class="mb-2 block text-sm font-medium text-muted-foreground"
						>{t('common.fields.address')}</label
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
							class="w-full"
						/>
						{#if isEditExclusionAddressSearching}
							<div class="absolute top-1/2 right-3 -translate-y-1/2">
								<div
									class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
								></div>
							</div>
						{/if}
					</div>
					{#if editExclusionAddressSuggestions.length > 0 && showEditExclusionAddressSuggestions}
						<div
							class="mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-300 shadow-lg dark:border-border bg-card"
						>
							{#each editExclusionAddressSuggestions as suggestion, index (suggestion.display_name + index)}
								<button
									type="button"
									class="w-full px-3 py-2 text-left text-sm text-gray-900 focus:bg-muted focus:outline-none dark:text-foreground dark:focus:bg-muted {selectedEditExclusionAddressIndex ===
									index
										? 'bg-primary/10 dark:bg-primary/20'
										: ''} hover:bg-muted"
									onclick={() => selectEditExclusionAddress(suggestion)}
								>
									<div class="font-medium">{suggestion.display_name}</div>
									{#if suggestion.coordinates}
										<div class="text-xs text-muted-foreground">
											📍 {suggestion.coordinates.lat.toFixed(6)}, {suggestion.coordinates.lng.toFixed(
												6
											)}
										</div>
									{/if}
								</button>
							{/each}
							{#if editExclusionAddressSearchError}
								<div
									class="cursor-default px-3 py-2 text-center text-sm text-muted-foreground select-none"
								>
									{editExclusionAddressSearchError}
								</div>
							{/if}
						</div>
					{:else if showEditExclusionAddressSuggestions && editExclusionAddressSearchError}
						<div
							class="mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-300 shadow-lg dark:border-border bg-card"
						>
							<div
								class="cursor-default px-3 py-2 text-center text-sm text-muted-foreground select-none"
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
						class="bg-primary hover:bg-primary/90 flex-1 cursor-pointer rounded-lg px-6 py-3 font-semibold text-white shadow transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isEditingExclusion
							? t('common.status.updating')
							: t('accountSettings.updateExclusion')}
					</button>
					<button
						onclick={() => (showEditExclusionModal = false)}
						class="flex-1 cursor-pointer rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 shadow transition-all duration-200 dark:border-border dark:text-muted-foreground bg-card hover:bg-muted"
					>
						{t('common.actions.cancel')}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Onboarding Welcome Modal -->
{#if showOnboardingModal}
	<OnboardingWelcome
		bind:open={showOnboardingModal}
		onComplete={handleOnboardingComplete}
		onSkip={handleOnboardingSkip}
		{isAdmin}
	/>
{/if}

<!-- Two-Factor Authentication Modals -->
{#if showTwoFactorSetup}
	<TwoFactorSetup bind:open={showTwoFactorSetup} on:success={handle2FASetupSuccess} />
{/if}

{#if showTwoFactorDisable}
	<TwoFactorDisable bind:open={showTwoFactorDisable} on:success={handle2FADisableSuccess} />
{/if}
