<script lang="ts">
	import { Star, Search, ChevronDown, Plus, Heart, X } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import type { Map as LeafletMap, LatLngExpression } from 'leaflet';
	import { debounce } from 'lodash-es';

	let map: LeafletMap;
	let L: typeof import('leaflet');
	let mapContainer: HTMLDivElement;
	let currentTileLayer: any;
	let searchQuery = '';
	let selectedType = 'All';
	let markers: any[] = [];
	let showAddForm = false;
	let tempMarker: any = null;

	// Form fields
	let name = '';
	let latitude = '';
	let longitude = '';
	let description = '';
	let searchResults: any[] = [];
	let showSearchResults = false;

	const types = [
		'All',
		'Landmarks',
		'Nature',
		'Restaurants',
		'Hotels',
		'Museums',
		'Parks',
		'Cafes',
		'Shops',
		'Beaches'
	];

	interface Place {
		id: string;
		name: string;
		type: string;
		coordinates: string;
		description: string;
		isSelected?: boolean;
		favorite?: boolean;
		location?: string;
	}

	const places: Place[] = [
		{
			id: '1',
			name: 'Colosseum',
			type: 'Landmark',
			coordinates: '41.8902, 12.4922',
			description: 'Ancient Roman gladiatorial arena. Should book tickets in advance.',
			location: 'Rome, Italy'
		},
		{
			id: '2',
			name: 'Machu Picchu',
			type: 'Landmark',
			coordinates: '-13.1631, -72.5450',
			description: 'Inca citadel set high in the Andes Mountains in Peru.',
			location: 'Machu Picchu, Peru'
		}
	];

	$: filteredPlaces = places.filter(
		(place) =>
			(selectedType === 'All' || place.type.toLowerCase() === selectedType.toLowerCase()) &&
			place.name.toLowerCase().includes(searchQuery.toLowerCase())
	);

	onMount(async () => {
		L = (await import('leaflet')).default;
		if (map) return;
		map = L.map(mapContainer, {
			zoomControl: true,
			attributionControl: false
		});

		function getTileLayerUrl() {
			const isDark = document.documentElement.classList.contains('dark');
			return isDark
				? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
				: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
		}

		function getAttribution() {
			const isDark = document.documentElement.classList.contains('dark');
			return isDark
				? '&copy; <a href="https://carto.com/attributions">CARTO</a>'
				: '© OpenStreetMap contributors';
		}

		L.tileLayer(getTileLayerUrl(), {
			attribution: getAttribution()
		}).addTo(map);

		// Add markers for each place
		updateMarkers();

		// Add click handler to map
		map.on('click', (e: L.LeafletMouseEvent) => {
			const { lat, lng } = e.latlng;

			// Always add a temporary marker when clicking
			if (tempMarker) {
				tempMarker.remove();
			}
			tempMarker = L.marker([lat, lng]).addTo(map);

			// If form is open, update the form coordinates
			if (showAddForm) {
				latitude = lat.toFixed(6);
				longitude = lng.toFixed(6);
				map.setView([lat, lng], 13);
			}
		});

		// Listen for theme changes
		const observer = new MutationObserver(() => {
			const isDark = document.documentElement.classList.contains('dark');
			const newUrl = getTileLayerUrl();
			const newAttribution = getAttribution();
			if (currentTileLayer && currentTileLayer._url !== newUrl) {
				map.removeLayer(currentTileLayer);
				currentTileLayer = L.tileLayer(newUrl, { attribution: newAttribution }).addTo(map);
			}
		});
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
	});

	function updateMarkers() {
		// Clear existing markers
		markers.forEach((marker) => marker.remove());
		markers = [];

		// Add markers for filtered places
		const coordinates: LatLngExpression[] = filteredPlaces.map((place) => {
			const [lat, lng] = place.coordinates.split(',').map(Number);
			return [lat, lng] as [number, number];
		});

		markers = filteredPlaces.map((place, i) => {
			const [lat, lng] = place.coordinates.split(',').map(Number);
			return L.marker([lat, lng] as [number, number])
				.bindPopup(place.name)
				.addTo(map);
		});

		if (coordinates.length > 0) {
			const bounds = L.latLngBounds(coordinates);
			map.fitBounds(bounds, { padding: [50, 50] });
		} else {
			map.setView([0, 0], 2);
		}
	}

	const searchPlaces = debounce(async () => {
		if (!name || name.length < 3) {
			searchResults = [];
			showSearchResults = false;
			return;
		}

		try {
			const response = await fetch(
				`https://nominatim.int.hazen.nu/search?format=json&q=${encodeURIComponent(name)}`
			);
			const data = await response.json();
			searchResults = data.slice(0, 5).map((result: any) => ({
				name: result.display_name,
				lat: result.lat,
				lon: result.lon
			}));
			showSearchResults = true;
		} catch (error) {
			console.error('Error searching places:', error);
			searchResults = [];
			showSearchResults = false;
		}
	}, 300);

	function selectPlace(result: any) {
		name = result.name.split(',')[0];
		latitude = result.lat;
		longitude = result.lon;
		description = result.name;
		showSearchResults = false;

		if (map) {
			map.setView([result.lat, result.lon], 15);
			L.marker([result.lat, result.lon]).addTo(map);
		}
	}

	function handleNameInput() {
		searchPlaces();
	}

	function selectType(type: string) {
		selectedType = type;
		updateMarkers();
	}

	function toggleAddForm() {
		showAddForm = !showAddForm;
		// Don't remove tempMarker when closing form - let it stay on the map
	}

	function toggleFavorite(place: Place) {
		place.favorite = !place.favorite;
		updateMarkers();
	}
