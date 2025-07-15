<script lang="ts">
	import { Star, Search, Plus, X, MapPin, Heart, Globe, Filter, Trash2, Edit, Palette, Home, Utensils, Hotel, Camera, TreePine, Coffee, ShoppingBag, Umbrella, Building, Flag } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import type { Map as LeafletMap, LatLngExpression } from 'leaflet';
	import { debounce } from 'lodash-es';
	import { reverseGeocode } from '$lib/services/external/nominatim.service';
	import { toast } from 'svelte-sonner';

	let map: LeafletMap;
	let L: typeof import('leaflet');
	let mapContainer: HTMLDivElement;
	let currentTileLayer: any;
	let searchQuery = '';
	let selectedType = 'All';
	let markers: any[] = [];
	let showAddForm = false;
	let tempMarker: any = null;
	let isReverseGeocoding = false;

	// Form fields
	let title = '';
	let latitude = '';
	let longitude = '';
	let description = '';
	let address = '';
	let placeType = '';
	let searchResults: any[] = [];
	let showSearchResults = false;
	let isSearching = false;

	// Marker customization
	let selectedMarkerType = 'default';
	let selectedMarkerColor = '#3B82F6'; // blue-500
	let showMarkerOptions = false;

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
		'Beaches',
		'Cities',
		'Countries'
	];

	// Marker options
	const markerTypes = [
		{ id: 'default', name: 'Default', icon: MapPin, color: '#3B82F6' },
		{ id: 'home', name: 'Home', icon: Home, color: '#10B981' },
		{ id: 'restaurant', name: 'Restaurant', icon: Utensils, color: '#F59E0B' },
		{ id: 'hotel', name: 'Hotel', icon: Hotel, color: '#8B5CF6' },
		{ id: 'camera', name: 'Photo Spot', icon: Camera, color: '#EF4444' },
		{ id: 'tree', name: 'Nature', icon: TreePine, color: '#059669' },
		{ id: 'coffee', name: 'Cafe', icon: Coffee, color: '#D97706' },
		{ id: 'shopping', name: 'Shopping', icon: ShoppingBag, color: '#EC4899' },
		{ id: 'umbrella', name: 'Beach', icon: Umbrella, color: '#06B6D4' },
		{ id: 'building', name: 'City', icon: Building, color: '#6B7280' },
		{ id: 'flag', name: 'Country', icon: Flag, color: '#DC2626' }
	];

	const markerColors = [
		'#3B82F6', // blue
		'#10B981', // emerald
		'#F59E0B', // amber
		'#EF4444', // red
		'#8B5CF6', // violet
		'#EC4899', // pink
		'#06B6D4', // cyan
		'#059669', // green
		'#D97706', // orange
		'#DC2626', // red-600
		'#6B7280', // gray
		'#000000'  // black
	];

	interface Place {
		id: string;
		title: string;
		type: string;
		coordinates: string;
		description: string;
		address: string;
		isSelected?: boolean;
		favorite?: boolean;
		location?: string;
		created_at?: string;
		markerType?: string;
		markerColor?: string;
		labels?: string[];
	}

	// Mock data - replace with actual database integration
	let places: Place[] = [
		{
			id: '1',
			title: 'Colosseum',
			type: 'Landmarks',
			coordinates: '41.8902, 12.4922',
			description: 'Ancient Roman gladiatorial arena. Should book tickets in advance.',
			address: 'Piazza del Colosseo, 1, 00184 Roma RM, Italy',
			location: 'Rome, Italy',
			created_at: '2024-01-01',
			markerType: 'camera',
			markerColor: '#EF4444',
			labels: ['history', 'must-see']
		},
		{
			id: '2',
			title: 'Machu Picchu',
			type: 'Landmarks',
			coordinates: '-13.1631, -72.5450',
			description: 'Inca citadel set high in the Andes Mountains in Peru.',
			address: 'Machu Picchu, Peru',
			location: 'Machu Picchu, Peru',
			created_at: '2024-01-02',
			markerType: 'camera',
			markerColor: '#10B981',
			labels: ['adventure', 'bucket-list']
		}
	];

	// Add label state for the form
	let labelInput = '';
	let labels: string[] = [];

	function addLabel() {
		const trimmed = labelInput.trim();
		if (trimmed && !labels.includes(trimmed)) {
			labels = [...labels, trimmed];
		}
		labelInput = '';
	}

	function removeLabel(label: string) {
		labels = labels.filter(l => l !== label);
	}

	function resetForm() {
		title = '';
		latitude = '';
		longitude = '';
		description = '';
		address = '';
		placeType = 'Landmarks';
		selectedMarkerType = 'default';
		selectedMarkerColor = '#3B82F6';
		labels = [];
	}

	$: filteredPlaces = places.filter(
		(place) =>
			(selectedType === 'All' || place.type.toLowerCase() === selectedType.toLowerCase()) &&
			place.title.toLowerCase().includes(searchQuery.toLowerCase())
	);

	// Get marker icon based on type and color
	function getMarkerIcon(markerType: string = 'default', color: string = '#3B82F6') {
		if (!L) return null;

		const markerTypeData = markerTypes.find(m => m.id === markerType) || markerTypes[0];
		const IconComponent = markerTypeData.icon;

		return L.divIcon({
			className: 'custom-marker',
			html: `<div class="marker-content" style="color: ${color}">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					${getMarkerSVG(markerType)}
				</svg>
			</div>`,
			iconSize: [24, 24],
			iconAnchor: [12, 24]
		});
	}

	function getMarkerSVG(markerType: string) {
		switch (markerType) {
			case 'home':
				return '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/>';
			case 'restaurant':
				return '<path d="M16 6h2a2 2 0 0 1 2 2v7h-4V6a2 2 0 0 1 2-2h2"/><rect x="2" y="6" width="20" height="8" rx="1"/><path d="M6 14v7"/><path d="M10 14v7"/><path d="M14 14v7"/><path d="M18 14v7"/>';
			case 'hotel':
				return '<path d="M18 8V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2"/><path d="M6 8v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>';
			case 'camera':
				return '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>';
			case 'tree':
				return '<path d="M17 18a2 2 0 0 0-2 2c0 1.1-.9 2-2 2s-2-.9-2-2 2-4 2-4 2 2.9 2 4Z"/><path d="M12 2v20"/><path d="M2 12h20"/>';
			case 'coffee':
				return '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>';
			case 'shopping':
				return '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>';
			case 'umbrella':
				return '<path d="M22 12a10.06 10.06 1 0 0 0-20 0Z"/><path d="M12 12v6a2 2 0 0 0 4 0v-6"/>';
			case 'building':
				return '<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><rect x="9" y="9" width="1" height="1"/><rect x="14" y="9" width="1" height="1"/><rect x="9" y="14" width="1" height="1"/><rect x="14" y="14" width="1" height="1"/><rect x="9" y="19" width="1" height="1"/><rect x="14" y="19" width="1" height="1"/>';
			case 'flag':
				return '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>';
			default:
				return '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>';
		}
	}

	onMount(async () => {
		L = (await import('leaflet')).default;
		if (map) return;

		map = L.map(mapContainer, {
			center: [20, 0],
			zoom: 2,
			zoomControl: true,
			attributionControl: false,
			doubleClickZoom: false
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

		currentTileLayer = L.tileLayer(getTileLayerUrl(), {
			attribution: getAttribution()
		}).addTo(map);

		// Add markers for existing places
		updateMarkers();

		// Add click handler to map
		map.on('click', async (e: L.LeafletMouseEvent) => {
			const { lat, lng } = e.latlng;

			// Remove previous temporary marker
			if (tempMarker) {
				tempMarker.remove();
			}

			// Add new temporary marker
			tempMarker = L.marker([lat, lng], {
				icon: getMarkerIcon(selectedMarkerType, selectedMarkerColor)
			}).addTo(map);

			// Update form coordinates
			latitude = lat.toFixed(6);
			longitude = lng.toFixed(6);

			// Perform reverse geocoding
			await performReverseGeocoding(lat, lng);

			// Show the add form
			showAddForm = true;
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

	async function performReverseGeocoding(lat: number, lng: number) {
		isReverseGeocoding = true;
		try {
			const result = await reverseGeocode(lat, lng);

			// Extract place name from display_name
			const displayName = result.display_name;
			const nameParts = displayName.split(',');
			const primaryName = nameParts[0].trim();

			// Determine place type based on address components
			let type = 'Landmarks';
			let markerType = 'default';
			if (result.address) {
				if (result.address.restaurant || result.address.cafe) {
					type = 'Restaurants';
					markerType = result.address.cafe ? 'coffee' : 'restaurant';
				}
				else if (result.address.hotel || result.address.hostel) {
					type = 'Hotels';
					markerType = 'hotel';
				}
				else if (result.address.museum) {
					type = 'Museums';
					markerType = 'camera';
				}
				else if (result.address.park) {
					type = 'Parks';
					markerType = 'tree';
				}
				else if (result.address.shop || result.address.store) {
					type = 'Shops';
					markerType = 'shopping';
				}
				else if (result.address.beach) {
					type = 'Beaches';
					markerType = 'umbrella';
				}
				else if (result.address.city) {
					type = 'Cities';
					markerType = 'building';
				}
				else if (result.address.country) {
					type = 'Countries';
					markerType = 'flag';
				}
			}

			title = primaryName;
			address = displayName;
			placeType = type;
			selectedMarkerType = markerType;
			description = `Added from map at ${new Date().toLocaleDateString()}`;

		} catch (error) {
			console.error('Reverse geocoding failed:', error);
			title = `Location at ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
			address = `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
			placeType = 'Landmarks';
			selectedMarkerType = 'default';
			description = 'Location added from map';
		} finally {
			isReverseGeocoding = false;
		}
	}

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
			const markerIcon = getMarkerIcon(place.markerType || 'default', place.markerColor || '#3B82F6');
			return L.marker([lat, lng] as [number, number], { icon: markerIcon })
				.bindPopup(createPopupContent(place))
				.addTo(map);
		});

		if (coordinates.length > 0) {
			const bounds = L.latLngBounds(coordinates);
			map.fitBounds(bounds, { padding: [50, 50] });
		} else {
			map.setView([0, 0], 2);
		}
	}

	function createPopupContent(place: Place) {
		return `
			<div class="p-2">
				<h3 class="font-semibold text-sm">${place.title}</h3>
				<p class="text-xs text-gray-600">${place.type}</p>
				<p class="text-xs text-gray-500 mt-1">${place.address}</p>
			</div>
		`;
	}

	const searchPlaces = debounce(async () => {
		if (!title || title.length < 3) {
			searchResults = [];
			showSearchResults = false;
			return;
		}

		isSearching = true;
		try {
			const response = await fetch(
				`https://nominatim.int.hazen.nu/search?format=json&q=${encodeURIComponent(title)}&limit=5&addressdetails=1`
			);
			const data = await response.json();
			searchResults = data.map((result: any) => ({
				name: result.display_name,
				lat: result.lat,
				lon: result.lon,
				address: result.address || {}
			}));
			showSearchResults = true;
		} catch (error) {
			console.error('Error searching places:', error);
			searchResults = [];
			showSearchResults = false;
		} finally {
			isSearching = false;
		}
	}, 300);

	function handleNameInput() {
		searchPlaces();
	}

	function selectPlace(result: any) {
		title = result.name.split(',')[0];
		latitude = result.lat;
		longitude = result.lon;
		address = result.name;

		// Determine place type and marker
		let type = 'Landmarks';
		let markerType = 'default';
		if (result.address) {
			if (result.address.restaurant || result.address.cafe) {
				type = 'Restaurants';
				markerType = result.address.cafe ? 'coffee' : 'restaurant';
			}
			else if (result.address.hotel || result.address.hostel) {
				type = 'Hotels';
				markerType = 'hotel';
			}
			else if (result.address.museum) {
				type = 'Museums';
				markerType = 'camera';
			}
			else if (result.address.park) {
				type = 'Parks';
				markerType = 'tree';
			}
			else if (result.address.shop || result.address.store) {
				type = 'Shops';
				markerType = 'shopping';
			}
			else if (result.address.beach) {
				type = 'Beaches';
				markerType = 'umbrella';
			}
			else if (result.address.city) {
				type = 'Cities';
				markerType = 'building';
			}
			else if (result.address.country) {
				type = 'Countries';
				markerType = 'flag';
			}
		}
		placeType = type;
		selectedMarkerType = markerType;

		description = `Added via search on ${new Date().toLocaleDateString()}`;
		showSearchResults = false;

		// Update map view and add marker
		if (map) {
			map.setView([result.lat, result.lon], 15);
			if (tempMarker) tempMarker.remove();
			tempMarker = L.marker([result.lat, result.lon], {
				icon: getMarkerIcon(selectedMarkerType, selectedMarkerColor)
			}).addTo(map);
		}
	}

	function selectType(type: string) {
		selectedType = type;
		updateMarkers();
	}

	function toggleAddForm() {
		showAddForm = !showAddForm;
		if (!showAddForm && tempMarker) {
			tempMarker.remove();
			tempMarker = null;
		}
	}

	function addPlace() {
		if (!title || !latitude || !longitude) {
			toast.error('Please fill in all required fields');
			return;
		}

		const newPlace: Place = {
			id: Date.now().toString(),
			title,
			type: placeType,
			coordinates: `${latitude}, ${longitude}`,
			description,
			address,
			location: address.split(',').slice(-2).join(',').trim(),
			created_at: new Date().toISOString(),
			markerType: selectedMarkerType,
			markerColor: selectedMarkerColor,
			labels: [...labels]
		};

		places = [...places, newPlace];

		resetForm();

		// Remove temp marker and close form
		if (tempMarker) {
			tempMarker.remove();
			tempMarker = null;
		}
		showAddForm = false;

		// Update markers
		updateMarkers();

		toast.success('Place added to your list!');
	}

	function deletePlace(placeId: string) {
		places = places.filter(p => p.id !== placeId);
		updateMarkers();
		toast.success('Place removed from your list');
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
	<style>
		.temp-marker {
			background: transparent !important;
			border: none !important;
		}

		.custom-marker {
			background: transparent !important;
			border: none !important;
		}

		.marker-content {
			filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
		}

		.marker-preview {
			width: 32px;
			height: 32px;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 50%;
			background: white;
			border: 2px solid #e5e7eb;
			box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		}

		.color-option {
			width: 24px;
			height: 24px;
			border-radius: 50%;
			border: 2px solid transparent;
			cursor: pointer;
			transition: all 0.2s;
		}

		.color-option:hover {
			transform: scale(1.1);
		}

		.color-option.selected {
			border-color: #000;
			transform: scale(1.2);
		}
	</style>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div class="flex items-center gap-3">
			<Heart class="h-8 w-8 text-red-500" />
			<h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">Want to Visit</h1>
		</div>
		<button
			class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
			on:click={() => {
				console.log('Button clicked, showAddForm before:', showAddForm);
				showAddForm = true;
				console.log('showAddForm after:', showAddForm);
				// Clear form data when opening
				title = '';
				latitude = '';
				longitude = '';
				description = '';
				address = '';
				placeType = 'Landmarks';
				searchResults = [];
				showSearchResults = false;
				labels = []; // Clear labels when opening
				labelInput = ''; // Clear input when opening
			}}
		>
			<Plus class="h-4 w-4" />
			Add Place
		</button>
	</div>

	<!-- Map -->
	<div class="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
		<div
			bind:this={mapContainer}
			class="h-96 w-full md:h-[500px]"
		></div>

		<!-- Map Instructions -->
		{#if !showAddForm}
			<div class="absolute top-4 left-4 z-10 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg p-3 shadow-lg">
				<div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
					<MapPin class="h-4 w-4" />
					Click on the map to add a place
				</div>
			</div>
		{/if}
	</div>

	<!-- Simple Modal Overlay -->
	{#if showAddForm}
		<div class="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
			<div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md relative z-[10000] max-h-[90vh] overflow-y-auto">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">Add New Place</h3>
					<button
						on:click={() => {
							showAddForm = false;
							if (tempMarker) {
								tempMarker.remove();
								tempMarker = null;
							}
						}}
						class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300 transition-colors"
					>
						<X class="h-5 w-5" />
					</button>
				</div>

				<!-- Full form with proper z-index -->
				<div class="space-y-4">
					<!-- Title Input (required) -->
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title <span class="text-red-500">*</span></label>
						<input
							type="text"
							bind:value={title}
							class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
							placeholder="Give this place a title"
							required
						/>
					</div>

					<!-- Remove name/search input -->
					<!-- Search Input -->
					<div>
						<label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
							Search for a place
						</label>
						<div class="relative">
							<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
							<input
								type="text"
								id="name"
								bind:value={title}
								on:input={handleNameInput}
								class="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white relative z-[10001]"
								placeholder="Search for places..."
							/>
							{#if isSearching}
								<div class="absolute right-3 top-1/2 -translate-y-1/2">
									<div class="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
								</div>
							{/if}
						</div>

						<!-- Search Results -->
						{#if showSearchResults && searchResults.length > 0}
							<div class="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg relative z-[10002]">
								{#each searchResults as result}
									<button
										type="button"
										class="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-600 border-b border-gray-100 dark:border-gray-600 last:border-b-0 transition-colors"
										on:click={() => selectPlace(result)}
									>
										<div class="text-sm font-medium text-gray-900 dark:text-gray-100">
											{result.name.split(',')[0]}
										</div>
										<div class="text-xs text-gray-500 dark:text-gray-400 truncate">
											{result.name}
										</div>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Coordinates Display -->
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Latitude</label>
							<input
								type="text"
								bind:value={latitude}
								readonly
								class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300"
							/>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Longitude</label>
							<input
								type="text"
								bind:value={longitude}
								readonly
								class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300"
							/>
						</div>
					</div>

					<!-- Address Display -->
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
						<div class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 min-h-[2.5rem] flex items-center">
							{#if isReverseGeocoding}
								<div class="flex items-center gap-2 text-gray-500">
									<div class="animate-spin rounded-full h-3 w-3 border border-gray-400 border-t-transparent"></div>
									Looking up address...
								</div>
							{:else}
								{address || 'Click on map or search for a place'}
							{/if}
						</div>
					</div>

					<!-- Type Selection via Icons -->
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
						<div class="flex flex-wrap gap-2">
							{#each markerTypes as marker}
								<button
									type="button"
									on:click={() => { placeType = marker.name; selectedMarkerType = marker.id; }}
									class="flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg border transition-colors {placeType === marker.name ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600'}"
								>
									<marker.icon class="h-5 w-5" />
									<span class="text-xs">{marker.name}</span>
								</button>
							{/each}
						</div>
					</div>

					<!-- Marker Color -->
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Marker Color</label>
						<div class="flex flex-wrap gap-1">
							{#each markerColors as color}
								<button
									type="button"
									on:click={() => selectedMarkerColor = color}
									class="color-option {selectedMarkerColor === color ? 'selected' : ''}"
									style="background-color: {color}"
								></button>
							{/each}
						</div>
					</div>

					<!-- Custom Labels -->
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Labels</label>
						<div class="flex gap-2 mb-2 flex-wrap">
							{#each labels as label}
								<span class="inline-flex items-center px-2 py-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full mr-1 mb-1">
									{label}
									<button type="button" class="ml-1 text-blue-500 hover:text-red-500" on:click={() => removeLabel(label)}>
										<X class="h-3 w-3" />
									</button>
								</span>
							{/each}
						</div>
						<div class="flex gap-2">
							<input
								type="text"
								bind:value={labelInput}
								class="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
								placeholder="Add a label and press Enter"
								on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }}
							/>
							<button type="button" class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors" on:click={addLabel}>
								Add
							</button>
						</div>
					</div>

					<!-- Description -->
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
						<textarea
							bind:value={description}
							rows="3"
							class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none relative z-[10001]"
							placeholder="Why do you want to visit this place?"
						></textarea>
					</div>

					<!-- Action Buttons -->
					<div class="flex gap-3 pt-2">
						<button
							type="button"
							on:click={() => {
								showAddForm = false;
								if (tempMarker) {
									tempMarker.remove();
									tempMarker = null;
								}
							}}
							class="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
						>
							Cancel
						</button>
						<button
							type="button"
							on:click={addPlace}
							class="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
						>
							Add to List
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Filters and Search -->
	<div class="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
		<!-- Type Filter -->
		<div class="flex flex-wrap gap-2">
			{#each types as type}
				<button
					class="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors {selectedType === type
						? 'bg-blue-600 text-white'
						: 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
					on:click={() => selectType(type)}
				>
					{type}
				</button>
			{/each}
		</div>

		<!-- Search -->
		<div class="relative w-full sm:w-64">
			<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search your places..."
				class="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
			/>
		</div>
	</div>

	<!-- Places List -->
	{#if filteredPlaces.length === 0}
		<div class="text-center py-12">
			<Globe class="mx-auto h-12 w-12 text-gray-400 mb-4" />
			<h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No places found</h3>
			<p class="text-gray-500 dark:text-gray-400">
				{searchQuery || selectedType !== 'All'
					? 'Try adjusting your search or filters'
					: 'Start by adding some places you want to visit!'}
			</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{#each filteredPlaces as place}
				<div class="group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-all duration-200">
					<!-- Favorite Button -->
					<button
						on:click={() => toggleFavorite(place)}
						class="absolute top-4 right-4 p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
					>
						<Heart class="h-5 w-5 {place.favorite ? 'fill-red-500 text-red-500' : ''}" />
					</button>

					<!-- Place Info -->
					<div class="mb-4">
						<div class="text-base font-bold text-blue-700 dark:text-blue-300 mb-1">{place.title}</div>
						<div class="flex items-start justify-between mb-2">
							<!-- Remove name display -->
						</div>
						<div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
							<MapPin class="h-4 w-4" />
							{place.location || place.address}
						</div>
						<span class="inline-block px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full">
							{place.type}
						</span>
						<!-- Labels -->
						{#if place.labels && place.labels.length > 0}
							<div class="flex flex-wrap gap-1 mt-2">
								{#each place.labels as label}
									<span class="inline-flex items-center px-2 py-1 text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200 rounded-full">
										{label}
									</span>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Description -->
					{#if place.description}
						<div class="mb-4">
							<p class="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
								{place.description}
							</p>
						</div>
					{/if}

					<!-- Coordinates -->
					<div class="text-xs text-gray-500 dark:text-gray-400 mb-4">
						{place.coordinates}
					</div>

					<!-- Action Buttons -->
					<div class="flex gap-2">
						<button
							on:click={() => {
								const [lat, lng] = place.coordinates.split(',').map(Number);
								map.setView([lat, lng], 15);
							}}
							class="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
						>
							<MapPin class="h-4 w-4" />
							Show on Map
						</button>
						<button
							on:click={() => deletePlace(place.id)}
							class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
						>
							<Trash2 class="h-4 w-4" />
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
