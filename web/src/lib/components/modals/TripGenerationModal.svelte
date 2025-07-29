<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Route } from 'lucide-svelte';
	import Modal from '$lib/components/ui/modal/index.svelte';
	import AddressSearch from '$lib/components/ui/address-search/index.svelte';
	import Button from '$lib/components/ui/button/index.svelte';
	import { get } from 'svelte/store';
	import { sessionStore } from '$lib/stores/auth';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';

	export let open = false;
	export let startDate = '';
	export let endDate = '';
	export let useCustomHomeAddress = false;
	export let customHomeAddress = '';
	export let customHomeAddressInput = '';
	export let isCustomHomeAddressSearching = false;
	export let customHomeAddressSuggestions: any[] = [];
	export let showCustomHomeAddressSuggestions = false;
	export let selectedCustomHomeAddressIndex = -1;
	export let customHomeAddressSearchError: string | null = null;
	export let selectedCustomHomeAddress: any = null;
	export let clearExistingSuggestions = false;

	// Add timeout variable at the top
	let customHomeAddressSearchTimeout: ReturnType<typeof setTimeout> | null = null;

	const dispatch = createEventDispatcher();

	function closeModal() {
		dispatch('close', undefined);
	}

	function generateTrip() {
		// Prevent trips with same start and end date (single-day trips)
		if (startDate === endDate) {
			alert('Start and end dates cannot be the same. A trip must span at least two days.');
			return;
		}

		dispatch('generate', {
			startDate,
			endDate,
			useCustomHomeAddress,
			customHomeAddress: useCustomHomeAddress ? customHomeAddressInput : null,
			customHomeAddressGeocode:
				useCustomHomeAddress && selectedCustomHomeAddress ? selectedCustomHomeAddress : null,
			clearExistingSuggestions
		});
	}

	function handleAddressSelect(event: CustomEvent) {
		dispatch('addressSelect', event.detail);
	}

	function handleCustomHomeAddressToggle() {
		dispatch('customHomeAddressToggle', { useCustomHomeAddress });
	}

	function handleCustomHomeAddressInput(event: Event) {
		const target = event.target as HTMLInputElement;
		customHomeAddressInput = target.value;

		// Clear previous timeout
		if (customHomeAddressSearchTimeout) {
			clearTimeout(customHomeAddressSearchTimeout);
		}

		// Debounce the search
		customHomeAddressSearchTimeout = setTimeout(() => {
			searchCustomHomeAddressSuggestions();
		}, 300);
	}

	function handleCustomHomeAddressKeydown(event: KeyboardEvent) {
		if (!showCustomHomeAddressSuggestions || customHomeAddressSuggestions.length === 0) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedCustomHomeAddressIndex = Math.min(
					selectedCustomHomeAddressIndex + 1,
					customHomeAddressSuggestions.length - 1
				);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedCustomHomeAddressIndex = Math.max(selectedCustomHomeAddressIndex - 1, 0);
				break;
			case 'Enter':
				event.preventDefault();
				if (
					selectedCustomHomeAddressIndex >= 0 &&
					selectedCustomHomeAddressIndex < customHomeAddressSuggestions.length
				) {
					selectCustomHomeAddress(customHomeAddressSuggestions[selectedCustomHomeAddressIndex]);
				}
				break;
			case 'Escape':
				event.preventDefault();
				showCustomHomeAddressSuggestions = false;
				selectedCustomHomeAddressIndex = -1;
				break;
		}

		dispatch('customHomeAddressKeydown', { event });
	}

	async function searchCustomHomeAddressSuggestions() {
		if (!customHomeAddressInput.trim() || customHomeAddressInput.trim().length < 3) {
			customHomeAddressSuggestions = [];
			showCustomHomeAddressSuggestions = false;
			customHomeAddressSearchError = null;
			return;
		}

		isCustomHomeAddressSearching = true;
		showCustomHomeAddressSuggestions = true;
		customHomeAddressSearchError = null;

		try {
			const session = get(sessionStore);
			if (!session) {
				return;
			}

			const serviceAdapter = new ServiceAdapter({ session });
			const data = (await serviceAdapter.searchGeocode(customHomeAddressInput.trim())) as any;

			// The Edge Functions service returns the data array directly
			customHomeAddressSuggestions = Array.isArray(data) ? data : [];
			showCustomHomeAddressSuggestions = true;
			if (customHomeAddressSuggestions.length === 0) {
				customHomeAddressSearchError = 'No addresses found';
			}
		} catch (error) {
			console.error('Error searching for custom home address:', error);
			customHomeAddressSuggestions = [];
			customHomeAddressSearchError = 'Failed to search for address';
			showCustomHomeAddressSuggestions = true;
		} finally {
			isCustomHomeAddressSearching = false;
		}
	}

	function selectCustomHomeAddress(suggestion: any) {
		customHomeAddressInput = suggestion.display_name;
		customHomeAddress = suggestion.display_name;
		selectedCustomHomeAddress = suggestion;
		showCustomHomeAddressSuggestions = false;
		selectedCustomHomeAddressIndex = -1;
	}
</script>

