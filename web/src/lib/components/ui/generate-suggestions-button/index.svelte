<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { RefreshCw } from 'lucide-svelte';
	import Tooltip from '../tooltip/index.svelte';
	import { browser } from '$app/environment';
	import { supabase } from '$lib/supabase';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import type { UserProfile } from '$lib/types/user.types';

	export let disabled = false; // Allow external override

	const dispatch = createEventDispatcher();

	// User profile and home address state
	let userProfile: UserProfile | null = null;
	let hasHomeAddress = false;
	let isLoadingProfile = false;

	// Load user profile to check for home address
	async function loadUserProfile() {
		if (!browser) return;

		isLoadingProfile = true;
		try {
			const session = await supabase.auth.getSession();
			if (!session.data.session?.user) {
				console.error('No session found');
				return;
			}

			// Use the Edge Function to get user profile
			const serviceAdapter = new ServiceAdapter({ session: session.data.session });
			const profile = await serviceAdapter.callApi('auth-profile') as any;

			userProfile = profile as UserProfile;

			// Check if user has a home address
			hasHomeAddress = !!(profile?.home_address);
			console.log('🏠 User home address check:', {
				hasHomeAddress,
				homeAddress: profile?.home_address
			});
		} catch (error) {
			console.error('Error loading user profile:', error);
		} finally {
			isLoadingProfile = false;
		}
	}

	function handleClick() {
		if (hasHomeAddress && !disabled) {
			dispatch('click');
		}
	}



	// Load user profile on mount
	import { onMount } from 'svelte';
	onMount(() => {
		loadUserProfile();
	});

	// Determine if button should be disabled
	$: isDisabled = disabled || !hasHomeAddress || isLoadingProfile;
</script>

<Tooltip
	text={isDisabled
		? 'Please add your home address in your account settings first'
		: 'Generate new trip suggestions'
	}
	position="top"
>
	<button
		class="flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors {!isDisabled
			? 'cursor-pointer bg-blue-500 text-white hover:bg-blue-600'
			: 'cursor-not-allowed bg-gray-300 text-gray-500 dark:bg-gray-600 dark:text-gray-400'}"
		on:click={handleClick}
		disabled={isDisabled}
	>
		{#if isLoadingProfile}
			<div class="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
		{:else}
			<RefreshCw class="h-4 w-4" />
		{/if}
		Generate New Suggestions
	</button>
</Tooltip>