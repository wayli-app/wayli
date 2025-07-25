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

	const dispatch = createEventDispatcher();

	function closeModal() {
		dispatch('close', undefined);
	}

	function generateTrip() {
		dispatch('generate', {
			startDate,
			endDate,
			useCustomHomeAddress,
			customHomeAddress: useCustomHomeAddress ? customHomeAddressInput : null
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
		dispatch('customHomeAddressInput', { value: customHomeAddressInput });
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
			if (!session) return;

			const serviceAdapter = new ServiceAdapter({ session });
			const data = await serviceAdapter.searchGeocode(customHomeAddressInput.trim()) as any;

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

		dispatch('selectCustomHomeAddress', { suggestion });
	}

	// Add timeout variable
	let customHomeAddressSearchTimeout: ReturnType<typeof setTimeout> | null = null;
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
			<label for="start-date" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>Start Date (optional)</label
			>
			<input
				id="start-date"
				type="date"
				bind:value={startDate}
				class="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-gray-900 transition focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
			<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
				Leave empty to automatically find available date ranges
			</p>
		</div>

		<!-- End Date -->
		<div>
			<label for="end-date" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
				>End Date (optional)</label
			>
			<input
				id="end-date"
				type="date"
				bind:value={endDate}
				class="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-gray-900 transition focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
			<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
				Leave empty to automatically find available date ranges
			</p>
		</div>

		<!-- Custom Home Address Toggle -->
		<div class="flex items-center gap-3">
			<input
				id="useCustomHomeAddress"
				type="checkbox"
				bind:checked={useCustomHomeAddress}
				on:change={handleCustomHomeAddressToggle}
				class="h-4 w-4 rounded border-gray-300 bg-gray-100 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:ring-offset-gray-800 dark:focus:ring-blue-600"
			/>
			<label
				for="useCustomHomeAddress"
				class="text-sm font-medium text-gray-700 dark:text-gray-300"
			>
				Use custom home address for this analysis
			</label>
		</div>

		<!-- Custom Home Address Input -->
		{#if useCustomHomeAddress}
			<div class="relative">
				<label for="custom-home-address" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
					>Custom Home Address</label
				>
				<input
					id="custom-home-address"
					type="text"
					bind:value={customHomeAddressInput}
					on:input={handleCustomHomeAddressInput}
					on:keydown={handleCustomHomeAddressKeydown}
					placeholder="Enter custom home address..."
					class="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-gray-900 transition focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>

				{#if isCustomHomeAddressSearching}
					<div
						class="absolute top-1/2 right-3 flex h-4 w-4 -translate-y-1/2 items-center justify-center"
					>
						<div
							class="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
						></div>
					</div>
				{/if}

				{#if showCustomHomeAddressSuggestions}
					<div
						class="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
					>
						{#if customHomeAddressSuggestions.length > 0}
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
											{suggestion.coordinates.lat.toFixed(4)}, {suggestion.coordinates.lng.toFixed(
												4
											)}
										</div>
									{/if}
								</button>
							{/each}
						{:else if customHomeAddressSearchError}
							<div class="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
								{customHomeAddressSearchError}
							</div>
						{/if}
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
				class="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
			>
				Cancel
			</button>
			<button
				on:click={generateTrip}
				class="flex flex-1 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:bg-blue-600 dark:hover:bg-blue-700"
			>
				<Route class="mr-2 h-4 w-4 flex-shrink-0" />
				<span class="truncate">Generate Suggestions</span>
			</button>
		</div>
	</div>
</Modal>
