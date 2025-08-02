<script lang="ts">
	console.log('🚀 Statistics page script loaded');

	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { Map as LeafletMap } from 'leaflet';
	import {
		MapPin,
		Activity,
		Loader2,
		Trash2,
		Route,
		Navigation,
		Globe2,
		Clock,
		Flag,
		Footprints,
		Train,
		BarChart,
		Edit,
		Import
	} from 'lucide-svelte';
	import { format } from 'date-fns';
	import {
		state,
		setDateRange,
		setMapInitialState,
		clearMapInitialState,
		setStartDate,
		setEndDate,
		closeDatePicker,
		clearFilters
	} from '$lib/stores/app-state.svelte';
	import { toast } from 'svelte-sonner';
	import { DatePicker } from '@svelte-plugins/datepicker';
	import { sessionStore, sessionStoreReady } from '$lib/stores/auth';
	import { supabase } from '$lib/supabase';
	import GeocodingProgress from '$lib/components/GeocodingProgress.svelte';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { getTransportDetectionReasonLabel, type TransportDetectionReason } from '$lib/types/transport-detection-reasons';
	import { currentLocale, getCountryNameReactive, t } from '$lib/i18n';

	// Add these interfaces at the top of the file
	interface TrackerLocation {
		id: string;
		name: string;
		description: string;
		type: 'tracker';
		coordinates: { lat: number; lng: number };
		city: string;
		created_at: string;
		updated_at: string;
		recorded_at: string;
		altitude?: number;
		accuracy?: number;
		speed?: number;
		transport_mode: string;
		detectionReason?: TransportDetectionReason | string;
		velocity?: number;
		distance_from_prev?: number;
		geocode?: GeocodeData | string | null;
	}

	interface GeocodeData {
		display_name?: string;
		name?: string;
		amenity?: string;
		city?: string;
		error?: boolean;
		[key: string]: unknown;
	}

	interface StatisticsData {
		totalDistance?: string;
		earthCircumferences?: number;
		geopoints?: number;
		timeSpentMoving?: string;
		uniquePlaces?: number;
		countriesVisited?: number;
		steps?: number;
		transport?: Array<{ mode: string; distance: number; time: number; percentage: number; points?: number }>;
		countryTimeDistribution?: Array<{ country_code: string; percent: number }>;
		trainStationVisits?: Array<{ name: string; count: number }>;
	}

	let map: LeafletMap;
	let L: typeof import('leaflet');
	let mapContainer: HTMLDivElement;
	let currentTileLayer: any;
	let markers: any[] = [];
	let polylines: any[] = [];
	let selectedMarkers: any[] = [];
	let currentPopup: any = null;
	let isEditMode = false;
	let isLoading = false;
	let isInitialLoad = true;
	let isInitializing = true; // Flag to prevent reactive statement during initial setup
	let locationData: TrackerLocation[] = [];
	let hasMoreData = false;
	let currentOffset = 0;
	const BATCH_SIZE = 5000; // Show 5000 points by default
	let totalPoints = 0;

	// Progress tracking
	let loadingProgress = 0; // 0-100
	let loadingStage = ''; // Current loading stage description
	let isCountingRecords = false; // Whether we're currently counting records

	// Add minimum loading time to ensure loading indicator is visible
	let loadingStartTime = 0;
	const MIN_LOADING_TIME = 800; // 800ms minimum loading time

	// Custom marker icons
	let locationIcon: any;
	let poiIcon: any;
	let trackerIcon: any;

	// Add statistics state
	let statisticsData: StatisticsData | null = null;
	let statisticsLoading = false;
	let statisticsError = '';

	const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;
	const today = new Date();
	const getDateFromToday = (days: number) => new Date(Date.now() - days * MILLISECONDS_IN_DAY);

	let isOpen = false;
	let dateFormat = 'MMM d, yyyy';

	let formattedStartDate = '';
	let formattedEndDate = '';

	// Add reactive cache update trigger
	let cacheUpdateTrigger = 0;

	// Use reactive statements to format dates from global state
	$: formattedStartDate = state.filtersStartDate ? format(state.filtersStartDate, dateFormat) : '';
	$: formattedEndDate = state.filtersEndDate ? format(state.filtersEndDate, dateFormat) : '';

	// Helper to ensure a value is a Date object
	function getDateObject(val: any) {
		if (!val) return null;
		return val instanceof Date ? val : new Date(val);
	}

	function onClearDates() {
		clearFilters(); // Use the global clear function
	}

	function toggleDatePicker() {
		isOpen = !isOpen;
	}

	function selectedDateRange() {
		return state.filtersStartDate && state.filtersEndDate
			? `${format(state.filtersStartDate, 'MMM d, yyyy')} - ${format(state.filtersEndDate, 'MMM d, yyyy')}`
			: 'Date range';
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.date-picker-container')) {
			closeDatePicker();
		}
	}

	function handlePlaceHover(event: CustomEvent<{ lat: number; lng: number }>) {
		if (!map) return;
		const { lat, lng } = event.detail;

		// Store initial map state if not already stored
		if (!state.mapInitialZoom) {
			setMapInitialState(map.getZoom(), map.getCenter());
		}

		map.flyTo([lat, lng], 13, {
			animate: true,
			duration: 0.5
		});
	}

	function handlePlaceLeave() {
		if (!map || !state.mapInitialCenter) return;

		map.flyTo(state.mapInitialCenter, state.mapInitialZoom || 2, {
			animate: true,
			duration: 0.5
		});

		clearMapInitialState();
	}



	async function loadLocationData(reset = true) {
		if (isLoading) return;

		loadingStartTime = Date.now();
		isLoading = true;
		if (reset) {
			currentOffset = 0;
			clearMapMarkers();
			locationData = []; // Clear existing data when resetting
		}

		try {
			// Use the combined function that fetches both map data and statistics
			await fetchMapDataAndStatistics(false, 0);
		} catch (error) {
			console.error('Error loading location data:', error);
			toast.error('Failed to load location data');
		} finally {
			// Ensure minimum loading time
			const elapsed = Date.now() - loadingStartTime;
			if (elapsed < MIN_LOADING_TIME) {
				await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_TIME - elapsed));
			}
			isLoading = false;
			isInitialLoad = false;
		}
	}

	function addMarkersToMap(data: TrackerLocation[], reset = true) {
		console.log('🗺️ addMarkersToMap called with:', data.length, 'items');

		if (!map || !L) {
			console.log('❌ [Statistics] Map or L not available');
			return;
		}

		// Clear existing polylines and markers only if resetting
		if (reset) {
			polylines.forEach((polyline) => {
				if (map) map.removeLayer(polyline);
			});
			polylines = [];
			markers.forEach((marker) => {
				if (map) map.removeLayer(marker);
			});
			markers = [];
		}

		// Color map for transport modes
		const modeColors: Record<string, string> = {
			car: '#ef4444', // red
			train: '#a21caf', // purple
			airplane: '#000000', // black
			cycling: '#f59e42', // orange
			walking: '#10b981', // green
			unknown: '#6b7280' // gray
		};

		// Sort data by recorded_at timestamp for sequential rendering
		const sortedData = data
			.filter(item => {
				const hasValidCoords = item.coordinates && typeof item.coordinates.lat === 'number' && typeof item.coordinates.lng === 'number';
				if (!hasValidCoords) {
					console.log('❌ [Statistics] Filtered out item with invalid coordinates:', item.coordinates);
				}
				return hasValidCoords;
			})
			.sort((a, b) => {
				const dateA = new Date(a.recorded_at || a.created_at).getTime();
				const dateB = new Date(b.recorded_at || b.created_at).getTime();
				return dateA - dateB;
			});

		console.log('🗺️ [Statistics] After filtering, sortedData has:', sortedData.length, 'items');
		if (sortedData.length > 0) {
			console.log('🗺️ [Statistics] First item coordinates:', sortedData[0].coordinates);
			console.log('🗺️ [Statistics] Last item coordinates:', sortedData[sortedData.length - 1].coordinates);
		}

		// Draw lines between consecutive points
		if (sortedData.length > 1) {
			for (let i = 0; i < sortedData.length - 1; i++) {
				const curr = sortedData[i];
				const next = sortedData[i + 1];
				const lineCoordinates: [number, number][] = [
					[curr.coordinates.lat, curr.coordinates.lng],
					[next.coordinates.lat, next.coordinates.lng]
				];
				const mode = next.transport_mode || 'unknown';
				const polyline = L.polyline(lineCoordinates as [number, number][], {
					color: modeColors[mode] || '#6b7280',
					weight: 2,
					opacity: 0.8
				}).addTo(map);
				polylines.push(polyline);
			}
		}

		// Add markers for location data points with transport mode colors
		console.log('🗺️ [Statistics] Adding markers for', sortedData.length, 'items');
		for (const item of sortedData) {
			const transportMode = item.transport_mode || 'unknown';
			const markerColor = modeColors[transportMode] || '#6b7280';
			const marker = L.circleMarker([item.coordinates.lat, item.coordinates.lng], {
				radius: 3,
				fillColor: markerColor,
				color: 'transparent',
				weight: 0,
				opacity: 1,
				fillOpacity: 0.8
			})
				.bindPopup(createPopupContent(item))
				.on('click', () => {
					selectMarker(marker, item);
					handleMarkerClick(item);
					currentPopup = marker.getPopup();
				})
				.addTo(map);
			markers.push(marker);
		}
		console.log('🗺️ [Statistics] Total markers added:', markers.length);
	}

	// --- Geocode fetching function ---
	async function fetchGeocodeForPoint(item: TrackerLocation) {
		try {
			// Get current session
			const { data: { session }, error: sessionError } = await supabase.auth.getSession();
			if (sessionError || !session) {
				throw new Error('User not authenticated');
			}

			const serviceAdapter = new ServiceAdapter({ session });

			// Use the tracker-data-with-mode endpoint to get geocode data for this specific point
			const result = await serviceAdapter.edgeFunctionsService.getTrackerDataWithMode(session, {
				startDate: item.recorded_at.split('T')[0],
				endDate: item.recorded_at.split('T')[0],
				limit: 1,
				offset: 0,
				includeStatistics: false
			}) as any;

			// Find the matching point
			const matchingPoint = result.locations?.find((loc: any) =>
				loc.recorded_at === item.recorded_at &&
				loc.location?.coordinates?.[1] === item.coordinates.lat &&
				loc.location?.coordinates?.[0] === item.coordinates.lng
			);

			return matchingPoint?.geocode || null;
		} catch (error) {
			console.error('Error fetching geocode:', error);
			return null;
		}
	}

	// --- Marker click handler ---
	async function handleMarkerClick(item: TrackerLocation) {
		if (!item.geocode) {
			item.geocode = 'loading';
			// Re-render tooltip with loading state
			if (currentPopup) {
				currentPopup.setContent(createPopupContent(item));
			}

			try {
				const geocode = await fetchGeocodeForPoint(item);
				item.geocode = geocode;
				// Re-render tooltip with geocode data
				if (currentPopup) {
					currentPopup.setContent(createPopupContent(item));
				}
			} catch (error) {
				console.error('Failed to fetch geocode:', error);
				item.geocode = { error: true };
				if (currentPopup) {
					currentPopup.setContent(createPopupContent(item));
				}
			}
		}
	}

	// --- Format reverse geocode function ---
	function formatReverseGeocode(rg: GeocodeData | string | null): string {
		let data = rg;
		if (typeof rg === 'string') {
			try {
				data = JSON.parse(rg);
			} catch {
				return `<pre class='bg-gray-100 rounded-lg p-2 text-xs overflow-x-auto border border-gray-200'>${rg}</pre>`;
			}
		}

		if (data && typeof data === 'object' && 'error' in data && typeof data.error !== 'undefined') {
			return `<div class='bg-red-50 border border-red-200 rounded-lg p-2 text-xs'>
				<div class='text-red-800 font-semibold mb-1 text-xs'>Geocoding Error</div>
				<div class='text-red-700 text-xs'>${(data as GeocodeData).error_message || 'Unknown error occurred during geocoding'}</div>
				<div class='text-red-600 text-xs mt-1'>Timestamp: ${(data as GeocodeData).timestamp || 'Unknown'}</div>
			</div>`;
		}

		const props = (data as GeocodeData).properties || (data as GeocodeData).address || data;
		if (!props || typeof props !== 'object') {
			return `<pre class='bg-gray-100 rounded-lg p-2 text-xs overflow-x-auto border border-gray-200'>${JSON.stringify(rg, null, 2)}</pre>`;
		}

		const allFields = Object.entries(props)
			.filter(([, value]) => value !== null && value !== undefined && value !== '')
			.map(([key, value]) => {
				const formattedKey = key
					.replace(/([A-Z])/g, ' $1')
					.replace(/^./, str => str.toUpperCase())
					.replace(/_/g, ' ')
					.trim();
				return [formattedKey, value];
			})
			.sort(([a], [b]) => (a as string).localeCompare(b as string));

		// Always append class and type if present on the geocode object itself
		const extraRows: string[] = [];
		if ((data as GeocodeData).class) {
			extraRows.push(`<tr><td class='pr-2 text-gray-600 align-top py-0.5 text-xs font-medium'>Class:</td><td class='text-gray-900 py-0.5 text-xs'>${(data as GeocodeData).class}</td></tr>`);
		}
		if ((data as GeocodeData).type) {
			extraRows.push(`<tr><td class='pr-2 text-gray-600 align-top py-0.5 text-xs font-medium'>Type:</td><td class='text-gray-900 py-0.5 text-xs'>${(data as GeocodeData).type}</td></tr>`);
		}

		const rows = allFields
			.map(
				([k, v]) =>
					`<tr><td class='pr-2 text-gray-600 align-top py-0.5 text-xs font-medium'>${k}:</td><td class='text-gray-900 py-0.5 text-xs'>${v}</td></tr>`
			)
			.join('') + extraRows.join('');

		if (rows) {
			return `<table class='bg-gray-50 rounded-lg p-2 w-full border border-gray-200'><tbody>${rows}</tbody></table>`;
		}

		return `<pre class='bg-gray-100 rounded-lg p-2 text-xs overflow-x-auto border border-gray-200'>${JSON.stringify(props, null, 2)}</pre>`;
	}

	// --- Updated tooltip content ---
	function createPopupContent(item: TrackerLocation) {
		const date = item.recorded_at || item.created_at;
		const formattedDate = date ? format(new Date(date), 'MMM d, yyyy HH:mm') : 'Unknown date';
		const transportMode = item.transport_mode || 'unknown';

		let content = `
			<div class="p-2 max-w-lg">
				<!-- Header with location name -->
				<div class="mb-2">
					<h3 class="font-bold text-sm text-gray-900 leading-tight">${item.name || 'Data Point'}</h3>
				</div>
				<!-- Point details in a more compact layout -->
				<div class="space-y-1 mb-2">
					<div class="flex justify-between items-center py-0.5">
						<span class="text-gray-600 text-xs">Date:</span>
						<span class="font-medium text-gray-900 text-xs">${formattedDate}</span>
					</div>
					<div class="flex justify-between items-center py-0.5">
						<span class="text-gray-600 text-xs">Mode:</span>
						<span class="font-medium capitalize text-gray-900 text-xs">${transportMode}</span>
					</div>
					<div class="flex justify-between items-center py-0.5">
						<span class="text-gray-600 text-xs">Reason:</span>
						<span class="font-medium text-gray-900 text-xs">${item.detectionReason ? getTransportDetectionReasonLabel(item.detectionReason) : 'N/A'}</span>
					</div>
					<div class="flex justify-between items-center py-0.5">
						<span class="text-gray-600 text-xs">Coordinates:</span>
						<span class="font-medium text-gray-900 text-xs">${typeof item.coordinates?.lat === 'number' && typeof item.coordinates?.lng === 'number' ? `${item.coordinates.lat.toFixed(6)}, ${item.coordinates.lng.toFixed(6)}` : 'N/A'}</span>
					</div>
					<div class="flex justify-between items-center py-0.5">
						<span class="text-gray-600 text-xs">Velocity:</span>
						<span class="font-medium text-gray-900 text-xs">${item.velocity !== null && item.velocity !== undefined ? (typeof item.velocity === 'number' ? item.velocity.toFixed(2) + ' km/h' : item.velocity + ' km/h') : 'N/A'}</span>
					</div>
					<div class="flex justify-between items-center py-0.5">
						<span class="text-gray-600 text-xs">Distance from prev:</span>
						<span class="font-medium text-gray-900 text-xs">${typeof item.distance_from_prev === 'number' ? item.distance_from_prev.toFixed(1) + ' m' : 'N/A'}</span>
					</div>
				</div>
				<!-- Geocode section -->
				${item.geocode === 'loading' ? `<div class='mt-1 p-1 bg-blue-50 rounded text-blue-700 text-xs'>Loading geocode...</div>` : ''}
				${item.geocode && typeof item.geocode === 'object' && item.geocode !== null && (!('error' in item.geocode) || !(item.geocode as GeocodeData).error) ? `<div class='mt-1'><span class='block text-gray-700 font-semibold mb-1 text-xs'>Location Details:</span>${formatReverseGeocode(item.geocode)}</div>` : ''}
				${item.geocode && typeof item.geocode === 'object' && item.geocode !== null && 'error' in item.geocode && (item.geocode as GeocodeData).error ? `<div class='mt-1 p-1 bg-red-50 rounded text-red-700 text-xs'>Failed to load geocode</div>` : ''}
			</div>
		`;
		return content;
	}

	// Helper function to get color for different types
	function getTypeColor(type: string): string {
		switch (type) {
			case 'tracker':
				return 'bg-green-500';
			case 'poi':
				return 'bg-yellow-500';
			case 'location':
				return 'bg-blue-500';
			default:
				return 'bg-gray-500';
		}
	}

	function clearMapMarkers() {
		markers.forEach((marker) => {
			if (map) {
				map.removeLayer(marker);
			}
		});
		markers = [];

		polylines.forEach((polyline) => {
			if (map) {
				map.removeLayer(polyline);
			}
		});
		polylines = [];

		// Clear selected markers
		selectedMarkers = [];
	}

	function toggleEditMode() {
		isEditMode = !isEditMode;
		if (!isEditMode) {
			// Clear selections when exiting edit mode
			deselectAllMarkers();
		}
	}

	function selectMarker(marker: any, item: TrackerLocation) {
		if (!isEditMode) return;

		if (selectedMarkers.includes(marker)) {
			// Deselect
			selectedMarkers = selectedMarkers.filter((m) => m !== marker);
			marker.setStyle({ radius: 3, fillOpacity: 0.6 });
		} else {
			// Select
			selectedMarkers.push(marker);
			marker.setStyle({ radius: 5, fillOpacity: 0.9, weight: 2, color: '#ff0000' });
		}
	}

	function deselectAllMarkers() {
		// Color map for transport modes
		const modeColors: Record<string, string> = {
			car: '#ef4444', // red
			train: '#a21caf', // purple
			airplane: '#000000', // black
			cycling: '#f59e42', // orange
			walking: '#10b981', // green
			unknown: '#6b7280' // gray
		};

		selectedMarkers.forEach((marker) => {
			const transportMode = (marker as any).item?.transport_mode || 'unknown';
			const markerColor = modeColors[transportMode] || '#6b7280';
			marker.setStyle({
				radius: 3,
				fillColor: markerColor,
				fillOpacity: 0.6,
				weight: 0,
				color: 'transparent'
			});
		});
		selectedMarkers = [];
	}

	async function deleteSelectedPoints() {
		if (selectedMarkers.length === 0) return;

		if (!confirm(`Are you sure you want to delete ${selectedMarkers.length} selected point(s)?`)) {
			return;
		}

		try {
			// Get the items associated with selected markers
			const itemsToDelete = selectedMarkers.map((marker) => marker.item).filter(Boolean);

			// Remove markers from map
			selectedMarkers.forEach((marker) => {
				if (map) {
					map.removeLayer(marker);
				}
				markers = markers.filter((m) => m !== marker);
			});

			// Clear selection
			selectedMarkers = [];

			// Remove from location data
			locationData = locationData.filter(
				(item) => !itemsToDelete.some((deletedItem) => deletedItem.id === item.id)
			);

			toast.success(`Deleted ${itemsToDelete.length} point(s)`);
		} catch (error) {
			console.error('Error deleting points:', error);
			toast.error('Failed to delete points');
		}
	}

	async function createTripFromSelected() {
		if (selectedMarkers.length < 2) {
			toast.error('Please select at least 2 points to create a trip');
			return;
		}

		try {
			// Sort selected points by timestamp
			const selectedItems = selectedMarkers
				.map((marker) => marker.item)
				.filter(Boolean)
				.sort((a, b) => {
					const dateA = new Date(a.recorded_at || a.created_at).getTime();
					const dateB = new Date(b.recorded_at || b.created_at).getTime();
					return dateA - dateB;
				});

			// Create trip data
			const tripData = {
				startPoint: selectedItems[0],
				endPoint: selectedItems[selectedItems.length - 1],
				points: selectedItems,
				startTime: selectedItems[0].recorded_at || selectedItems[0].created_at,
				endTime:
					selectedItems[selectedItems.length - 1].recorded_at ||
					selectedItems[selectedItems.length - 1].created_at
			};

			toast.success(`Created trip with ${selectedItems.length} points`);

			// Note: Trip creation functionality to be implemented in future version
		} catch (error) {
			console.error('Error creating trip:', error);
			toast.error('Failed to create trip');
		}
	}

	function fitMapToMarkers() {
		if (!map || (markers.length === 0 && polylines.length === 0)) return;

		const allLayers = [...markers, ...polylines];
		const group = L.featureGroup(allLayers);
		map.fitBounds(group.getBounds(), { padding: [20, 20] });
	}

	// Track last filter state to prevent infinite loops
	let lastFilterState = '';

	// Watch for date changes and reload data
	$: if (browser) {
		const filterState = {
			startDate: getDateObject(state.filtersStartDate)?.toISOString().split('T')[0] || '',
			endDate: getDateObject(state.filtersEndDate)?.toISOString().split('T')[0] || ''
		};

		const filterStateString = JSON.stringify(filterState);

		// Only reload if we have some filter applied and the state actually changed
		if ((filterState.startDate || filterState.endDate) && filterStateString !== lastFilterState) {
			lastFilterState = filterStateString;
			loadLocationData(true);
		}
	}



	// Haversine formula to calculate distance between two lat/lng points
	function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
		const R = 6371e3; // metres
		const toRad = (x: number) => (x * Math.PI) / 180;
		const φ1 = toRad(lat1);
		const φ2 = toRad(lat2);
		const Δφ = toRad(lat2 - lat1);
		const Δλ = toRad(lon2 - lon1);
		const a =
			Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
			Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return R * c; // in metres
	}

	// Calculate velocity based on time difference and distance between current and previous point
	function calculateVelocity(
		currentPoint: TrackerLocation,
		allPoints: TrackerLocation[]
	): { velocity: number | null; timeDiff: number | null; distance: number | null } {
		if (!currentPoint || !allPoints || allPoints.length < 2) {
			return { velocity: null, timeDiff: null, distance: null };
		}

		// Find the current point's index in the sorted array
		const sortedPoints = allPoints
			.filter((item) => item.type === 'tracker' && item.coordinates)
			.sort(
				(a, b) =>
					new Date(a.recorded_at || a.created_at).getTime() -
					new Date(b.recorded_at || b.created_at).getTime()
			);

		const currentIndex = sortedPoints.findIndex(
			(point) =>
				point.id === currentPoint.id ||
				(point.recorded_at === currentPoint.recorded_at &&
					point.coordinates?.lat === currentPoint.coordinates?.lat &&
					point.coordinates?.lng === currentPoint.coordinates?.lng)
		);

		if (currentIndex <= 0) {
			return { velocity: null, timeDiff: null, distance: null };
		}

		const previousPoint = sortedPoints[currentIndex - 1];
		const currentTime = new Date(currentPoint.recorded_at || currentPoint.created_at).getTime();
		const previousTime = new Date(previousPoint.recorded_at || previousPoint.created_at).getTime();

		// Calculate time difference in seconds
		const timeDiff = (currentTime - previousTime) / 1000;

		if (timeDiff <= 0) {
			return { velocity: null, timeDiff: null, distance: null };
		}

		// Calculate distance in meters
		const distance = haversineDistance(
			previousPoint.coordinates.lat,
			previousPoint.coordinates.lng,
			currentPoint.coordinates.lat,
			currentPoint.coordinates.lng
		);

		// Calculate velocity in m/s
		const velocity = distance / timeDiff;

		return { velocity, timeDiff, distance };
	}

	// Reactive total distance calculation
	$: totalDistance = (() => {
		const points = locationData.filter((item) => item.type === 'tracker' && item.coordinates);
		let distance = 0;
		for (let i = 1; i < points.length; i++) {
			const prev = points[i - 1].coordinates;
			const curr = points[i].coordinates;
			distance += haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
		}
		return distance; // in meters
	})();

	// Helper to determine if loading more (not initial load)
	$: isLoadingMore = isLoading && !isInitialLoad;



	// Function to get total count of records for progress indication
	async function getTotalCount(): Promise<number> {
		try {
			isCountingRecords = true;
			loadingStage = 'Counting records...';
			loadingProgress = 10;

			const startDate = state.filtersStartDate
				? getDateObject(state.filtersStartDate)?.toISOString().split('T')[0]
				: '';
			const endDate = state.filtersEndDate
				? getDateObject(state.filtersEndDate)?.toISOString().split('T')[0]
				: '';

			const { data: { session }, error: sessionError } = await supabase.auth.getSession();
			if (sessionError || !session) {
				throw new Error('User not authenticated');
			}

			const serviceAdapter = new ServiceAdapter({ session });

			// Use a separate count-only call to avoid affecting data loading
			const result = await serviceAdapter.edgeFunctionsService.getTrackerDataWithMode(session, {
				startDate,
				endDate,
				limit: 1, // Just get 1 record to get the total count
				offset: 0,
				includeStatistics: false
			}) as { total?: number; hasMore?: boolean };

			// Check if the result indicates an error
			if (result && typeof result === 'object' && 'success' in result && !result.success) {
				console.warn('Edge Function returned error for count:', (result as any).error);
				return 0;
			}

			const total = result.total || 0;

			loadingProgress = 20;
			loadingStage = `Found ${total.toLocaleString()} records`;

			return total;
		} catch (err) {
			console.error('Error getting total count:', err);
			// Return 0 for new users or when there's an error, don't throw
			return 0;
		} finally {
			isCountingRecords = false;
		}
	}

	// Function to fetch both map data and statistics from the edge function
	async function fetchMapDataAndStatistics(forceRefresh = false, loadMoreOffset = 0): Promise<void> {
		console.log('🔍 fetchMapDataAndStatistics called with:', { forceRefresh, loadMoreOffset });

		try {
			statisticsLoading = true;
			statisticsError = '';

			// If this is the initial load, get the total count first for progress indication
			if (loadMoreOffset === 0) {
				loadingStage = 'Getting record count...';
				loadingProgress = 5;
				totalPoints = await getTotalCount();
			}

			const startDate = state.filtersStartDate
				? getDateObject(state.filtersStartDate)?.toISOString().split('T')[0]
				: '';
			const endDate = state.filtersEndDate
				? getDateObject(state.filtersEndDate)?.toISOString().split('T')[0]
				: '';

			console.log('📅 Date range being sent to API:', { startDate, endDate });
			console.log('📅 Raw state dates:', {
				startDate: state.filtersStartDate,
				endDate: state.filtersEndDate
			});

			// Get current user's session
			const { data: { session }, error: sessionError } = await supabase.auth.getSession();
			if (sessionError || !session) {
				console.error('Session error:', sessionError);
				console.error('Session data:', session);
				throw new Error('User not authenticated');
			}

			console.log('Session valid:', !!session?.access_token);
			console.log('Session expires at:', session?.expires_at);

			// Update progress for data fetching
			loadingStage = loadMoreOffset === 0 ? 'Loading initial data...' : 'Loading more data...';
			loadingProgress = loadMoreOffset === 0 ? 30 : 60;

			const serviceAdapter = new ServiceAdapter({ session });

			type TrackerApiResponse = {
				total?: number;
				locations?: TrackerLocation[];
				hasMore?: boolean;
				statistics?: StatisticsData;
			};


			// Try with date filters first, then without if no data
			let result = await serviceAdapter.edgeFunctionsService.getTrackerDataWithMode(session, {
				startDate,
				endDate,
				limit: 5000,
				offset: loadMoreOffset,
				includeStatistics: loadMoreOffset === 0
			}) as TrackerApiResponse;

			console.log('📊 Full API Response:', result);
			console.log('📊 Response keys:', Object.keys(result || {}));
			console.log('📊 Total count:', result.total);
			console.log('📊 Has locations:', !!result.locations);
			console.log('📊 Locations count:', result.locations?.length || 0);

			// Check if the result indicates an error
			if (result && typeof result === 'object' && 'success' in result && !result.success) {
				throw new Error((result as any).error || 'Failed to fetch data');
			}

						// Note: totalPoints is already set from getTotalCount() for progress indication
			// The actual data loading is independent of the count

			// Update progress for data processing
			loadingStage = 'Processing data...';
			loadingProgress = loadMoreOffset === 0 ? 70 : 80;

			// Set statistics data (only for initial load)
			if (result.statistics && loadMoreOffset === 0) {
				console.log('📊 Setting statistics data:', result.statistics);
				statisticsData = result.statistics;
			} else {
				console.log('📊 No statistics in result. Result keys:', Object.keys(result || {}));
				console.log('📊 Statistics field:', result.statistics);
			}

			// Transform and set location data for map
			if (result.locations) {
				console.log('🗺️ Raw locations data:', result.locations);
				console.log('🗺️ Number of locations:', result.locations.length);

				loadingStage = 'Transforming data...';
				loadingProgress = loadMoreOffset === 0 ? 85 : 90;

				const transformedLocations: TrackerLocation[] = (result.locations as unknown[]).map((location, index) => {
					const loc = location as Record<string, unknown>;

					return {
						id: `${loc.user_id}_${loc.recorded_at}_${loadMoreOffset + index}`,
						name: (loc.geocode && typeof loc.geocode === 'object' && 'display_name' in loc.geocode)
							? (loc.geocode as GeocodeData).display_name || 'Unknown Location'
							: 'Unknown Location',
						description: (loc.geocode && typeof loc.geocode === 'object' && 'name' in loc.geocode)
							? (loc.geocode as GeocodeData).name || ''
							: '',
						type: 'tracker',
						coordinates: (() => {
							const coords = (loc.location as { coordinates?: number[] })?.coordinates;
							if (coords && coords.length >= 2) {
								const result = {
									lat: coords[1] || 0,
									lng: coords[0] || 0
								};
								return result;
							} else {
								return { lat: 0, lng: 0 };
							}
						})(),
						city: (loc.geocode && typeof loc.geocode === 'object' && 'city' in loc.geocode)
							? (loc.geocode as GeocodeData).city || ''
							: '',
						created_at: String(loc.created_at),
						updated_at: String(loc.updated_at),
						recorded_at: String(loc.recorded_at),
						altitude: loc.altitude as number | undefined,
						accuracy: loc.accuracy as number | undefined,
						speed: loc.speed as number | undefined,
						transport_mode: String(loc.transport_mode || 'unknown'),
						detectionReason: loc.detectionReason as TransportDetectionReason | string | undefined,
						velocity: loc.velocity as number | undefined,
						distance_from_prev: loc.distance_from_prev as number | undefined,
						geocode: loc.geocode as GeocodeData | string | null
					};
				});



				if (loadMoreOffset === 0) {
					// Initial load - replace all data
					locationData = transformedLocations;
					console.log('🗺️ Set locationData to:', transformedLocations.length, 'items');
					addMarkersToMap(transformedLocations, true);
					if (transformedLocations.length > 0) {
						fitMapToMarkers();
					}
				} else {
					// Load more - append to existing data
					locationData = [...locationData, ...transformedLocations];
					console.log('🗺️ Appended to locationData, total:', locationData.length, 'items');
					addMarkersToMap(transformedLocations, false);
				}

				// Only update totalPoints if we have a valid total from the result
				// This prevents overwriting the count from getTotalCount() with 0
				if (result.total && result.total > 0) {
					totalPoints = result.total;
				}
				hasMoreData = result.hasMore || false;
				currentOffset = locationData.length;
			}

			// Complete loading
			loadingStage = 'Complete!';
			loadingProgress = 100;

		} catch (err) {
			console.error('Error fetching map data and statistics:', err);
			statisticsError = err instanceof Error ? err.message : String(err);
			if (loadMoreOffset === 0) {
				statisticsData = null;
			}
			loadingStage = 'Error occurred';
			loadingProgress = 0;
		} finally {
			statisticsLoading = false;
			// Reset progress after a short delay
			setTimeout(() => {
				loadingProgress = 0;
				loadingStage = '';
			}, 1000);
		}
	}

	// Function to fetch statistics data from backend API (kept for backward compatibility)
	async function fetchStatisticsData(forceRefresh = false) {
		// Redirect to the new combined function
		await fetchMapDataAndStatistics(forceRefresh, 0);
	}

	// Function to load more data points
	async function loadMoreData() {
		if (isLoading) return;

		isLoading = true;
		try {
			console.log(`Loading more data from offset ${currentOffset}`);
			await fetchMapDataAndStatistics(false, currentOffset);
		} catch (error) {
			console.error('Error loading more data:', error);
			toast.error('Failed to load more data');
		} finally {
			isLoading = false;
		}
	}

	// Move this to the top-level scope, outside of getStatistics
	function formatEarthCircumferences(value: number | undefined): string {
		if (value == null) return '';
		if (typeof value === 'string') value = parseFloat(value);
		if (value > 0 && value < 0.001) {
			return value.toExponential(2) + 'x';
		} else if (value < 1 && value > 0) {
			return value.toFixed(4) + 'x';
		} else {
			return value.toFixed(3) + 'x';
		}
	}

	// Move greenModes to a higher scope
	const greenModes = ['walking', 'cycling', 'train'];

	// Function to get statistics for display
	function getStatistics() {
		if (!statisticsData) return [];

		// Helper to sum green distances
		function getGreenDistance() {
			if (!statisticsData || !statisticsData.transport) return 0;
			return statisticsData.transport
				.filter((t: { mode: string }) => greenModes.includes(t.mode))
				.reduce((sum: number, t: { distance: number }) => sum + (typeof t.distance === 'number' ? t.distance : 0), 0);
		}

		const greenDistance = getGreenDistance();

		return [
			{
				id: 1,
				title: 'Total Distance',
				value: statisticsData.totalDistance ?? '0 km',
				icon: Navigation,
				color: 'blue'
			},
			{
				id: 'green',
				title: 'Distance Travelled Green',
				value: greenDistance > 0 ? `${greenDistance.toLocaleString(undefined, { maximumFractionDigits: 1 })} km` : '0 km',
				icon: Activity,
				color: 'green'
			},
			{
				id: 2,
				title: 'Earth Circumferences',
				value: formatEarthCircumferences(statisticsData.earthCircumferences),
				icon: Globe2,
				color: 'blue'
			},
			{
				id: 3,
				title: 'Geopoints Tracked',
				value: statisticsData.geopoints?.toLocaleString() ?? '0',
				icon: MapPin,
				color: 'blue'
			},
			{
				id: 4,
				title: 'Time Moving',
				value: statisticsData.timeSpentMoving ?? '0h',
				icon: Clock,
				color: 'blue'
			},
			{
				id: 5,
				title: 'Unique Places',
				value: statisticsData.uniquePlaces?.toLocaleString() ?? '0',
				icon: Flag,
				color: 'blue'
			},
			{
				id: 6,
				title: 'Countries Visited',
				value: statisticsData.countriesVisited?.toString() ?? '0',
				icon: Globe2,
				color: 'blue'
			},
						{
				id: 7,
				title: 'Approximate Steps',
				value: statisticsData.steps?.toLocaleString() ?? '0',
				icon: Footprints,
				color: 'blue'
			}
		];
	}



	// Function to format segment duration
	function formatSegmentDuration(seconds: number): string {
		if (!seconds || isNaN(seconds)) return '0:00';
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		if (h > 0) {
			return `${h}:${m.toString().padStart(2, '0')}`;
		}
		return `${m}:00`;
	}



	// Watch for date changes and reload statistics
	$: if (state.filtersStartDate && state.filtersEndDate && !isInitializing) {
		if (map) {
			// Only reload if map is initialized, both dates are selected, and not during initial setup
			fetchMapDataAndStatistics(true, 0); // Force refresh when both dates are selected
		}
	}

	// Country name translation is now handled by the centralized i18n system

	// Helper to get flag emoji from country code
	function getFlagEmoji(countryCode: string): string {
		if (!countryCode || countryCode.length !== 2) return '';
		const codePoints = countryCode
			.toUpperCase()
			.split('')
			.map((char) => 0x1f1e6 + char.charCodeAt(0) - 65);
		return String.fromCodePoint(...codePoints);
	}

	// Add a helper to format seconds as hh:mm:ss
	function formatTime(seconds: number | undefined): string {
		if (!seconds || isNaN(seconds)) return '0:00:00';
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	}





	onDestroy(() => {
		clearMapMarkers();
	});



	onMount(async () => {
		console.log('🗺️ Statistics page onMount started');

		L = (await import('leaflet')).default;
		if (map) return;

		// Small delay to ensure container is ready
		await new Promise((resolve) => setTimeout(resolve, 100));

		map = L.map(mapContainer, {
			center: [20, 0], // Default center of the world
			zoom: 2, // Default zoom level to show the world
			zoomControl: true,
			attributionControl: false
		});

		// Invalidate map size to ensure proper rendering
		setTimeout(() => {
			if (map) {
				map.invalidateSize();
			}
		}, 200);

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

		// --- Theme switching observer ---
		const updateMapTheme = () => {
			if (!map || !L) return;
			const isDark = document.documentElement.classList.contains('dark');
			const newUrl = getTileLayerUrl();
			const newAttribution = getAttribution();
			if (currentTileLayer && currentTileLayer._url !== newUrl) {
				map.removeLayer(currentTileLayer);
				currentTileLayer = L.tileLayer(newUrl, { attribution: newAttribution }).addTo(map);
			}
			// Update legend text color
			const legend = document.getElementById('transport-mode-legend');
			if (legend) {
				const title = legend.querySelector('div.font-semibold');
				if (title) {
					title.classList.toggle('text-gray-700', !isDark);
					title.classList.toggle('dark:text-gray-200', isDark);
					title.classList.toggle('text-white', isDark);
				}
				// Set all legend text to white in dark mode
				legend.classList.toggle('text-white', isDark);
				legend.classList.toggle('text-gray-700', !isDark);
				legend.classList.toggle('bg-white', !isDark);
				legend.classList.toggle('dark:bg-gray-800', isDark);
			}
		};
		const observer = new MutationObserver(updateMapTheme);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		// Initial theme sync
		updateMapTheme();

		// Add transport mode legend to the map
		const legendId = 'transport-mode-legend';
		let legend = document.getElementById(legendId);
		if (!legend) {
			legend = document.createElement('div');
			legend.id = legendId;
			legend.className =
				'leaflet-control leaflet-bar bg-white dark:bg-gray-800 p-3 rounded shadow text-gray-900 dark:text-gray-100';
			legend.style.position = 'absolute';
			legend.style.top = '90px';
			legend.style.left = '10px';
			legend.style.zIndex = '1000';
			legend.innerHTML = `
				<div class="font-semibold mb-2 text-xs text-gray-900 dark:text-gray-100">Mode Colors</div>
				<div class="flex flex-col gap-1">
					<div class="flex items-center gap-2 text-gray-900 dark:text-gray-100"><span style="display:inline-block;width:16px;height:4px;background:#ef4444;"></span>Car</div>
					<div class="flex items-center gap-2 text-gray-900 dark:text-gray-100"><span style="display:inline-block;width:16px;height:4px;background:#a21caf;"></span>Train</div>
					<div class="flex items-center gap-2 text-gray-900 dark:text-gray-100"><span style="display:inline-block;width:16px;height:4px;background:#000000;"></span>Airplane</div>
					<div class="flex items-center gap-2 text-gray-900 dark:text-gray-100"><span style="display:inline-block;width:16px;height:4px;background:#f59e42;"></span>Cycling</div>
					<div class="flex items-center gap-2 text-gray-900 dark:text-gray-100"><span style="display:inline-block;width:16px;height:4px;background:#10b981;"></span>Walking</div>
					<div class="flex items-center gap-2 text-gray-900 dark:text-gray-100"><span style="display:inline-block;width:16px;height:4px;background:#6b7280;"></span>Unknown</div>
				</div>
			`;
			map.getContainer().appendChild(legend);
		}

		// Set default date range to last 7 days if not already set
		if (!state.filtersStartDate || !state.filtersEndDate) {
			const today = new Date();
			const sevenDaysAgo = new Date();
			sevenDaysAgo.setDate(today.getDate() - 6); // Last 7 days includes today and 6 days before
			state.filtersStartDate = sevenDaysAgo;
			state.filtersEndDate = today;
			console.log('📅 Set default date range:', { start: sevenDaysAgo, end: today });

						// Load initial data only when we set default dates
			console.log('🗺️ About to call fetchMapDataAndStatistics with default dates');
			await fetchMapDataAndStatistics(false, 0); // Allow cache for initial load
			console.log('🗺️ fetchMapDataAndStatistics completed');
		} else {
			console.log('📅 Using existing date range:', { start: state.filtersStartDate, end: state.filtersEndDate });

			// Debug: Check if the date range makes sense
			const startDate = state.filtersStartDate;
			const endDate = state.filtersEndDate;
			console.log('📅 Date range debug:', {
				startDate: startDate?.toISOString(),
				endDate: endDate?.toISOString(),
				startDateType: typeof startDate,
				endDateType: typeof endDate,
				isStartDateValid: startDate instanceof Date && !isNaN(startDate.getTime()),
				isEndDateValid: endDate instanceof Date && !isNaN(endDate.getTime())
			});

			// Load initial data only if dates are already set
			console.log('🗺️ About to call fetchMapDataAndStatistics with existing dates');
			await fetchMapDataAndStatistics(false, 0); // Allow cache for initial load
			console.log('🗺️ fetchMapDataAndStatistics completed');
		}

		// Mark initialization as complete
		isInitializing = false;
	});