</script>

<svelte:head>
	<link
		rel="stylesheet"
		href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
		integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
		crossorigin=""
	/>
</svelte:head>

<div>
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<Star class="h-8 w-8 text-blue-600 dark:text-gray-400" />
				<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Want to Visit</h1>
			</div>
			{#if !showAddForm}
				<button
					class="flex cursor-pointer items-center gap-2 rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90"
					on:click={() => (showAddForm = !showAddForm)}
					type="button"
				>
					{showAddForm ? 'Cancel' : 'Add destination'}
				</button>
			{/if}
		</div>
	</div>

	<!-- Map -->
	<div class="mb-8 overflow-hidden rounded-xl border border-[rgb(218,218,221)] dark:border-transparent bg-white dark:bg-[#23232a]">
		<div
			bind:this={mapContainer}
			class="relative h-[400px] w-full"
			style="z-index: 10;"
		></div>
		{#if showAddForm}
			<div
				class="absolute bottom-4 right-4 z-20 w-96 rounded-xl border border-[rgb(218,218,221)] bg-white dark:bg-[#2d2d35] p-8 shadow-2xl"
			>
				<div class="flex items-center justify-between mb-6">
					<h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">Add New Destination</h3>
					<button
						on:click={() => (showAddForm = false)}
						class="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer"
					>
						<X class="h-5 w-5" />
					</button>
				</div>
				<form on:submit|preventDefault={() => {}}>
					<div class="space-y-6">
						<div>
							<label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
							<input
								type="text"
								id="name"
								bind:value={name}
								on:input={handleNameInput}
								class="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
								placeholder="e.g., Eiffel Tower"
							/>
							{#if showSearchResults}
								<ul class="mt-2 w-full rounded-lg border border-gray-300 bg-white shadow-lg max-h-40 overflow-y-auto">
									{#each searchResults as result}
										<li>
											<button
												type="button"
												class="w-full text-left cursor-pointer p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
												on:click={() => selectPlace(result)}
												on:keydown={(e) => e.key === 'Enter' && selectPlace(result)}
											>
												<div class="text-sm text-gray-900">{result.name.split(',')[0]}</div>
												<div class="text-xs text-gray-500">{result.name}</div>
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
						<div class="grid grid-cols-2 gap-4">
							<div>
								<label for="latitude" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Latitude</label>
								<input
									type="text"
									id="latitude"
									bind:value={latitude}
									class="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
									placeholder="e.g., 48.8584"
								/>
							</div>
							<div>
								<label for="longitude" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Longitude</label>
								<input
									type="text"
									id="longitude"
									bind:value={longitude}
									class="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
									placeholder="e.g., 2.2945"
								/>
							</div>
						</div>
						<div>
							<label for="description" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
							<textarea
								id="description"
								bind:value={description}
								rows="4"
								class="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-white resize-none"
								placeholder="Notes about why you want to visit this destination..."
							></textarea>
						</div>
						<div class="flex gap-3 pt-2">
							<button
								type="button"
								on:click={() => (showAddForm = false)}
								class="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
							>
								Cancel
							</button>
							<button
								type="submit"
								class="flex-1 rounded-lg bg-[rgb(37,140,244)] px-4 py-3 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90 transition-colors"
							>
								Add to List
							</button>
						</div>
					</div>
				</form>
			</div>
		{/if}
	</div>

	<!-- Filters and Search -->
	<div class="mb-6 flex flex-wrap items-center gap-2">
		{#each types as type}
			<button
				class="cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors {selectedType ===
				type
					? 'bg-[rgb(37,140,244)] text-white'
					: 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
				on:click={() => selectType(type)}
			>
				{type}
			</button>
		{/each}
		<div class="relative ml-auto w-64">
			<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search places..."
				class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 pl-10 pr-4 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
			/>
		</div>
	</div>

	<!-- Places List -->
	<div class="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
		{#each filteredPlaces as place}
			<div
				class="group relative overflow-hidden rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
			>
				<div class="flex items-center justify-between">
					<div class="min-w-0 flex-1">
						<h3 class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{place.name}</h3>
						<p class="truncate text-sm text-gray-500 dark:text-gray-300">{place.location}</p>
					</div>
				</div>
				<div class="mb-4">
					<div class="mb-1 text-xs text-gray-500 dark:text-gray-400">Coordinates</div>
					<div class="text-sm text-gray-700 dark:text-gray-200">{place.coordinates}</div>
				</div>
				<div>
					<div class="mb-1 text-xs text-gray-500 dark:text-gray-400">Description</div>
					<div class="text-sm text-gray-700 dark:text-gray-200">{place.description}</div>
				</div>
				<label class="absolute right-4 top-4">
					<input type="checkbox" bind:checked={place.isSelected} class="peer sr-only" />
					<div
						class="rounded-md border border-[rgb(218,218,221)] p-1 text-gray-400 transition-colors hover:bg-gray-50 peer-checked:border-[rgb(37,140,244)] peer-checked:text-[rgb(37,140,244)]"
					>
						<Star class="h-4 w-4" />
					</div>
				</label>
			</div>
		{/each}
	</div>
</div>