<Modal {open} title="Generate Trip Suggestions" size="md" on:close={closeModal}>
	<div class="space-y-6">
		<!-- Tip Section -->
		<div
			class="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20"
		>
			<p class="text-sm text-blue-800 dark:text-blue-200">
				💡 <strong>Tip:</strong> If you lived at different addresses during the analysis period, consider
				setting specific start and end dates for each address to get more accurate trip detection.
			</p>
		</div>

		<!-- Start Date -->
		<div>
			<label
				for="start-date"
				class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>Start Date (optional)</label
			>
			<input
				id="start-date"
				type="date"
				bind:value={startDate}
				class="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
			<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
				Leave empty to automatically find available date ranges
			</p>
		</div>

		<!-- End Date -->
		<div>
			<label
				for="end-date"
				class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>End Date (optional)</label
			>
			<input
				id="end-date"
				type="date"
				bind:value={endDate}
				class="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
			<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
				Leave empty to automatically find available date ranges
			</p>
		</div>

		<!-- Date validation warning -->
		{#if startDate && endDate && startDate === endDate}
			<div class="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
				<div class="flex items-start gap-2">
					<div class="mt-0.5">
						<svg class="h-4 w-4 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
						</svg>
					</div>
					<div class="text-sm text-red-700 dark:text-red-200">
						<strong>Invalid date range:</strong> Start and end dates cannot be the same. A trip must span at least two days.
					</div>
				</div>
			</div>
		{/if}
		<!-- Clear Existing Suggestions Toggle -->
		<div class="flex items-center gap-3">
			<input
				id="clearExistingSuggestions"
				type="checkbox"
				bind:checked={clearExistingSuggestions}
				class="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
			/>
			<label
				for="clearExistingSuggestions"
				class="text-sm font-medium text-gray-700 dark:text-gray-300"
			>
				Clear all existing suggestions before generating new ones
			</label>
		</div>
		<!-- Custom Home Address Toggle -->
		<div class="flex items-center gap-3">
			<input
				id="useCustomHomeAddress"
				type="checkbox"
				bind:checked={useCustomHomeAddress}
				on:change={handleCustomHomeAddressToggle}
				class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
			/>
			<label
				for="useCustomHomeAddress"
				class="text-sm font-medium text-gray-700 dark:text-gray-300"
			>
				Use custom home address for this analysis
			</label>
		</div>

		{#if clearExistingSuggestions}
			<div
				class="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20"
			>
				<div class="flex items-start gap-2">
					<div class="mt-0.5">
						<svg
							class="h-4 w-4 text-red-600 dark:text-red-400"
							fill="currentColor"
							viewBox="0 0 20 20"
						>
							<path
								fill-rule="evenodd"
								d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<div class="text-sm text-red-700 dark:text-red-200">
						<strong>Warning:</strong> This will permanently delete all your existing suggested trips
						before generating new ones. This action cannot be undone.
					</div>
				</div>
			</div>
		{/if}

		<!-- Custom Home Address Input -->
		{#if useCustomHomeAddress}
			<div>
				<label
					for="custom-home-address"
					class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
					>Custom Home Address</label
				>
				<div class="relative">
					<input
						id="custom-home-address"
						type="text"
						bind:value={customHomeAddressInput}
						on:input={handleCustomHomeAddressInput}
						on:keydown={handleCustomHomeAddressKeydown}
						placeholder="Enter custom home address..."
						class="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
					/>

					{#if isCustomHomeAddressSearching}
						<div class="absolute right-3 top-1/2 -translate-y-1/2">
							<div
								class="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
							></div>
						</div>
					{/if}
				</div>

				{#if customHomeAddressSuggestions.length > 0 && showCustomHomeAddressSuggestions}
					<div
						class="mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
					>
						{#each customHomeAddressSuggestions as suggestion, index}
							<button
								type="button"
								class="w-full px-4 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:hover:bg-gray-700 dark:focus:bg-gray-700 {selectedCustomHomeAddressIndex ===
								index
									? 'bg-gray-100 dark:bg-gray-700'
									: ''}"
								on:click={() => selectCustomHomeAddress(suggestion)}
							>
								<div class="text-sm text-gray-900 dark:text-gray-100">
									{suggestion.display_name}
								</div>
								{#if suggestion.coordinates}
									<div class="text-xs text-gray-500 dark:text-gray-400">
										{suggestion.coordinates.lat.toFixed(4)}, {suggestion.coordinates.lng.toFixed(4)}
									</div>
								{/if}
							</button>
						{/each}
						{#if customHomeAddressSearchError}
							<div class="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
								{customHomeAddressSearchError}
							</div>
						{/if}
					</div>
				{:else if showCustomHomeAddressSuggestions && customHomeAddressSearchError}
					<div
						class="mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
					>
						<div class="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
							{customHomeAddressSearchError}
						</div>
					</div>
				{/if}

				{#if selectedCustomHomeAddress && selectedCustomHomeAddress.coordinates}
					<div
						class="mt-2 rounded-md border border-green-200 bg-green-50 p-2 dark:border-green-800 dark:bg-green-900/20"
					>
						<div class="text-sm text-green-800 dark:text-green-200">
							📍 Coordinates: {selectedCustomHomeAddress.coordinates.lat.toFixed(6)}, {selectedCustomHomeAddress.coordinates.lng.toFixed(
								6
							)}
						</div>
						<div class="mt-1 text-xs text-green-600 dark:text-green-300">
							{selectedCustomHomeAddress.display_name}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Action Buttons -->
		<div class="flex gap-3 pt-4">
			<button
				on:click={closeModal}
				class="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
			>
				Cancel
			</button>
			<button
				on:click={generateTrip}
				class="flex flex-1 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-600 dark:hover:bg-blue-700"
			>
				<Route class="mr-2 h-4 w-4 flex-shrink-0" />
				<span class="truncate">Generate Suggestions</span>
			</button>
		</div>
	</div>
</Modal>