</script>

<svelte:head>
	<link
		rel="stylesheet"
		href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
		integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
		crossorigin=""
	/>
	<style>
		.custom-marker {
			background: transparent !important;
			border: none !important;
		}

		/* Override the CSS variable for dark mode */
		:global(.dark) {
			--color-white: var(--color-gray-800);
		}
		.date-field .icon-calendar {
			background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAABYlAAAWJQFJUiTwAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAEmSURBVHgB7ZcPzcIwEMUfXz4BSCgKwAGgACRMAg6YBBxsOMABOAAHFAXgAK5Z2Y6lHbfQ8SfpL3lZaY/1rb01N+BHUKSMNBfEJjZWISA56Uo6C2KvVpkgFn9oRx9vICFtUT1JKO3tvRtZdjBxXQs+YY+1FenIfuesPUGVVLzfRWKvmrSzbbN19wS+kAb2+sCEuUxrYzkbe4YvCVM2Vr5NPAkVa+van7Wn38U95uTpN5TJ/A8ZKemAakmbmJJGpI0gVmwA0huieFItjG19DgTHtwIZhCfZq3ztCuzQYh+FKBSvusjAGs8PnLYkLgMf34JoIBqIBqKBaIAb0Kw9RlhMCTbzzPWAqYq7LsuPaGDUsYmznaOk5zChUJTNQ4TFVMkrOL4HPsoNn26PxROHCggAAAAASUVORK5CYII=)
				no-repeat center center;
			background-size: 14px 14px;
			height: 14px;
			width: 14px;
		}

		/* Map interaction fixes */
		.leaflet-container {
			pointer-events: auto !important;
			touch-action: manipulation !important;
		}

		.leaflet-pane {
			pointer-events: auto !important;
		}

		.leaflet-control {
			pointer-events: auto !important;
		}

		/* Ensure map container doesn't interfere with mouse events */
		.map-container {
			pointer-events: auto !important;
			touch-action: manipulation !important;
		}
	</style>
