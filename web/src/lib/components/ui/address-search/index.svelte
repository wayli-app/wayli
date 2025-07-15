<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { MapPin } from 'lucide-svelte';

	export let value = '';
	export let placeholder = 'Enter address...';
	export let label = 'Address';
	export let disabled = false;
	export let required = false;
	export let showCoordinates = true;

	const dispatch = createEventDispatcher();

	let inputElement: HTMLInputElement | undefined;
	let isSearching = false;
	let suggestions: any[] = [];
	let showSuggestions = false;
	let selectedIndex = -1;
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;
	let searchError: string | null = null;
	let selectedAddress: any | null = null;

	$: if (value !== inputValue) {
		inputValue = value;
	}

	let inputValue = value;

	async function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		inputValue = target.value;
		value = target.value;
		selectedIndex = -1;
		selectedAddress = null;

		if (searchTimeout) clearTimeout(searchTimeout);

		if (!inputValue.trim()) {
			suggestions = [];
			showSuggestions = false;
			searchError = null;
			return;
		}

		searchTimeout = setTimeout(() => searchAddresses(), 300);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!showSuggestions || suggestions.length === 0) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
				selectAddress(suggestions[selectedIndex]);
			}
		} else if (event.key === 'Escape') {
			showSuggestions = false;
			selectedIndex = -1;
		}
	}

	async function searchAddresses() {
		if (!inputValue.trim() || inputValue.trim().length < 3) {
			suggestions = [];
			showSuggestions = false;
			searchError = null;
			return;
		}

		try {
			isSearching = true;
			showSuggestions = true;
			searchError = null;

			const response = await fetch(`/api/v1/geocode/search?q=${encodeURIComponent(inputValue.trim())}`);

			if (response.ok) {
				const data = await response.json();
				// Handle both old format (data.data as array) and new format (data.data.results as array)
				suggestions = data.data?.results || data.data || [];
				showSuggestions = true;

				if (suggestions.length === 0) {
					searchError = 'No addresses found';
				}
			} else {
				suggestions = [];
				searchError = 'No addresses found';
				showSuggestions = true;
			}
		} catch (error) {
			console.error('Error searching for address:', error);
			suggestions = [];
			searchError = 'Failed to search for address';
			showSuggestions = true;
		} finally {
			isSearching = false;
		}
	}

	function selectAddress(address: any) {
		inputValue = address.display_name;
		value = address.display_name;
		selectedAddress = address;
		showSuggestions = false;
		selectedIndex = -1;

		dispatch('select', { address, displayName: address.display_name });
	}

	function clearAddress() {
		inputValue = '';
		value = '';
		selectedAddress = null;
		suggestions = [];
		showSuggestions = false;
		searchError = null;
		selectedIndex = -1;

		dispatch('clear');
	}
</script>

<div class="relative">
	<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
		{label}
		{#if required}
			<span class="text-red-500">*</span>
		{/if}
	</label>

	<input
		type="text"
		bind:this={inputElement}
		bind:value={inputValue}
		{placeholder}
		{disabled}
		{required}
		on:input={handleInput}
		on:keydown={handleKeydown}
		class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
	/>

	<!-- Loading Spinner -->
	{#if isSearching}
		<div class="absolute right-3 inset-y-0 flex items-center pointer-events-none">
			<div class="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
		</div>
	{/if}

	<!-- Suggestions Dropdown -->
	{#if showSuggestions}
		<div class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
			{#if suggestions.length > 0}
				{#each suggestions as suggestion, index}
					<button
						type="button"
						class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 focus:outline-none {selectedIndex === index ? 'bg-gray-100 dark:bg-gray-700' : ''}"
						on:click={() => selectAddress(suggestion)}
					>
						<div class="text-sm text-gray-900 dark:text-gray-100">{suggestion.display_name}</div>
						{#if suggestion.coordinates}
							<div class="text-xs text-gray-500 dark:text-gray-400">
								{suggestion.coordinates.lat.toFixed(4)}, {suggestion.coordinates.lng.toFixed(4)}
							</div>
						{/if}
					</button>
				{/each}
			{:else if searchError}
				<div class="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
					{searchError}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Selected Address Display -->
	{#if selectedAddress && selectedAddress.coordinates && showCoordinates}
		<div class="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
			<div class="text-sm text-green-800 dark:text-green-200">
				📍 Coordinates: {selectedAddress.coordinates.lat.toFixed(6)}, {selectedAddress.coordinates.lng.toFixed(6)}
			</div>
			<div class="text-xs text-green-600 dark:text-green-300 mt-1">
				{selectedAddress.display_name}
			</div>
		</div>
	{/if}
</div>