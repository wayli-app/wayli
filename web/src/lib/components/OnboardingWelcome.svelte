<script lang="ts">
	import { ArrowRight, Home, X, Link, Import, Map, Settings, Rocket } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	import { translate } from '$lib/i18n';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { onboardingState, onboardingActions } from '$lib/stores/onboarding';
	import { sessionStore } from '$lib/stores/auth';
	import type { OnboardingCallbacks } from '$lib/types/onboarding.types';

	let {
		open = $bindable(false),
		onComplete,
		onSkip,
		isAdmin = false
	}: {
		open: boolean;
		onComplete: (homeAddress?: any) => Promise<void>;
		onSkip: () => Promise<void>;
		isAdmin?: boolean;
	} = $props();

	let t = $derived($translate);
	let currentStep = $derived($onboardingState.currentStep);

	// Home address state
	let homeAddressInput = $state('');
	let selectedHomeAddress = $state<any>(null);
	let homeAddressSuggestions = $state<any[]>([]);
	let showSuggestions = $state(false);
	let isSearching = $state(false);
	let selectedAddressIndex = $state(-1);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	async function handleContinue() {
		if (currentStep === 0) {
			// Move to home address step
			onboardingActions.nextStep();
		} else if (currentStep === 1) {
			// Move to next steps (step 3)
			onboardingActions.nextStep();
		} else if (currentStep === 2) {
			// Complete onboarding
			await onComplete(selectedHomeAddress);
			onboardingActions.complete();
			open = false;
		}
	}

	async function handleSkip() {
		if (currentStep === 1) {
			// Skip home address, move to next steps
			selectedHomeAddress = null;
			onboardingActions.nextStep();
		}
	}

	async function handleFinish() {
		// Complete onboarding from step 3
		await onComplete(selectedHomeAddress);
		onboardingActions.complete();
		open = false;
	}

	function handleClose() {
		if (confirm(t('onboarding.confirmSkip'))) {
			onSkip();
			onboardingActions.complete();
			open = false;
		}
	}

	// Address autocomplete functions
	function handleAddressInput(event: Event) {
		const target = event.target as HTMLInputElement;
		homeAddressInput = target.value;
		selectedAddressIndex = -1;
		selectedHomeAddress = null;

		if (searchTimeout) clearTimeout(searchTimeout);

		if (!homeAddressInput.trim()) {
			homeAddressSuggestions = [];
			showSuggestions = false;
			return;
		}

		searchTimeout = setTimeout(() => searchAddress(), 300);
	}

	function handleAddressKeydown(event: KeyboardEvent) {
		if (!showSuggestions || homeAddressSuggestions.length === 0) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedAddressIndex = Math.min(
					selectedAddressIndex + 1,
					homeAddressSuggestions.length - 1
				);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedAddressIndex = Math.max(selectedAddressIndex - 1, 0);
				break;
			case 'Enter':
				event.preventDefault();
				if (selectedAddressIndex >= 0 && selectedAddressIndex < homeAddressSuggestions.length) {
					selectAddress(homeAddressSuggestions[selectedAddressIndex]);
				}
				break;
			case 'Escape':
				event.preventDefault();
				showSuggestions = false;
				selectedAddressIndex = -1;
				break;
		}
	}

	async function searchAddress() {
		if (!homeAddressInput.trim()) {
			homeAddressSuggestions = [];
			showSuggestions = false;
			return;
		}

		isSearching = true;

		try {
			const session = $sessionStore;
			if (!session) return;

			const serviceAdapter = new ServiceAdapter({ session });
			const result = (await serviceAdapter.searchGeocode(homeAddressInput)) as any;

			homeAddressSuggestions = Array.isArray(result) ? result : [];
			showSuggestions = homeAddressSuggestions.length > 0;
		} catch (error) {
			console.error('Error searching for address:', error);
			homeAddressSuggestions = [];
			showSuggestions = false;
		} finally {
			isSearching = false;
		}
	}

	function selectAddress(suggestion: any) {
		selectedHomeAddress = suggestion;
		homeAddressInput = suggestion.display_name;
		showSuggestions = false;
		homeAddressSuggestions = [];
	}
</script>