</svelte:head>

<svelte:window on:click={handleClickOutside} />

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col justify-between gap-4 md:flex-row md:items-start">
		<div class="flex min-w-0 items-center gap-2">
			<BarChart class="h-8 w-8 flex-shrink-0 text-blue-600 dark:text-gray-400" />
			<h1 class="text-3xl font-bold whitespace-nowrap text-gray-900 dark:text-gray-100">
				Statistics
			</h1>
		</div>
		<div class="flex flex-1 items-center justify-end gap-6" style="z-index: 2001;">
			<div class="relative">
				<button
					type="button"
					class="date-field flex w-full cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-left text-sm shadow border border-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
					on:click={toggleDatePicker}
					on:keydown={(e) => e.key === 'Enter' && toggleDatePicker()}
					class:open={isOpen}
					aria-label="Select date range"
					aria-expanded={isOpen}
				>
					<i class="icon-calendar"></i>
					<div class="date">
						{#if state.filtersStartDate}
							{formattedStartDate} - {formattedEndDate}
						{:else}
							Pick a date range
						{/if}
					</div>
				</button>
				{#if isOpen}
					<div class="date-picker-container absolute right-0 mt-2 z-50">
						<DatePicker
							bind:isOpen
							bind:startDate={state.filtersStartDate}
							bind:endDate={state.filtersEndDate}
							isRange
							showPresets
							align="right"
							class="dark-datepicker"
						/>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Map -->
	<div
		class="relative h-96 w-full rounded-lg bg-gray-100 md:h-[600px] dark:bg-gray-900 {isEditMode ? 'cursor-pointer ring-4 ring-blue-400' : ''}"
		style={isEditMode ? 'cursor: pointer;' : ''}
	>
		{#if isLoading}
			<div class="absolute inset-0 z-[2000] flex flex-col items-center justify-center bg-white/70 dark:bg-gray-900/70">
				<Loader2 class="h-16 w-16 animate-spin text-blue-500 dark:text-blue-300" />
				<div class="mt-4 text-center">
					<div class="text-lg font-medium text-gray-700 dark:text-gray-200 mb-2">
						{loadingStage || 'Loading...'}
					</div>
					{#if loadingProgress > 0}
						<div class="w-64 bg-gray-200 rounded-full h-2 mb-2 dark:bg-gray-700">
							<div
								class="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
								style="width: {loadingProgress}%"
							></div>
						</div>
						<div class="text-sm text-gray-600 dark:text-gray-400">
							{loadingProgress}% complete
						</div>
					{/if}
					{#if totalPoints > 0}
						<div class="text-sm text-gray-500 dark:text-gray-400 mt-1">
							{locationData.length} of {totalPoints.toLocaleString()} points loaded
						</div>
					{/if}
				</div>
			</div>
		{/if}
		{#if isEditMode}
			<div
				class="absolute top-0 left-0 z-[1100] w-full bg-blue-500 py-2 text-center font-semibold text-white shadow-lg"
			>
				Edit mode: Click points to select. Use the buttons to delete or create a trip.
			</div>
		{/if}
		<div
			bind:this={mapContainer}
			class="map-container h-full w-full"
			style="pointer-events: auto; touch-action: manipulation;"
		></div>

		<!-- No Data Message -->
		{#if !isLoading && !isInitialLoad && locationData.length === 0}
			<div
				class="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80"
				style="pointer-events: none;"
			>
				<div class="text-center" style="pointer-events: none;">
					<MapPin
						class="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500"
						style="pointer-events: none;"
					/>
					<h3
						class="mb-2 text-lg font-semibold text-gray-700 dark:text-gray-300"
						style="pointer-events: none;"
					>
						No location data found
					</h3>
					<p class="mb-4 text-sm text-gray-500 dark:text-gray-400" style="pointer-events: none;">
						Import your travel data to see your locations on the map
					</p>
					<a
						href="/dashboard/import-export"
						class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
						style="pointer-events: auto;"
					>
						<Import class="h-4 w-4" style="pointer-events: none;" />
						Import Data
					</a>
				</div>
			</div>
		{/if}

		<!-- Edit Controls -->
		<div class="absolute top-4 right-4 z-[1001] flex flex-col gap-2">
			<button
									on:click={toggleEditMode}
				class="rounded bg-white p-2 shadow transition-colors hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
				class:bg-blue-100={isEditMode}
				class:dark:bg-blue-900={isEditMode}
				title={isEditMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
			>
				<Edit class="h-4 w-4 text-gray-700 dark:text-gray-300" />
			</button>

			{#if isEditMode && selectedMarkers.length > 0}
				<button
					on:click={deleteSelectedPoints}
					class="rounded bg-red-500 p-2 text-white shadow transition-colors hover:bg-red-600"
					title="Delete Selected Points"
				>
					<Trash2 class="h-4 w-4" />
				</button>

				{#if selectedMarkers.length >= 2}
					<button
						on:click={createTripFromSelected}
						class="rounded bg-green-500 p-2 text-white shadow transition-colors hover:bg-green-600"
						title="Create Trip from Selected Points"
					>
						<Route class="h-4 w-4" />
					</button>
				{/if}
			{/if}
		</div>

		<!-- Selection Info -->
		{#if isEditMode && selectedMarkers.length > 0}
			<div class="absolute bottom-4 left-4 z-[1001] rounded bg-white p-3 shadow dark:bg-gray-800">
				<div class="text-sm text-gray-700 dark:text-gray-300">
					{selectedMarkers.length} point{selectedMarkers.length !== 1 ? 's' : ''} selected
				</div>
			</div>
		{/if}

		<!-- Points Count Display -->
		{#if locationData.length > 0}
			<div class="absolute left-4 bottom-4 z-[1001] rounded bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow dark:bg-gray-800 dark:text-gray-300">
				{locationData.length} of {totalPoints} points loaded
			</div>
		{/if}

		<!-- Load More Button -->
		{#if locationData.length < totalPoints}
			<button
									on:click={() => loadMoreData()}
				disabled={isLoading}
				class="absolute right-4 bottom-4 z-[1001] rounded bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
			>
				{#if isLoading}
					<Loader2 class="mr-1 inline h-4 w-4 animate-spin" />
					{#if loadingStage}
						<span class="text-xs text-gray-500">{loadingStage}</span>
					{/if}
				{:else}
					Load More ({locationData.length.toLocaleString()}/{totalPoints.toLocaleString()})
				{/if}
			</button>
		{/if}
	</div>

	<!-- Stats -->
	{#if statisticsError}
		<div class="mb-8 py-8 text-center font-semibold text-red-600 dark:text-red-400">
			Error loading statistics: {statisticsError}
		</div>
	{:else if statisticsLoading}
		<!-- Loading Placeholders -->
		<!-- Top section: 4 tiles that span 25% width on larger screens -->
		<div class="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
			{#each Array(8) as _, i}
				<div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
					<div class="flex items-center gap-2">
						<div class="h-5 w-5 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
						<div class="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
					</div>
					<div class="mt-1 h-6 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
				</div>
			{/each}
		</div>

		<!-- Bottom section: 2 tiles that span 50% width -->
		<div class="mb-8 flex flex-col gap-6 md:flex-row">
			{#each Array(2) as _, i}
				<div class="w-full rounded-lg border border-gray-200 bg-white p-4 md:w-1/2 dark:border-gray-700 dark:bg-gray-800">
					<div class="mb-3 flex items-center gap-2">
						<div class="h-5 w-5 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
						<div class="h-5 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
					</div>
					<div class="space-y-3">
						{#each Array(3) as _, j}
							<div class="flex items-center gap-4">
								<div class="h-4 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
								<div class="h-4 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
								<div class="h-4 w-12 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{:else if !statisticsData || Object.keys(statisticsData).length === 0}
		<div class="mb-8 py-8 text-center font-semibold text-gray-500 dark:text-gray-400">
			No statistics available for this period.
		</div>
	{:else}
		<!-- Actual Statistics Content -->
		<div class="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
			{#each getStatistics() as stat, index}
				{@const IconComponent = stat.icon}
				<div
					class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
				>
					<div class="flex items-center gap-2">
						<IconComponent class="h-5 w-5 text-{stat.color}-500" />
						<span class="text-sm font-medium text-gray-700 dark:text-gray-300">{stat.title}</span>
					</div>
					<div class="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
						{stat.value}
					</div>
				</div>
			{/each}
		</div>
	{/if}

		<!-- Country Time Distribution and Geocoding Progress: Side by Side -->
	{#if statisticsData && !statisticsLoading && !statisticsError}
		<div class="mb-8 flex flex-col gap-6 md:flex-row">
			{#if statisticsData.countryTimeDistribution && statisticsData.countryTimeDistribution.length > 0}
				<div
					class="w-full rounded-lg border border-gray-200 bg-white p-4 md:w-1/2 dark:border-gray-700 dark:bg-gray-800"
				>
					<div class="mb-3 flex items-center gap-2">
						<Globe2 class="h-5 w-5 text-blue-500" />
						<span class="text-lg font-semibold text-gray-800 dark:text-gray-100"
							>Time Distribution per Country</span
						>
					</div>
					<div class="space-y-4">
						{#each statisticsData.countryTimeDistribution as country}
							<div>
								<div class="mb-1 flex items-center gap-2">
									<span class="text-xl">{getFlagEmoji(country.country_code)}</span>
									<span class="text-base text-gray-700 dark:text-gray-300"
										>{$getCountryNameReactive(country.country_code)}</span
									>
								</div>
								<div class="relative w-full">
									<div class="flex h-4 items-center rounded bg-gray-200 dark:bg-gray-700">
										<div
											class="flex h-4 items-center justify-center rounded bg-blue-500 text-xs font-bold text-white transition-all duration-300"
											style="width: {country.percent}%; min-width: 2.5rem;"
										>
											<span class="w-full text-center">{country.percent}%</span>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
					<div class="mt-4 text-xs text-gray-500 dark:text-gray-400">of selected period</div>
				</div>
			{/if}

			<!-- Geocoding Progress Component -->
			<div class="w-full md:w-1/2">
						<GeocodingProgress />
			</div>
		</div>
	{/if}

	<!-- Modes of Transport: Full Width -->
	{#if statisticsData && !statisticsLoading && !statisticsError && statisticsData.transport && statisticsData.transport.length > 0}
		<div class="mb-8">
			<div
				class="w-full rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
			>
				<div class="mb-3 flex items-center gap-2">
					<Route class="h-5 w-5 text-blue-500" />
					<span class="text-lg font-semibold text-gray-800 dark:text-gray-100"
						>Modes of Transport</span
					>
				</div>
				<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
					<thead>
						<tr>
							<th
								class="px-4 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
								>Mode</th
							>
							<th
								class="px-4 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
								>Distance (km)</th
							>
							<th
								class="px-4 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
								>Time</th
							>
							<th
								class="px-4 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
								>% of Total</th
							>
							<th
								class="px-4 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
								>Points</th
							>
						</tr>
					</thead>
					<tbody>
						{#each statisticsData.transport
							.slice()
							.sort((a: { distance: number }, b: { distance: number }) => b.distance - a.distance) as mode}
							<tr>
								<td
									class="px-4 py-2 text-sm whitespace-nowrap text-gray-900 capitalize dark:text-gray-100"
									>{mode.mode}</td
								>
								<td
									class="px-4 py-2 text-sm font-bold whitespace-nowrap text-blue-700 dark:text-blue-300"
									>{mode.distance}</td
								>
								<td class="px-4 py-2 text-sm whitespace-nowrap text-gray-700 dark:text-gray-300"
									>{formatSegmentDuration(mode.time || 0)}</td
								>
								<td class="px-4 py-2 text-sm whitespace-nowrap text-gray-700 dark:text-gray-300"
									>{mode.percentage || 0}%</td
								>
								<td class="px-4 py-2 text-sm whitespace-nowrap text-gray-700 dark:text-gray-300"
									>{mode.points || 0}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- Train Station Visits Table -->
	{#if statisticsData && !statisticsLoading && !statisticsError && statisticsData.trainStationVisits && statisticsData.trainStationVisits.length > 0}
		<div
			class="mb-8 w-full rounded-lg border border-gray-200 bg-white p-4 md:w-1/2 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="mb-3 flex items-center gap-2">
				<Train class="h-5 w-5 text-blue-500" />
				<span class="text-lg font-semibold text-gray-800 dark:text-gray-100"
					>Train Station Visits</span
				>
			</div>
			<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
				<thead>
					<tr>
						<th
							class="px-4 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
							>Station</th
						>
						<th
							class="px-4 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
							>Visits</th
						>
					</tr>
				</thead>
				<tbody>
					{#each statisticsData.trainStationVisits
						.slice()
						.sort((a: { count: number }, b: { count: number }) => b.count - a.count) as station}
						<tr>
							<td class="px-4 py-2 text-sm whitespace-nowrap text-gray-900 dark:text-gray-100"
								>{station.name}</td
							>
							<td
								class="px-4 py-2 text-sm font-bold whitespace-nowrap text-blue-700 dark:text-blue-300"
								>{station.count}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
			<div class="mt-4 text-xs text-gray-500 dark:text-gray-400">
				within 300 meters of a station, at least 1 hour apart
			</div>
		</div>
	{/if}

</div>
