<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Route } from 'lucide-svelte';
	import Modal from '$lib/components/ui/modal/index.svelte';
	import AddressSearch from '$lib/components/ui/address-search/index.svelte';
	import Button from '$lib/components/ui/button/index.svelte';

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

	function handleClose() {
		dispatch('close');
	}

	function handleGenerate() {
		dispatch('generate', {
			startDate,
			endDate,
			useCustomHomeAddress,
			customHomeAddress
		});
	}

	function handleAddressSelect(event: CustomEvent) {
		customHomeAddress = event.detail.displayName;
		dispatch('addressSelect', event.detail);
	}

	function handleCustomHomeAddressToggle() {
		dispatch('customHomeAddressToggle', { useCustomHomeAddress });
	}

	function handleCustomHomeAddressInput(event: Event) {
		const target = event.target as HTMLInputElement;
		customHomeAddressInput = target.value;
		customHomeAddress = target.value;
		selectedCustomHomeAddressIndex = -1;
		selectedCustomHomeAddress = null;

		// Clear existing timeout
		if (customHomeAddressSearchTimeout) clearTimeout(customHomeAddressSearchTimeout);

		if (!customHomeAddressInput.trim()) {
			customHomeAddressSuggestions = [];
			showCustomHomeAddressSuggestions = false;
			return;
		}

		// Debounce search
		customHomeAddressSearchTimeout = setTimeout(() => searchCustomHomeAddressSuggestions(), 300);

		dispatch('customHomeAddressInput', { value: customHomeAddressInput });
	}

	function handleCustomHomeAddressKeydown(event: KeyboardEvent) {
		if (!showCustomHomeAddressSuggestions || customHomeAddressSuggestions.length === 0) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedCustomHomeAddressIndex = Math.min(selectedCustomHomeAddressIndex + 1, customHomeAddressSuggestions.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedCustomHomeAddressIndex = Math.max(selectedCustomHomeAddressIndex - 1, 0);
				break;
			case 'Enter':
				event.preventDefault();
				if (selectedCustomHomeAddressIndex >= 0 && selectedCustomHomeAddressIndex < customHomeAddressSuggestions.length) {
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
			const response = await fetch(`/api/v1/geocode/search?q=${encodeURIComponent(customHomeAddressInput.trim())}`);
			if (response.ok) {
				const data = await response.json();
				// Handle both old format (data.data as array) and new format (data.data.results as array)
				customHomeAddressSuggestions = data.data?.results || data.data || [];
				showCustomHomeAddressSuggestions = true;
				if (customHomeAddressSuggestions.length === 0) {
					customHomeAddressSearchError = 'No addresses found';
				}
			} else {
				customHomeAddressSuggestions = [];
				customHomeAddressSearchError = 'No addresses found';
				showCustomHomeAddressSuggestions = true;
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
		console.log('selectCustomHomeAddress called with:', suggestion);
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

<Modal
	{open}
	title="Generate Trip Suggestions"
	size="md"
	on:close={handleClose}
>
	<div class="space-y-6">
		<!-- Tip Section -->
		<div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
			<p class="text-sm text-blue-800 dark:text-blue-200">
				💡 <strong>Tip:</strong> If you lived at different addresses during the analysis period, consider setting specific start and end dates for each address to get more accurate trip detection.
			</p>
		</div>

		<!-- Start Date -->
		<div>
			<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Start Date (optional)</label>
			<input
				type="date"
				bind:value={startDate}
				class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
			/>
			<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave empty to automatically find available date ranges</p>
		</div>

		<!-- End Date -->
		<div>
			<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">End Date (optional)</label>
			<input
				type="date"
				bind:value={endDate}
				class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
			/>
			<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave empty to automatically find available date ranges</p>
		</div>

		<!-- Custom Home Address Toggle -->
		<div class="flex items-center gap-3">
			<input
				type="checkbox"
				id="useCustomHomeAddress"
				bind:checked={useCustomHomeAddress}
				on:change={handleCustomHomeAddressToggle}
				class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
			/>
			<label for="useCustomHomeAddress" class="text-sm font-medium text-gray-700 dark:text-gray-300">
				Use custom home address for this analysis
			</label>
		</div>

		<!-- Custom Home Address Input -->
		{#if useCustomHomeAddress}
			<div class="relative">
				<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Custom Home Address</label>
				<input
					type="text"
					bind:value={customHomeAddressInput}
					on:input={handleCustomHomeAddressInput}
					on:keydown={handleCustomHomeAddressKeydown}
					placeholder="Enter custom home address..."
					class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
				/>

				{#if isCustomHomeAddressSearching}
					<div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-4">
						<div class="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
					</div>
				{/if}

				{#if showCustomHomeAddressSuggestions}
					<div class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
						{#if customHomeAddressSuggestions.length > 0}
							{#each customHomeAddressSuggestions as suggestion, index}
								<button
									type="button"
									class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 focus:outline-none {selectedCustomHomeAddressIndex === index ? 'bg-gray-100 dark:bg-gray-700' : ''}"
									on:click={() => selectCustomHomeAddress(suggestion)}
								>
									<div class="text-sm text-gray-900 dark:text-gray-100">{suggestion.display_name}</div>
									{#if suggestion.coordinates}
										<div class="text-xs text-gray-500 dark:text-gray-400">
											{suggestion.coordinates.lat.toFixed(4)}, {suggestion.coordinates.lng.toFixed(4)}
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
					<div class="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
						<div class="text-sm text-green-800 dark:text-green-200">
							📍 Coordinates: {selectedCustomHomeAddress.coordinates.lat.toFixed(6)}, {selectedCustomHomeAddress.coordinates.lng.toFixed(6)}
						</div>
						<div class="text-xs text-green-600 dark:text-green-300 mt-1">
							{selectedCustomHomeAddress.display_name}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Action Buttons -->
		<div class="flex gap-3 pt-4">
			<button
				on:click={handleClose}
				class="flex-1 px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
			>
				Cancel
			</button>
			<button
				on:click={handleGenerate}
				class="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center"
			>
				<Route class="w-4 h-4 mr-2 flex-shrink-0" />
				<span class="truncate">Generate Suggestions</span>
			</button>
		</div>
	</div>
</Modal>