{#if open}
	<!-- Modal Overlay -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) handleClose();
		}}
	>
		<!-- Modal Content -->
		<div
			class="bg-card border-border relative w-full max-w-2xl rounded-2xl border p-8 shadow-2xl"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<!-- Close Button -->
			<button
				onclick={handleClose}
				class="text-muted-foreground hover:bg-muted hover:text-muted-foreground absolute top-4 right-4 rounded-lg p-2 transition-colors"
				aria-label={t('common.close')}
			>
				<X class="h-5 w-5" />
			</button>

			<!-- Progress Indicator -->
			<div class="mb-6 flex items-center justify-center gap-2">
				{#each Array(3) as _, i (i)}
					<div
						class="h-2 w-8 rounded-full transition-colors {i === currentStep
							? 'bg-primary'
							: i < currentStep
								? 'bg-primary/50'
								: 'dark:bg-muted bg-gray-300'}"
					></div>
				{/each}
			</div>

			{#if currentStep === 0}
				<!-- Step 1: Welcome -->
				<div class="text-center">
					<div
						class="bg-primary/10 dark:bg-primary/20 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-4xl"
					>
						👋
					</div>
					<h2 class="text-foreground mb-4 text-3xl font-bold">
						{t('onboarding.welcome')}
					</h2>
					<p class="text-muted-foreground mb-8 text-lg">
						{t('onboarding.welcomeMessage')}
					</p>
					<p class="text-muted-foreground mb-6 text-sm">
						{t('onboarding.stepProgress', { current: 1, total: 3 })}
					</p>
					<button
						onclick={handleContinue}
						class="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-8 py-3 font-semibold text-white transition-all hover:scale-105"
					>
						{t('onboarding.continue')}
						<ArrowRight class="h-5 w-5" />
					</button>
				</div>
			{:else if currentStep === 1}
				<!-- Step 2: Home Location (Optional) -->
				<div>
					<div class="mb-6 text-center">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20"
						>
							<Home class="h-8 w-8 text-green-600 dark:text-green-400" />
						</div>
						<h2 class="text-foreground mb-4 text-3xl font-bold">
							{t('onboarding.setHomeLocation')}
						</h2>
						<p class="text-muted-foreground mb-2">
							{t('onboarding.homeLocationHelp')}
						</p>
						<p class="text-muted-foreground mb-6 text-sm">
							{t('onboarding.homeLocationOptional')}
						</p>
					</div>

					<!-- Address Input -->
					<div class="mb-8">
						<label
							for="onboarding-address"
							class="text-muted-foreground mb-2 block text-sm font-medium"
						>
							{t('onboarding.homeAddressLabel')}
						</label>
						<div class="relative">
							<input
								id="onboarding-address"
								type="text"
								bind:value={homeAddressInput}
								oninput={handleAddressInput}
								onkeydown={handleAddressKeydown}
								placeholder={t('onboarding.homeAddressPlaceholder')}
								class="focus:border-primary dark:border-border dark:bg-muted dark:text-foreground w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none"
							/>
							{#if isSearching}
								<div class="absolute top-1/2 right-3 -translate-y-1/2">
									<div
										class="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
									></div>
								</div>
							{/if}
						</div>

						<!-- Suggestions Dropdown -->
						{#if homeAddressSuggestions.length > 0 && showSuggestions}
							<div
								class="dark:border-border bg-card mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-300 shadow-lg"
							>
								{#each homeAddressSuggestions as suggestion, index (suggestion.display_name + index)}
									<button
										type="button"
										class="focus:bg-muted dark:text-foreground dark:focus:bg-muted w-full px-3 py-2 text-left text-sm text-gray-900 focus:outline-none {selectedAddressIndex ===
										index
											? 'bg-primary/10 dark:bg-primary/20'
											: ''} hover:bg-muted"
										onclick={() => selectAddress(suggestion)}
									>
										<div class="font-medium">{suggestion.display_name}</div>
										{#if suggestion.lat && suggestion.lon}
											<div class="text-muted-foreground text-xs">
												📍 {parseFloat(suggestion.lat).toFixed(6)}, {parseFloat(
													suggestion.lon
												).toFixed(6)}
											</div>
										{/if}
									</button>
								{/each}
							</div>
						{/if}

						{#if selectedHomeAddress && selectedHomeAddress.lat}
							<div
								class="mt-2 rounded-md border border-green-200 bg-green-50 p-2 dark:border-green-800 dark:bg-green-900/20"
							>
								<div class="text-sm text-green-800 dark:text-green-200">
									✅ {selectedHomeAddress.display_name}
								</div>
							</div>
						{/if}

						<p class="text-muted-foreground mt-2 text-xs">
							{t('onboarding.homeLocationTip')}
						</p>
					</div>

					<!-- Action Buttons -->
					<p class="text-muted-foreground mb-4 text-center text-sm">
						{t('onboarding.stepProgress', { current: 2, total: 3 })}
					</p>
					<div class="flex gap-4">
						<button
							onclick={handleSkip}
							class="dark:border-border dark:text-muted-foreground hover:bg-muted flex-1 rounded-lg border-2 border-gray-300 px-6 py-3 font-semibold text-gray-700 transition-all hover:scale-105"
						>
							{t('onboarding.skipForNow')}
						</button>
						<button
							onclick={handleContinue}
							disabled={!selectedHomeAddress}
							class="bg-primary hover:bg-primary/90 flex-1 rounded-lg px-6 py-3 font-semibold text-white transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
						>
							{t('onboarding.continue')}
						</button>
					</div>
				</div>
			{:else if currentStep === 2}
				<!-- Step 3: Next Steps -->
				<div>
					<div class="mb-6 text-center">
						<div
							class="bg-primary/10 dark:bg-primary/20 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
						>
							<Rocket class="text-primary h-8 w-8" />
						</div>
						<h2 class="text-foreground mb-2 text-3xl font-bold">
							{t('onboarding.nextStepsTitle')}
						</h2>
						<p class="text-muted-foreground">
							{t('onboarding.nextStepsSubtitle')}
						</p>
					</div>

					<!-- Next Steps Cards -->
					<div class="mb-6 space-y-3">
						<!-- Configure OwnTracks -->
						<a
							href="/dashboard/connections"
							onclick={() => {
								handleFinish();
							}}
							class="hover:border-primary/50 hover:bg-muted dark:hover:border-primary/50 dark:hover:bg-muted/50 border-border flex items-start gap-4 rounded-lg border p-4 transition-all"
						>
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30"
							>
								<Link class="h-5 w-5 text-blue-600 dark:text-blue-400" />
							</div>
							<div>
								<h3 class="text-foreground font-semibold">
									{t('onboarding.configureOwnTracks')}
								</h3>
								<p class="text-muted-foreground text-sm">
									{t('onboarding.configureOwnTracksDesc')}
								</p>
							</div>
						</a>

						<!-- Import Data -->
						<a
							href="/dashboard/import-export"
							onclick={() => {
								handleFinish();
							}}
							class="hover:border-primary/50 hover:bg-muted dark:hover:border-primary/50 dark:hover:bg-muted/50 border-border flex items-start gap-4 rounded-lg border p-4 transition-all"
						>
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30"
							>
								<Import class="h-5 w-5 text-green-600 dark:text-green-400" />
							</div>
							<div>
								<h3 class="text-foreground font-semibold">
									{t('onboarding.importData')}
								</h3>
								<p class="text-muted-foreground text-sm">
									{t('onboarding.importDataDesc')}
								</p>
							</div>
						</a>

						<!-- Configure AI (Admin only) - shown before trips since AI is needed for trip suggestions -->
						{#if isAdmin}
							<a
								href="/dashboard/server-admin-settings"
								onclick={() => {
									handleFinish();
								}}
								class="hover:border-primary/50 hover:bg-muted dark:hover:border-primary/50 dark:hover:bg-muted/50 border-border flex items-start gap-4 rounded-lg border p-4 transition-all"
							>
								<div
									class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30"
								>
									<Settings class="h-5 w-5 text-orange-600 dark:text-orange-400" />
								</div>
								<div>
									<h3 class="text-foreground font-semibold">
										{t('onboarding.configureAI')}
									</h3>
									<p class="text-muted-foreground text-sm">
										{t('onboarding.configureAIDesc')}
									</p>
								</div>
							</a>
						{/if}

						<!-- Generate Trips -->
						<a
							href="/dashboard/travel"
							onclick={() => {
								handleFinish();
							}}
							class="hover:border-primary/50 hover:bg-muted dark:hover:border-primary/50 dark:hover:bg-muted/50 border-border flex items-start gap-4 rounded-lg border p-4 transition-all"
						>
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30"
							>
								<Map class="h-5 w-5 text-purple-600 dark:text-purple-400" />
							</div>
							<div>
								<h3 class="text-foreground font-semibold">
									{t('onboarding.generateTrips')}
								</h3>
								<p class="text-muted-foreground text-sm">
									{t('onboarding.generateTripsDesc')}
								</p>
							</div>
						</a>
					</div>

					<!-- Action Button -->
					<p class="text-muted-foreground mb-4 text-center text-sm">
						{t('onboarding.stepProgress', { current: 3, total: 3 })}
					</p>
					<button
						onclick={handleFinish}
						class="bg-primary hover:bg-primary/90 w-full rounded-lg px-6 py-3 font-semibold text-white transition-all hover:scale-105"
					>
						{t('onboarding.getStarted')}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
