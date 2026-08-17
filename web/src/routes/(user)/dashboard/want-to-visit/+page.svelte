<script lang="ts">
	import { browser } from '$app/environment';
	import { Skeleton } from '$lib/components/ui';

	import type { Map as LeafletMap } from 'leaflet';
	import { watchMapTheme, TILE_URLS } from '$lib/utils/map-theme';

	import { debounce } from '$lib/utils';
	import {
		Search,
		Plus,
		X,
		MapPin,
		Heart,
		Globe2,
		Trash2,
		Edit,
		Home,
		Utensils,
		Building2,
		Camera,
		TreePine,
		Coffee,
		ShoppingBag,
		Umbrella,
		BedDouble,
		Flag
	} from 'lucide-svelte';
	import { onMount } from 'svelte';

	import { reverseGeocode, forwardGeocode } from '$lib/services/external/pelias.service';

	import { toast } from 'svelte-sonner';

	import { translate } from '$lib/i18n';

	// Use the reactive translation function
	let t = $derived($translate);
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { WantToVisitService } from '$lib/services/want-to-visit.service';
	import { fluxbase } from '$lib/fluxbase';
	import { aiDrawer, type PlanSuggestion } from '$lib/stores/ai-drawer';

	import type { UserProfile } from '$lib/types/user.types';
	import type { Place } from '$lib/types/want-to-visit.types';

	// Lucide icon mapping for SVG URLs
	const lucideIcons = {
		default: 'map-pin',
		home: 'home',
		restaurant: 'utensils',
		hotel: 'bed-double',
		camera: 'camera',
		tree: 'tree-pine',
		coffee: 'coffee',
		shopping: 'shopping-bag',
		umbrella: 'umbrella-off', // Beach/umbrella icon
		building: 'building-2',
		flag: 'flag'
	};

	let map: LeafletMap;
	let L: typeof import('leaflet');
	let mapContainer: HTMLDivElement;
	let cleanupThemeWatcher: (() => void) | null = null;
	let searchQuery = $state(''); // Search query for filtering places on the page
	let modalSearchQuery = $state(''); // Search query inside the add/edit modal
	let markerClusterGroup = $state<any>(null); // Add cluster group variable
	let showAddForm = $state(false);
	let mapExpanded = $state(true);
	let sortBy = $state<'title' | 'type' | 'date' | 'rating'>('date');
	let groupBy = $state<'none' | 'city' | 'country' | 'type'>('none');
	let showEditForm = $state(false);
	let tempMarker = $state<any>(null);
	let isReverseGeocoding = $state(false);
	let isLoading = $state(true);

	// Form fields
	let title = $state('');
	let latitude = $state('');
	let longitude = $state('');
	let description = $state('');
	let address = $state('');
	let placeType = $state('');
	let searchResults = $state<any[]>([]);
	let showSearchResults = $state(false);
	let isSearching = $state(false);

	// Marker customization
	let selectedMarkerType = $state('default');
	let selectedMarkerColor = $state('#22335F'); // primary rgb(34,51,95)

	// Edit mode
	let editingPlace = $state<Place | null>(null);

	// Auto-focus modal overlay when opened for keyboard events
	$effect(() => {
		if (showAddForm || showEditForm) {
			// Focus the modal overlay after a brief delay to ensure DOM is ready
			setTimeout(() => {
				const modalOverlay = document.querySelector('.modal-overlay');
				if (modalOverlay instanceof HTMLElement) {
					modalOverlay.focus();
				}
			}, 0);
		}
	});

	// Marker options - updated to use translation keys
	let markerTypes = $derived([
		{
			id: 'default',
			name: t('wantToVisit.markerTypes.default'),
			icon: MapPin,
			iconName: 'default',
			color: '#3B82F6'
		},
		{
			id: 'home',
			name: t('wantToVisit.markerTypes.home'),
			icon: Home,
			iconName: 'home',
			color: '#10B981'
		},
		{
			id: 'restaurant',
			name: t('wantToVisit.markerTypes.restaurant'),
			icon: Utensils,
			iconName: 'restaurant',
			color: '#F59E0B'
		},
		{
			id: 'hotel',
			name: t('wantToVisit.markerTypes.hotel'),
			icon: BedDouble,
			iconName: 'hotel',
			color: '#8B5CF6'
		},
		{
			id: 'camera',
			name: t('wantToVisit.markerTypes.camera'),
			icon: Camera,
			iconName: 'camera',
			color: '#EF4444'
		},
		{
			id: 'tree',
			name: t('wantToVisit.markerTypes.tree'),
			icon: TreePine,
			iconName: 'tree',
			color: '#059669'
		},
		{
			id: 'coffee',
			name: t('wantToVisit.markerTypes.coffee'),
			icon: Coffee,
			iconName: 'coffee',
			color: '#D97706'
		},
		{
			id: 'shopping',
			name: t('wantToVisit.markerTypes.shopping'),
			icon: ShoppingBag,
			iconName: 'shopping',
			color: '#EC4899'
		},
		{
			id: 'umbrella',
			name: t('wantToVisit.markerTypes.umbrella'),
			icon: Umbrella,
			iconName: 'umbrella',
			color: '#06B6D4'
		},
		{
			id: 'building',
			name: t('wantToVisit.markerTypes.building'),
			icon: Building2,
			iconName: 'building',
			color: '#6B7280'
		},
		{
			id: 'flag',
			name: t('wantToVisit.markerTypes.flag'),
			icon: Flag,
			iconName: 'flag',
			color: '#DC2626'
		}
	]);

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
		'#000000' // black
	];

	// Database data
	let places = $state<Place[]>([]);

	// Add label state for the form
	let labelInput = $state('');
	let labels = $state<string[]>([]);

	// Search and filter state
	let selectedTypes = $state<string[]>(['All']); // Array to support multiple selections
	let showFavouritedOnly = $state(false); // Filter for favourited places only

	// Pagination
	const PLACES_PER_PAGE = 24;
	let visiblePlacesCount = $state(PLACES_PER_PAGE);

	// User profile and loading states
	let userProfile = $state<UserProfile | null>(null);
	let hasHomeAddress = $state(false);
	let isLoadingProfile = $state(false);

	// Map markers
	let markers = $state<any[]>([]);

	// Available types based on marker types - using translation keys
	let availableTypes = $derived([
		{ id: 'All', name: t('wantToVisit.markerTypes.all'), icon: MapPin },
		{ id: 'default', name: t('wantToVisit.markerTypes.default'), icon: MapPin },
		{ id: 'home', name: t('wantToVisit.markerTypes.home'), icon: Home },
		{ id: 'restaurant', name: t('wantToVisit.markerTypes.restaurant'), icon: Utensils },
		{ id: 'hotel', name: t('wantToVisit.markerTypes.hotel'), icon: BedDouble },
		{ id: 'camera', name: t('wantToVisit.markerTypes.camera'), icon: Camera },
		{ id: 'tree', name: t('wantToVisit.markerTypes.tree'), icon: TreePine },
		{ id: 'coffee', name: t('wantToVisit.markerTypes.coffee'), icon: Coffee },
		{ id: 'shopping', name: t('wantToVisit.markerTypes.shopping'), icon: ShoppingBag },
		{ id: 'umbrella', name: t('wantToVisit.markerTypes.umbrella'), icon: Umbrella },
		{ id: 'building', name: t('wantToVisit.markerTypes.building'), icon: Building2 },
		{ id: 'flag', name: t('wantToVisit.markerTypes.flag'), icon: Flag }
	]);

	// Helper function to get translated marker type name
	function getMarkerTypeName(markerId: string): string {
		const markerType = markerTypes.find((m) => m.id === markerId);
		return markerType ? markerType.name : t('wantToVisit.markerTypes.default');
	}

	function addLabel() {
		const trimmed = labelInput.trim();
		if (trimmed && !labels.includes(trimmed)) {
			labels = [...labels, trimmed];
		}
		labelInput = '';
	}

	function removeLabel(label: string) {
		labels = labels.filter((l) => l !== label);
	}

	function resetForm() {
		title = '';
		latitude = '';
		longitude = '';
		description = '';
		address = '';
		placeType = 'default'; // Use marker ID instead of hardcoded string
		selectedMarkerType = 'default';
		selectedMarkerColor = '#3B82F6';
		labels = [];
		editingPlace = null;
		searchQuery = '';
		modalSearchQuery = '';
		searchResults = [];
		showSearchResults = false;
		showFavouritedOnly = false;
	}

	async function loadUserProfile() {
		if (!browser) return;

		isLoadingProfile = true;
		try {
			const session = await fluxbase.auth.getSession();
			if (!session.data?.session?.user) {
				console.error('No session found');
				return;
			}

			// Get user profile using ServiceAdapter (now uses SDK internally)
			const serviceAdapter = new ServiceAdapter({ session: session.data?.session });
			const profile = (await serviceAdapter.getProfile()) as any;

			userProfile = profile as UserProfile;

			// Check if user has a home address
			hasHomeAddress = !!profile?.home_address;
		} catch (error) {
			console.error('Error loading user profile:', error);
		} finally {
			isLoadingProfile = false;
		}
	}

	function loadPlaces() {
		WantToVisitService.getPlaces()
			.then((data) => {
				places = data;
				updateMarkers();
			})
			.catch((error) => {
				console.error('Error loading places:', error);
				toast.error('Failed to load places');
			})
			.finally(() => {
				isLoading = false;
			});
	}

	// ponytail: AI assistant accept handler. When the assistant proposes adding
	// a place to the wishlist (target:'want_to_visit'), the user accepts via a
	// clickable chip; this geocodes the suggestion and writes it through the
	// existing service so RLS + the map refresh behave identically to a manual
	// add. Deletes are handled by item_id.
	async function handleAcceptSuggestion(item: PlanSuggestion) {
		try {
			if (item.action === 'delete' && item.item_id) {
				await WantToVisitService.deletePlace(item.item_id);
				places = places.filter((p) => p.id !== item.item_id);
				updateMarkers();
				toast.success(t('wantToVisit.placeRemoved'));
				return;
			}

			// create (default): geocode the address to coordinates, then add.
			const query = item.address || item.title;
			if (!query) {
				toast.error(t('wantToVisit.failedToAddPlace'));
				return;
			}
			const geo = await forwardGeocode(query);
			let lat: number | null = geo?.lat ?? null;
			let lng: number | null = geo?.lon ?? null;
			if (lat == null || lng == null) {
				toast.error(t('wantToVisit.failedToAddPlace'));
				return;
			}
			const newPlace = await WantToVisitService.addPlace({
				title: item.title,
				type: item.type || 'place',
				coordinates: `${lat}, ${lng}`,
				address: item.address ?? undefined
			});
			places = [newPlace, ...places];
			updateMarkers();
			toast.success(t('wantToVisit.placeAdded'));
		} catch (e) {
			console.error('Error accepting AI suggestion:', e);
			toast.error(t('wantToVisit.failedToAddPlace'));
		}
	}

	function editPlace(place: Place) {
		editingPlace = place;
		title = place.title;
		const [lat, lng] = place.coordinates.split(',').map(Number);
		latitude = lat.toString();
		longitude = lng.toString();
		description = place.description || '';
		address = place.address || '';
		placeType = place.markerType || place.type || 'default'; // Use markerType if available, fallback to type or default
		selectedMarkerType = place.markerType || 'default';
		selectedMarkerColor = place.markerColor || '#3B82F6';
		labels = place.labels || [];
		showEditForm = true;
		// Reset search fields for edit mode
		searchQuery = '';
		modalSearchQuery = '';
		searchResults = [];
		showSearchResults = false;
	}

	let filteredPlaces = $derived(
		places.filter((place) => {
			const typeMatch =
				(selectedTypes.length === 1 && selectedTypes[0] === 'All') ||
				selectedTypes.some((selectedType) => place.markerType && place.markerType === selectedType);

			const searchLower = searchQuery.toLowerCase();
			const searchMatch =
				!searchQuery ||
				place.title.toLowerCase().includes(searchLower) ||
				(place.description && place.description.toLowerCase().includes(searchLower)) ||
				(place.labels && place.labels.some((label) => label.toLowerCase().includes(searchLower))) ||
				(place.address && place.address.toLowerCase().includes(searchLower)) ||
				(place.coordinates && place.coordinates.toLowerCase().includes(searchLower));

			const favouritedMatch = !showFavouritedOnly || place.favorite;

			return typeMatch && searchMatch && favouritedMatch;
		})
	);

	// Reset pagination when filters change
	$effect(() => {
		// Touch the reactive deps so this re-runs when they change
		void selectedTypes;
		void searchQuery;
		void showFavouritedOnly;
		visiblePlacesCount = PLACES_PER_PAGE;
	});

	const sortedPlaces = $derived.by(() => {
		const sorted = [...filteredPlaces];
		switch (sortBy) {
			case 'title':
				return sorted.sort((a, b) => a.title.localeCompare(b.title));
			case 'type':
				return sorted.sort((a, b) => (a.type || '').localeCompare(b.type || ''));
			case 'rating':
				return sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
			case 'date':
			default:
				return sorted.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
		}
	});

	const groupedPlaces = $derived.by(() => {
		if (groupBy === 'none') return [{ key: '', items: sortedPlaces }];
		const groups = new Map<string, typeof sortedPlaces>();
		for (const p of sortedPlaces) {
			let key = 'Other';
			if (groupBy === 'city') {
				key = p.location?.split(',')[0]?.trim() || 'Unknown city';
			} else if (groupBy === 'country') {
				const parts = p.location?.split(',');
				key = parts?.[1]?.trim() || parts?.[0]?.trim() || 'Unknown country';
			} else if (groupBy === 'type') {
				key = p.type || 'default';
			}
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(p);
		}
		return [...groups.entries()].map(([key, items]) => ({ key, items }));
	});

	const favoritePlaces = $derived(sortedPlaces.filter((p) => p.favorite));

	const visiblePlaces = $derived(sortedPlaces.slice(0, visiblePlacesCount));
	const hasMorePlaces = $derived(visiblePlacesCount < filteredPlaces.length);

	// Update markers when filtered places change
	$effect(() => {
		if (places.length > 0 && filteredPlaces.length >= 0) {
			updateMarkers();
		}
	});

	// Get marker icon based on type and color
	function getMarkerIcon(markerType: string = 'default', color: string = '#3B82F6') {
		if (!L) return null;

		// Use standard Leaflet marker icons - much simpler and more reliable
		return getOSMIcon(markerType, color);
	}

	// Utility function to get Lucide SVG icon with custom color
	function getOSMIcon(markerType: string = 'default', color: string = '#3B82F6'): any {
		if (!L) return null;

		const iconName = lucideIcons[markerType as keyof typeof lucideIcons] || 'map-pin';

		// Use Lucide SVG icons from a reliable CDN
		const iconUrl = `https://unpkg.com/lucide-static@latest/icons/${iconName}.svg`;

		return L.divIcon({
			className: 'custom-lucide-marker',
			html: `<div style="
				width: 24px;
				height: 24px;
				background-color: ${color};
				mask: url('${iconUrl}');
				-webkit-mask: url('${iconUrl}');
				background-size: contain;
				background-repeat: no-repeat;
				background-position: center;
			"></div>`,
			iconSize: [24, 24],
			iconAnchor: [12, 24]
		});
	}

	onMount(() => {
		// Svelte never runs a cleanup returned from an async onMount — wrap the
		// async body so the reset in the real cleanup below fires.
		(async () => {
			// Load user profile to check for home address
			await loadUserProfile();

			L = await import('leaflet');
			// Import markercluster plugin
			await import('leaflet.markercluster');
			if (map) return;

			map = L.map(mapContainer, {
				center: [20, 0],
				zoom: 2,
				minZoom: 1,
				maxZoom: 18,
				zoomControl: true,
				attributionControl: true,
				doubleClickZoom: true,
				tapTolerance: 15,
				touchZoom: true,
				bounceAtZoomLimits: false,
				scrollWheelZoom: true,
				keyboard: true,
				dragging: true,
				inertia: true,
				inertiaDeceleration: 3000,
				inertiaMaxSpeed: 3000,
				worldCopyJump: false,
				maxBounds: undefined,
				maxBoundsViscosity: 0.0
			});

			// Initialize marker cluster group
			markerClusterGroup = L.markerClusterGroup({
				chunkedLoading: true,
				spiderfyOnMaxZoom: true,
				showCoverageOnHover: false,
				zoomToBoundsOnClick: true,
				disableClusteringAtZoom: 16, // Disable clustering when zoomed in close
				maxClusterRadius: 50, // Maximum radius for clustering
				iconCreateFunction: function (cluster: any) {
					const count = cluster.getChildCount();
					let className = 'marker-cluster-';

					if (count < 5) {
						className += 'small';
					} else if (count < 10) {
						className += 'medium';
					} else {
						className += 'large';
					}

					return L.divIcon({
						html: `<div><span>${count}</span></div>`,
						className: className,
						iconSize: L.point(40, 40)
					});
				}
			});

			// Add cluster group to map
			map.addLayer(markerClusterGroup);

			// Theme-aware tile layer via shared utility — consistent with all other maps
			cleanupThemeWatcher = watchMapTheme(map, (theme) =>
				L.tileLayer(TILE_URLS[theme].url, { attribution: TILE_URLS[theme].attribution })
			);

			// Load places from database
			loadPlaces();

			// Add double-click handler to map
			map.on('dblclick', async (e: L.LeafletMouseEvent) => {
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

			// Theme changes are handled by watchMapTheme (above).
			// Also update marker icons when theme changes.
			const markerObserver = new MutationObserver(() => {
				updateMarkers();
			});
			markerObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['class']
			});

			// ponytail: register this page with the AI assistant as the
			// 'want-to-visit' surface so wishlist suggestions route here, and reset
			// to default + unregister when the user navigates away.
			aiDrawer.setContext({ page: 'want-to-visit' });
			aiDrawer.setAcceptHandler('want_to_visit', handleAcceptSuggestion);
		})();

		return () => {
			aiDrawer.setAcceptHandler('want_to_visit', null);
			aiDrawer.setContext({ page: 'default' });
		};
	});

	async function performReverseGeocoding(lat: number, lng: number) {
		isReverseGeocoding = true;
		try {
			const result = await reverseGeocode(lat, lng);

			// Extract place name from display_name
			const displayName = result.display_name;
			const nameParts = displayName.split(',');
			const primaryName = nameParts[0].trim();

			// Determine marker type based on address components
			let markerType = 'default';
			if (result.address) {
				if (result.address.restaurant || result.address.cafe) {
					markerType = result.address.cafe ? 'coffee' : 'restaurant';
				} else if (result.address.hotel || result.address.hostel) {
					markerType = 'hotel';
				} else if (result.address.museum) {
					markerType = 'camera';
				} else if (result.address.park) {
					markerType = 'tree';
				} else if (result.address.shop || result.address.store) {
					markerType = 'shopping';
				} else if (result.address.beach) {
					markerType = 'umbrella';
				} else if (result.address.city) {
					markerType = 'building';
				} else if (result.address.country) {
					markerType = 'flag';
				}
			}

			// Set title to primary name from reverse geocoding
			title = primaryName;
			address = displayName;
			placeType = markerType; // Use marker ID for consistent storage
			selectedMarkerType = markerType;
			description = t('wantToVisit.addedFromMap', { date: new Date().toLocaleDateString() });
		} catch (error) {
			console.error('Reverse geocoding failed:', error);
			title = `Location at ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
			address = `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
			placeType = 'default'; // Use marker ID for consistent storage
			selectedMarkerType = 'default';
			description = t('wantToVisit.locationAddedFromMap');
		} finally {
			isReverseGeocoding = false;
		}
	}

	function updateMarkers() {
		// Clear existing markers from cluster group
		if (markerClusterGroup) {
			markerClusterGroup.clearLayers();
		}

		// Clear markers array
		markers = [];

		// Add markers to cluster group (only filtered places)
		markers = filteredPlaces.map((place) => {
			const [lat, lng] = place.coordinates.split(',').map(Number);

			const markerIcon = getMarkerIcon(
				place.markerType || 'default',
				place.markerColor || '#3B82F6'
			);
			const marker = L.marker([lat, lng] as [number, number], { icon: markerIcon }).bindPopup(
				createPopupContent(place)
			);

			// Add marker to cluster group instead of directly to map
			markerClusterGroup.addLayer(marker);
			return marker;
		});

		// Don't change zoom level when filters change - let user control the view
		// Only fit bounds on initial load when places are first loaded
	}

	function createPopupContent(place: Place) {
		return `
			<div class="p-2">
				<h3 class="font-semibold text-sm">${place.title}</h3>
				<p class="text-xs text-muted-foreground mt-1">${place.address}</p>
				${place.description ? `<p class="text-xs text-muted-foreground mt-2 italic">"${place.description}"</p>` : ''}
			</div>
		`;
	}

	const searchPlaces = debounce(async () => {
		if (!modalSearchQuery || modalSearchQuery.length < 3) {
			searchResults = [];
			showSearchResults = false;
			return;
		}

		isSearching = true;
		try {
			const { getPeliasEndpoint } = await import('$lib/services/external/pelias.service');
			const peliasEndpoint = await getPeliasEndpoint();

			const response = await fetch(
				`${peliasEndpoint}/v1/autocomplete?text=${encodeURIComponent(modalSearchQuery)}&size=5`,
				{
					headers: {
						Accept: 'application/json'
					}
				}
			);
			const data = await response.json();
			searchResults = (data.features || []).map((feature: any) => ({
				name: feature.properties?.label || '',
				lat: feature.geometry?.coordinates?.[1],
				lon: feature.geometry?.coordinates?.[0],
				address: {
					city: feature.properties?.locality,
					state: feature.properties?.region,
					country: feature.properties?.country,
					country_code: feature.properties?.country_a,
					neighbourhood: feature.properties?.neighbourhood,
					road: feature.properties?.street,
					house_number: feature.properties?.housenumber
				}
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

	function handleSearchInput() {
		searchPlaces();
	}

	function selectPlace(result: any) {
		// Don't set the title from search - let user edit it separately
		latitude = result.lat;
		longitude = result.lon;
		address = result.name;

		// Determine marker type
		let markerType = 'default';
		if (result.address) {
			if (result.address.restaurant || result.address.cafe) {
				markerType = result.address.cafe ? 'coffee' : 'restaurant';
			} else if (result.address.hotel || result.address.hostel) {
				markerType = 'hotel';
			} else if (result.address.museum) {
				markerType = 'camera';
			} else if (result.address.park) {
				markerType = 'tree';
			} else if (result.address.shop || result.address.store) {
				markerType = 'shopping';
			} else if (result.address.beach) {
				markerType = 'umbrella';
			} else if (result.address.city) {
				markerType = 'building';
			} else if (result.address.country) {
				markerType = 'flag';
			}
		}
		placeType = markerType; // Use marker ID for consistent storage
		selectedMarkerType = markerType;

		// Set a default title based on the search result, but user can edit it
		if (!title) {
			title = result.name.split(',')[0];
		}

		description = t('wantToVisit.addedViaSearch', { date: new Date().toLocaleDateString() });
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

	function selectType(typeId: string) {
		if (typeId === 'All') {
			// If "All" is clicked, clear all other selections
			selectedTypes = ['All'];
		} else {
			// Remove "All" if it's selected and add the new type
			selectedTypes = selectedTypes.filter((t) => t !== 'All');

			if (selectedTypes.includes(typeId)) {
				// Remove the type if it's already selected
				selectedTypes = selectedTypes.filter((t) => t !== typeId);
				// If no types are selected, default back to "All"
				if (selectedTypes.length === 0) {
					selectedTypes = ['All'];
				}
			} else {
				// Add the new type
				selectedTypes = [...selectedTypes, typeId];
			}
		}
	}

	function clearFilters() {
		selectedTypes = ['All'];
		searchQuery = '';
		showFavouritedOnly = false;
	}

	async function addPlace() {
		if (!title || !latitude || !longitude) {
			toast.error('Please fill in all required fields');
			return;
		}

		try {
			const newPlace = await WantToVisitService.addPlace({
				title,
				type: placeType, // This will now be the marker ID
				coordinates: `${latitude}, ${longitude}`,
				description,
				address,
				markerType: selectedMarkerType,
				markerColor: selectedMarkerColor,
				labels: [...labels],
				favorite: false
			});

			places = [newPlace, ...places];

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
		} catch (error) {
			console.error('Error adding place:', error);
			toast.error('Failed to add place');
		}
	}

	async function updatePlace() {
		if (!editingPlace || !title || !latitude || !longitude) {
			toast.error('Please fill in all required fields');
			return;
		}

		try {
			const updatedPlace = await WantToVisitService.updatePlace(editingPlace.id, {
				title,
				type: placeType,
				coordinates: `${latitude}, ${longitude}`,
				description,
				address,
				markerType: selectedMarkerType,
				markerColor: selectedMarkerColor,
				labels: [...labels]
			});

			places = places.map((p) => (p.id === editingPlace!.id ? updatedPlace : p));

			resetForm();
			showEditForm = false;

			// Update markers
			updateMarkers();

			toast.success('Place updated successfully!');
		} catch (error) {
			console.error('Error updating place:', error);
			toast.error('Failed to update place');
		}
	}

	async function deletePlace(placeId: string) {
		try {
			await WantToVisitService.deletePlace(placeId);
			places = places.filter((p) => p.id !== placeId);
			updateMarkers();
			toast.success('Place removed from your list');
		} catch (error) {
			console.error('Error deleting place:', error);
			toast.error('Failed to delete place');
		}
	}

	async function toggleFavorite(place: Place) {
		try {
			const toggledPlace = await WantToVisitService.toggleFavorite(place.id, !place.favorite);
			places = places.map((p) => (p.id === place.id ? toggledPlace : p));
			updateMarkers();
		} catch (error) {
			console.error('Error toggling favorite:', error);
			toast.error('Failed to update favorite status');
		}
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

		.marker-preview {
			width: 32px;
			height: 32px;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 50%;
			background: var(--card, white);
			border: 2px solid var(--border, #e5e7eb);
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
			border-color: var(--foreground, #000);
			transform: scale(1.2);
		}

		/* Marker Cluster Styles */
		.marker-cluster-small {
			background-color: rgba(59, 130, 246, 0.8);
			border: 2px solid rgba(59, 130, 246, 0.9);
			border-radius: 50% !important;
		}

		.marker-cluster-small div {
			background-color: rgba(59, 130, 246, 0.9);
			border-radius: 50% !important;
		}

		.marker-cluster-medium {
			background-color: rgba(245, 158, 11, 0.8);
			border: 2px solid rgba(245, 158, 11, 0.9);
			border-radius: 50% !important;
		}

		.marker-cluster-medium div {
			background-color: rgba(245, 158, 11, 0.9);
			border-radius: 50% !important;
		}

		.marker-cluster-large {
			background-color: rgba(239, 68, 68, 0.8);
			border: 2px solid rgba(239, 68, 68, 0.9);
			border-radius: 50% !important;
		}

		.marker-cluster-large div {
			background-color: rgba(239, 68, 68, 0.9);
			border-radius: 50% !important;
		}

		/* Dark mode cluster styles */
		:global(.dark) .marker-cluster-small {
			background-color: rgba(59, 130, 246, 0.9);
			border: 2px solid rgba(59, 130, 246, 1);
			border-radius: 50% !important;
		}

		:global(.dark) .marker-cluster-small div {
			background-color: rgba(59, 130, 246, 1);
			border-radius: 50% !important;
		}

		:global(.dark) .marker-cluster-medium {
			background-color: rgba(245, 158, 11, 0.9);
			border: 2px solid rgba(245, 158, 11, 1);
			border-radius: 50% !important;
		}

		:global(.dark) .marker-cluster-medium div {
			background-color: rgba(245, 158, 11, 1);
			border-radius: 50% !important;
		}

		:global(.dark) .marker-cluster-large {
			background-color: rgba(239, 68, 68, 0.9);
			border: 2px solid rgba(239, 68, 68, 1);
			border-radius: 50% !important;
		}

		:global(.dark) .marker-cluster-large div {
			background-color: rgba(239, 68, 68, 1);
			border-radius: 50% !important;
		}

		/* Cluster text styling */
		.marker-cluster-small div,
		.marker-cluster-medium div,
		.marker-cluster-large div {
			color: white;
			font-weight: bold;
			font-size: 12px;
			text-align: center;
			line-height: 36px;
			border-radius: 50% !important;
			width: 36px;
			height: 36px;
		}
	</style>
	<title>{t('common.navigation.wantToVisit')} · Wayli</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
		<div class="flex items-center gap-3">
			<Heart class="text-primary h-6 w-6" />
			<div>
				<h1 class="text-foreground text-xl font-bold">
					{t('common.navigation.wantToVisit')}
				</h1>
				<p class="text-muted-foreground text-sm">
					{places.length}
					{places.length === 1 ? 'place' : 'places'}
					{#if favoritePlaces.length > 0}· {favoritePlaces.length} favorited{/if}
				</p>
			</div>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				onclick={() => (mapExpanded = !mapExpanded)}
				class="border-border text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
			>
				<MapPin class="h-4 w-4" />
				{mapExpanded ? 'Hide Map' : 'Show Map'}
			</button>
			<select
				bind:value={sortBy}
				class="border-border min-w-[7rem] flex-1 rounded-lg border bg-transparent px-2 py-2 text-sm sm:flex-none"
				title="Sort by"
			>
				<option value="date">Recent</option>
				<option value="title">A–Z</option>
				<option value="type">Type</option>
				<option value="rating">Rating</option>
			</select>
			<select
				bind:value={groupBy}
				class="border-border min-w-[7rem] flex-1 rounded-lg border bg-transparent px-2 py-2 text-sm sm:flex-none"
				title="Group by"
			>
				<option value="none">No grouping</option>
				<option value="city">By city</option>
				<option value="country">By country</option>
				<option value="type">By type</option>
			</select>
			<button
				class="bg-primary hover:bg-primary/90 flex inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors sm:w-auto"
				onclick={() => {
					showAddForm = true;
					title = '';
					latitude = '';
					longitude = '';
					description = '';
					address = '';
					placeType = 'default';
					searchResults = [];
					showSearchResults = false;
					labels = [];
					labelInput = '';
				}}
			>
				<Plus class="h-4 w-4" />
				{t('wantToVisit.addNewPlace')}
			</button>
		</div>
	</div>

	<!-- Collapsible Map -->
	<div
		class="bg-card border-border relative isolate z-0 overflow-hidden rounded-xl border transition-all {mapExpanded
			? ''
			: 'hidden'}"
	>
		<div bind:this={mapContainer} class="h-96 w-full md:h-[500px]"></div>
		{#if !showAddForm}
			<div
				class="dark:bg-card/90 absolute top-4 left-4 z-10 rounded-lg bg-white/90 p-3 shadow-lg backdrop-blur-sm"
			>
				<div class="text-muted-foreground flex items-center gap-2 text-sm">
					<MapPin class="h-4 w-4" />
					{t('wantToVisit.clickOnMapToAdd')}
				</div>
			</div>
		{/if}
	</div>

	<!-- Simple Modal Overlay -->
	{#if showAddForm}
		<div
			class="modal-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					showAddForm = false;
					if (tempMarker) {
						tempMarker.remove();
						tempMarker = null;
					}
				}
			}}
			onclick={(e) => {
				// Close modal if clicking the backdrop
				if (e.target === e.currentTarget) {
					showAddForm = false;
					if (tempMarker) {
						tempMarker.remove();
						tempMarker = null;
					}
				}
			}}
			tabindex="-1"
		>
			<div
				class="bg-card relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg p-6"
				role="dialog"
				tabindex="0"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<div class="mb-4 flex items-center justify-between">
					<h3 class="text-foreground text-lg font-bold">
						{t('wantToVisit.addNewPlace')}
					</h3>
					<button
						onclick={() => {
							showAddForm = false;
							if (tempMarker) {
								tempMarker.remove();
								tempMarker = null;
							}
						}}
						class="text-muted-foreground hover:bg-muted hover:text-muted-foreground rounded-lg p-2 transition-colors"
					>
						<X class="h-5 w-5" />
					</button>
				</div>

				<!-- Full form with proper z-index -->
				<div class="space-y-4">
					<!-- Title Input (required) -->
					<div>
						<label for="titleInput" class="text-muted-foreground mb-1 block text-sm font-medium"
							>{t('wantToVisit.title')} <span class="text-red-500">*</span></label
						>
						<input
							id="titleInput"
							type="text"
							bind:value={title}
							class="focus:ring-primary focus:border-primary dark:border-border dark:bg-muted w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 dark:text-white"
							placeholder={t('wantToVisit.titlePlaceholder')}
							required
						/>
					</div>

					<!-- Search Input -->
					<div>
						<label for="searchPlace" class="text-muted-foreground mb-2 block text-sm font-medium">
							{t('wantToVisit.searchForPlace')}
						</label>
						<div class="relative">
							<div class="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2">
								<Search class="text-muted-foreground h-4 w-4" />
							</div>
							<input
								type="text"
								id="searchPlace"
								bind:value={modalSearchQuery}
								oninput={handleSearchInput}
								class="focus:ring-primary focus:border-primary dark:border-border dark:bg-muted w-full rounded-lg border border-gray-300 py-2 pr-10 pl-10 text-sm focus:ring-1 dark:text-white"
								placeholder={t('wantToVisit.searchPlaceholder')}
							/>
							{#if isSearching}
								<div class="pointer-events-none absolute top-1/2 right-3 z-10 -translate-y-1/2">
									<div
										class="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
									></div>
								</div>
							{/if}
						</div>

						<!-- Search Results -->
						{#if showSearchResults && searchResults.length > 0}
							<div
								class="dark:border-border dark:bg-muted relative z-[10002] mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
							>
								{#each searchResults as result, index (index)}
									<button
										type="button"
										class="hover:bg-muted dark:border-border dark:hover:bg-muted w-full border-b border-gray-100 p-3 text-left transition-colors last:border-b-0"
										onclick={() => selectPlace(result)}
									>
										<div class="text-foreground text-sm font-medium">
											{result.name.split(',')[0]}
										</div>
										<div class="text-muted-foreground truncate text-xs">
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
							<label
								for="latitudeInput"
								class="text-muted-foreground mb-1 block text-sm font-medium"
								>{t('wantToVisit.latitude')}</label
							>
							<input
								id="latitudeInput"
								type="text"
								bind:value={latitude}
								readonly
								class="dark:border-border dark:bg-muted dark:text-muted-foreground w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
							/>
						</div>
						<div>
							<label
								for="longitudeInput"
								class="text-muted-foreground mb-1 block text-sm font-medium"
								>{t('wantToVisit.longitude')}</label
							>
							<input
								id="longitudeInput"
								type="text"
								bind:value={longitude}
								readonly
								class="dark:border-border dark:bg-muted dark:text-muted-foreground w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
							/>
						</div>
					</div>

					<!-- Address Display -->
					<div>
						<label for="addressDisplay" class="text-muted-foreground mb-1 block text-sm font-medium"
							>{t('wantToVisit.address')}</label
						>
						<div
							id="addressDisplay"
							class="dark:border-border dark:bg-muted dark:text-muted-foreground flex min-h-[2.5rem] w-full items-center rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
						>
							{#if isReverseGeocoding}
								<div class="text-muted-foreground flex items-center gap-2">
									<div
										class="h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-transparent"
									></div>
									{t('wantToVisit.lookingUpAddress')}
								</div>
							{:else}
								{address || t('wantToVisit.clickMapOrSearch')}
							{/if}
						</div>
					</div>

					<!-- Type Selection via Icons -->
					<fieldset>
						<legend class="text-muted-foreground mb-1 block text-sm font-medium"
							>{t('wantToVisit.type')}</legend
						>
						<div class="flex flex-wrap gap-2" role="group" aria-label="Place type selection">
							{#each markerTypes as marker (marker.id)}
								<button
									type="button"
									aria-label="Select {marker.name} type"
									onclick={() => {
										placeType = marker.id; // Store marker ID, not name
										selectedMarkerType = marker.id;
									}}
									class="flex flex-col items-center justify-center gap-1 rounded-lg border px-3 py-2 transition-colors {placeType ===
									marker.id
										? 'bg-primary border-primary text-white'
										: 'hover:bg-muted dark:border-border dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted border-gray-200 bg-gray-100 text-gray-700'}"
								>
									<marker.icon class="h-5 w-5" />
									<span class="text-xs">{marker.name}</span>
								</button>
							{/each}
						</div>
					</fieldset>

					<!-- Marker Color -->
					<fieldset>
						<legend class="text-muted-foreground mb-1 block text-sm font-medium"
							>{t('wantToVisit.markerColor')}</legend
						>
						<div class="flex flex-wrap gap-1" role="group" aria-label="Marker color selection">
							{#each markerColors as color (color)}
								<button
									type="button"
									aria-label="Select {color} color"
									onclick={() => (selectedMarkerColor = color)}
									class="color-option {selectedMarkerColor === color ? 'selected' : ''}"
									style="background-color: {color}"
								></button>
							{/each}
						</div>
					</fieldset>

					<!-- Custom Labels -->
					<div>
						<label for="labelInput" class="text-muted-foreground mb-1 block text-sm font-medium"
							>{t('wantToVisit.labels')}</label
						>
						<div class="mb-2 flex flex-wrap gap-2">
							{#each labels as label (label)}
								<span
									class="bg-primary/10 text-primary dark:bg-primary/30 dark:text-muted-foreground mr-1 mb-1 inline-flex items-center rounded-full px-2 py-1 text-xs"
								>
									{label}
									<button
										type="button"
										aria-label="Remove {label} label"
										class="text-primary ml-1 hover:text-red-500"
										onclick={() => removeLabel(label)}
									>
										<X class="h-3 w-3" />
									</button>
								</span>
							{/each}
						</div>
						<div class="flex gap-2">
							<input
								id="labelInput"
								type="text"
								bind:value={labelInput}
								class="focus:ring-primary focus:border-primary dark:border-border dark:bg-muted flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 dark:text-white"
								placeholder={t('wantToVisit.addLabelPlaceholder')}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										addLabel();
									}
								}}
							/>
							<button
								type="button"
								class="bg-primary hover:bg-primary/90 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors"
								onclick={addLabel}
							>
								{t('common.actions.add')}
							</button>
						</div>
					</div>

					<!-- Description -->
					<div>
						<label
							for="descriptionInput"
							class="text-muted-foreground mb-1 block text-sm font-medium"
							>{t('wantToVisit.notes')}</label
						>
						<textarea
							id="descriptionInput"
							bind:value={description}
							rows="3"
							class="focus:ring-primary focus:border-primary dark:border-border dark:bg-muted relative z-[10001] w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 dark:text-white"
							placeholder={t('wantToVisit.notesPlaceholder')}></textarea>
					</div>

					<!-- Action Buttons -->
					<div class="flex gap-3 pt-2">
						<button
							type="button"
							onclick={() => {
								showAddForm = false;
								if (tempMarker) {
									tempMarker.remove();
									tempMarker = null;
								}
							}}
							class="dark:border-border dark:text-muted-foreground hover:bg-muted flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors"
						>
							{t('common.actions.cancel')}
						</button>
						<button
							type="button"
							onclick={addPlace}
							class="bg-primary hover:bg-primary/90 flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
						>
							{t('wantToVisit.addToList')}
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Edit Modal Overlay -->
	{#if showEditForm}
		<div
			class="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					showEditForm = false;
					resetForm();
				}
			}}
			onclick={(e) => {
				// Close modal if clicking the backdrop
				if (e.target === e.currentTarget) {
					showEditForm = false;
					resetForm();
				}
			}}
			tabindex="-1"
		>
			<div
				class="bg-card relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg p-6"
				role="dialog"
				tabindex="0"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<div class="mb-4 flex items-center justify-between">
					<h3 class="text-foreground text-lg font-bold">
						{t('wantToVisit.editPlace')}
					</h3>
					<button
						onclick={() => {
							showEditForm = false;
							resetForm();
						}}
						class="text-muted-foreground hover:bg-muted hover:text-muted-foreground rounded-lg p-2 transition-colors"
					>
						<X class="h-5 w-5" />
					</button>
				</div>

				<!-- Edit form with same fields as add form -->
				<div class="space-y-4">
					<!-- Title Input (required) -->
					<div>
						<label for="titleInput" class="text-muted-foreground mb-1 block text-sm font-medium"
							>{t('wantToVisit.title')} <span class="text-red-500">*</span></label
						>
						<input
							id="titleInput"
							type="text"
							bind:value={title}
							class="focus:ring-primary focus:border-primary dark:border-border dark:bg-muted w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 dark:text-white"
							placeholder={t('wantToVisit.titlePlaceholder')}
							required
						/>
					</div>

					<!-- Coordinates Display -->
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label
								for="latitudeInput"
								class="text-muted-foreground mb-1 block text-sm font-medium"
								>{t('wantToVisit.latitude')}</label
							>
							<input
								id="latitudeInput"
								type="text"
								bind:value={latitude}
								readonly
								class="dark:border-border dark:bg-muted dark:text-muted-foreground w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
							/>
						</div>
						<div>
							<label
								for="longitudeInput"
								class="text-muted-foreground mb-1 block text-sm font-medium"
								>{t('wantToVisit.longitude')}</label
							>
							<input
								id="longitudeInput"
								type="text"
								bind:value={longitude}
								readonly
								class="dark:border-border dark:bg-muted dark:text-muted-foreground w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
							/>
						</div>
					</div>

					<!-- Address Display -->
					<div>
						<label for="addressDisplay" class="text-muted-foreground mb-1 block text-sm font-medium"
							>{t('wantToVisit.address')}</label
						>
						<input
							id="addressDisplay"
							type="text"
							bind:value={address}
							class="focus:ring-primary focus:border-primary dark:border-border dark:bg-muted w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 dark:text-white"
							placeholder={t('wantToVisit.addressPlaceholder')}
						/>
					</div>

					<!-- Type Selection via Icons -->
					<fieldset>
						<legend class="text-muted-foreground mb-1 block text-sm font-medium"
							>{t('wantToVisit.type')}</legend
						>
						<div class="flex flex-wrap gap-2" role="group" aria-label="Place type selection">
							{#each markerTypes as marker (marker.id)}
								<button
									type="button"
									aria-label="Select {marker.name} type"
									onclick={() => {
										placeType = marker.id; // Store marker ID, not name
										selectedMarkerType = marker.id;
									}}
									class="flex flex-col items-center justify-center gap-1 rounded-lg border px-3 py-2 transition-colors {placeType ===
									marker.id
										? 'bg-primary border-primary text-white'
										: 'hover:bg-muted dark:border-border dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted border-gray-200 bg-gray-100 text-gray-700'}"
								>
									<marker.icon class="h-5 w-5" />
									<span class="text-xs">{marker.name}</span>
								</button>
							{/each}
						</div>
					</fieldset>

					<!-- Marker Color -->
					<fieldset>
						<legend class="text-muted-foreground mb-1 block text-sm font-medium"
							>{t('wantToVisit.markerColor')}</legend
						>
						<div class="flex flex-wrap gap-1" role="group" aria-label="Marker color selection">
							{#each markerColors as color (color)}
								<button
									type="button"
									aria-label="Select {color} color"
									onclick={() => (selectedMarkerColor = color)}
									class="color-option {selectedMarkerColor === color ? 'selected' : ''}"
									style="background-color: {color}"
								></button>
							{/each}
						</div>
					</fieldset>

					<!-- Custom Labels -->
					<div>
						<label for="labelInput" class="text-muted-foreground mb-1 block text-sm font-medium"
							>{t('wantToVisit.labels')}</label
						>
						<div class="mb-2 flex flex-wrap gap-2">
							{#each labels as label (label)}
								<span
									class="bg-primary/10 text-primary dark:bg-primary/30 dark:text-muted-foreground mr-1 mb-1 inline-flex items-center rounded-full px-2 py-1 text-xs"
								>
									{label}
									<button
										type="button"
										aria-label="Remove {label} label"
										class="text-primary ml-1 hover:text-red-500"
										onclick={() => removeLabel(label)}
									>
										<X class="h-3 w-3" />
									</button>
								</span>
							{/each}
						</div>
						<div class="flex gap-2">
							<input
								id="labelInput"
								type="text"
								bind:value={labelInput}
								class="focus:ring-primary focus:border-primary dark:border-border dark:bg-muted flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 dark:text-white"
								placeholder={t('wantToVisit.addLabelPlaceholder')}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										addLabel();
									}
								}}
							/>
							<button
								type="button"
								class="bg-primary hover:bg-primary/90 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors"
								onclick={addLabel}
							>
								{t('common.actions.add')}
							</button>
						</div>
					</div>

					<!-- Description -->
					<div>
						<label
							for="descriptionInput"
							class="text-muted-foreground mb-1 block text-sm font-medium"
							>{t('wantToVisit.notes')}</label
						>
						<textarea
							id="descriptionInput"
							bind:value={description}
							rows="3"
							class="focus:ring-primary focus:border-primary dark:border-border dark:bg-muted relative z-[10001] w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-1 dark:text-white"
							placeholder={t('wantToVisit.notesPlaceholder')}></textarea>
					</div>

					<!-- Action Buttons -->
					<div class="flex gap-3 pt-2">
						<button
							type="button"
							onclick={() => {
								showEditForm = false;
								resetForm();
							}}
							class="dark:border-border dark:text-muted-foreground hover:bg-muted flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors"
						>
							{t('common.actions.cancel')}
						</button>
						<button
							type="button"
							onclick={updatePlace}
							class="bg-primary hover:bg-primary/90 flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
						>
							{t('wantToVisit.updatePlace')}
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Filters and Search -->
	<div class="space-y-4">
		<!-- Filter Controls -->
		<div class="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
			<!-- Type Filter -->
			<div class="flex flex-col gap-2">
				<label for="type-filter" class="text-muted-foreground text-sm font-medium"
					>{t('wantToVisit.type')}</label
				>
				<div id="type-filter" class="flex flex-wrap gap-2">
					{#each availableTypes as type (type.id)}
						<button
							class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {selectedTypes.includes(
								type.id
							)
								? 'bg-primary text-white'
								: 'hover:bg-muted dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted bg-gray-100 text-gray-700'}"
							onclick={() => {
								selectType(type.id);
							}}
						>
							<type.icon class="h-4 w-4" />
							{type.name}
						</button>
					{/each}
					<button
						class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {showFavouritedOnly
							? 'bg-red-600 text-white'
							: 'hover:bg-muted dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted bg-gray-100 text-gray-700'}"
						onclick={() => {
							showFavouritedOnly = !showFavouritedOnly;
						}}
					>
						<Heart class="h-4 w-4 {showFavouritedOnly ? 'fill-current' : ''}" />
						{t('wantToVisit.favourited')}
					</button>
				</div>
			</div>

			<!-- Search -->
			<div class="relative w-full lg:w-64">
				<Search
					class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
				/>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder={t('wantToVisit.searchTitlesPlaceholder')}
					class="focus:ring-primary focus:border-primary dark:border-border dark:bg-muted w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 text-sm focus:ring-1 dark:text-white"
				/>
			</div>
		</div>

		<!-- Results Count -->
		<div class="flex items-center justify-between">
			<div class="text-muted-foreground text-sm">
				{t('wantToVisit.showingPlacesOf', {
					filtered: filteredPlaces.length.toLocaleString(),
					total: places.length.toLocaleString()
				})}
			</div>
			{#if searchQuery || selectedTypes.length > 1 || showFavouritedOnly}
				<button
					onclick={clearFilters}
					class="dark:text-muted-foreground hover:bg-muted flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-medium text-gray-600 transition-colors"
				>
					<X class="h-3 w-3" />
					{t('wantToVisit.clearFilters')}
				</button>
			{/if}
		</div>
	</div>

	<!-- Places List -->
	{#if isLoading}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _, i (i)}
				<div class="bg-card border-border rounded-xl border p-6">
					<Skeleton class="h-4 w-3/4" />
					<Skeleton class="mt-3 h-3 w-1/2" />
					<Skeleton class="mt-6 h-20 w-full" />
				</div>
			{/each}
		</div>
	{:else if filteredPlaces.length === 0}
		<div class="py-12 text-center">
			<Globe2 class="text-muted-foreground mx-auto mb-4 h-12 w-12" />
			<h3 class="text-foreground mb-2 text-lg font-medium">
				{t('wantToVisit.noPlacesFound')}
			</h3>
			<p class="text-muted-foreground">
				{searchQuery || selectedTypes.length > 1
					? t('wantToVisit.tryAdjustingFilters')
					: t('wantToVisit.addFirstPlace')}
			</p>
		</div>
	{:else}
		<!-- Shortlist (favorites) -->
		{#if favoritePlaces.length > 0 && groupBy === 'none'}
			<div class="space-y-3">
				<h2
					class="text-foreground flex items-center gap-2 text-sm font-bold tracking-wide uppercase"
				>
					<Heart class="h-4 w-4 fill-red-500 text-red-500" />
					Shortlist ({favoritePlaces.length})
				</h2>
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{#each favoritePlaces.slice(0, 8) as place (place.id)}
						<div
							class="bg-card border-border group relative overflow-hidden rounded-xl border transition-all hover:-translate-y-1 hover:shadow-lg"
						>
							<div class="p-4">
								<h3 class="text-foreground truncate font-bold">{place.title}</h3>
								{#if place.location}
									<p class="text-muted-foreground truncate text-xs">{place.location}</p>
								{/if}
								{#if place.rating && place.rating > 0}
									<div class="mt-1 text-xs text-amber-500">
										{'★'.repeat(place.rating)}<span class="text-muted-foreground"
											>{'★'.repeat(5 - place.rating)}</span
										>
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Grouped or flat grid -->
		{#each groupedPlaces as group (group.key)}
			{#if group.key}
				<h2 class="text-foreground mt-6 mb-3 text-sm font-bold tracking-wide uppercase">
					{group.key} ({group.items.length})
				</h2>
			{/if}
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each group.key ? group.items : visiblePlaces as place (place.id)}
					<div
						class="group bg-card border-border relative rounded-xl border p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
					>
						<!-- Favorite Button -->
						<button
							onclick={() => toggleFavorite(place)}
							class="text-muted-foreground absolute top-4 right-4 rounded-lg p-2 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
						>
							<Heart class="h-5 w-5 {place.favorite ? 'fill-red-500 text-red-500' : ''}" />
						</button>

						<!-- Place Info -->
						<div class="mb-4">
							<div class="text-primary dark:text-muted-foreground mb-1 text-base font-bold">
								{place.title}
							</div>
							<!-- Rating stars -->
							<div class="mb-1 flex gap-0.5">
								{#each [1, 2, 3, 4, 5] as star (star)}
									<button
										type="button"
										onclick={() =>
											WantToVisitService.setRating(place.id, star === place.rating ? 0 : star)}
										class="text-sm transition-colors {star <= (place.rating ?? 0)
											? 'text-amber-500'
											: 'text-muted-foreground/30 hover:text-amber-400'}"
										aria-label="Rate {star} stars"
									>
										★
									</button>
								{/each}
							</div>
							<div class="mb-2 flex items-start justify-between">
								<!-- Remove name display -->
							</div>
							<div class="text-muted-foreground mb-2 flex items-center gap-2 text-sm">
								<MapPin class="h-4 w-4" />
								{place.address || place.coordinates}
							</div>
							<span
								class="bg-primary/10 text-primary dark:bg-primary/30 dark:text-muted-foreground inline-block rounded-full px-2 py-1 text-xs font-medium"
							>
								{getMarkerTypeName(place.markerType || place.type || 'default')}
							</span>
							<!-- Labels -->
							{#if place.labels && place.labels.length > 0}
								<div class="mt-2 flex flex-wrap gap-1">
									{#each place.labels as label (label)}
										<span
											class="bg-primary/5 text-primary dark:bg-primary/40 dark:text-muted-foreground inline-flex items-center rounded-full px-2 py-1 text-xs"
										>
											{label}
										</span>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Description -->
						{#if place.description}
							<div class="mb-4">
								<p class="text-muted-foreground line-clamp-2 text-sm">
									{place.description}
								</p>
							</div>
						{/if}

						<!-- Coordinates -->
						<div class="text-muted-foreground mb-4 text-xs">
							{place.coordinates}
						</div>

						<!-- Action Buttons -->
						<div class="flex gap-2">
							<button
								onclick={() => {
									const [lat, lng] = place.coordinates.split(',').map(Number);
									map.setView([lat, lng], 15);
								}}
								class="text-primary hover:bg-primary/5 dark:hover:bg-primary/20 flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
							>
								<MapPin class="h-4 w-4" />
								{t('wantToVisit.showOnMap')}
							</button>
							<button
								onclick={() => editPlace(place)}
								class="hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/20 text-muted-foreground rounded-lg p-2 transition-colors"
							>
								<Edit class="h-4 w-4" />
							</button>
							<button
								onclick={() => deletePlace(place.id)}
								class="text-muted-foreground rounded-lg p-2 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
							>
								<Trash2 class="h-4 w-4" />
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/each}

		<!-- Load more -->
		{#if hasMorePlaces && groupBy === 'none'}
			<div class="mt-6 flex justify-center">
				<button
					type="button"
					onclick={() => (visiblePlacesCount += PLACES_PER_PAGE)}
					class="border-border text-foreground hover:bg-muted rounded-lg border px-6 py-2 text-sm font-medium transition-colors"
				>
					Load more places ({filteredPlaces.length - visiblePlacesCount} remaining)
				</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.modal-overlay {
		margin: 0 !important;
		height: 100vh;
		min-height: 100vh;
	}
</style>
