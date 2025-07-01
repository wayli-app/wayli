<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { Map as LeafletMap, LatLngExpression, Marker, Icon } from 'leaflet';
	import {
		BookOpen,
		Calendar,
		MapPin,
		Star,
		Activity,
		Loader2,
		Database,
		RefreshCw,
		Trash2,
		Route,
		Navigation,
		Globe2,
		Clock,
		Flag,
		Footprints,
		Train,
		BarChart,
		Edit
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
	import { LocationCacheService } from '$lib/services/location-cache.service';
	import { DatePicker } from '@svelte-plugins/datepicker';

	let map: LeafletMap;
	let L: typeof import('leaflet');
	let mapContainer: HTMLDivElement;
	let currentTileLayer: any;
	let markers: any[] = [];
	let polylines: any[] = [];
	let selectedMarkers: any[] = [];
	let isEditMode = false;
	let isLoading = false;
	let isInitialLoad = true;
	let isCacheLoading = false;
	let locationData: any[] = [];
	let hasMoreData = false;
	let currentOffset = 0;
	const BATCH_SIZE = 10000;

	// Add minimum loading time to ensure loading indicator is visible
	let loadingStartTime = 0;
	const MIN_LOADING_TIME = 800; // 800ms minimum loading time

	// Custom marker icons
	let locationIcon: any;
	let poiIcon: any;
	let trackerIcon: any;

	// Add statistics state
	let statisticsData: any = null;
	let statisticsLoading = false;
	let statisticsError = '';

	// Add statistics caching
	let statisticsCache: Map<string, { data: any; timestamp: number }> = new Map();
	const STATISTICS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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

	// Reactive cache stats
	$: cacheStats = browser
		? (() => {
				cacheUpdateTrigger; // Make this reactive
				return LocationCacheService.getCacheStats();
			})()
		: { entries: 0, size: 0, maxSize: 0, days: [] };

	// Listen for storage events to update cache status live (in case another tab changes it)
	if (browser) {
		window.addEventListener('storage', () => {
			cacheUpdateTrigger++;
		});
	}

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

	// Add loaded/total GPS points state
	let totalGpsPoints = 0;
	let loadedGpsPoints = 0;

	async function loadLocationData(reset = true) {
		if (isLoading) return;

		console.log('=== LOADING LOCATION DATA ===');
		console.log('Reset:', reset);
		console.log('Current offset:', currentOffset);
		console.log('Current filters:', {
			startDate: state.filtersStartDate,
			endDate: state.filtersEndDate
		});

		loadingStartTime = Date.now();
		isLoading = true;
		if (reset) {
			currentOffset = 0;
			clearMapMarkers();
			locationData = []; // Clear existing data when resetting
		}

		try {
			// Create cache key
			const cacheKey = {
				startDate: getDateObject(state.filtersStartDate)?.toISOString().split('T')[0] || '',
				endDate: getDateObject(state.filtersEndDate)?.toISOString().split('T')[0] || '',
				offset: currentOffset,
				limit: BATCH_SIZE
			};

			console.log('Cache key:', cacheKey);

			// Try to get cached data first
			const cachedData = LocationCacheService.getCachedData(cacheKey);

			if (cachedData && reset) {
				console.log('Using cached data');
				isCacheLoading = true;

				// Simulate a small delay to show cache loading
				await new Promise((resolve) => setTimeout(resolve, 300));

				locationData = cachedData.data;
				hasMoreData = cachedData.hasMore;
				currentOffset += cachedData.data.length;

				// Add markers to map
				addMarkersToMap(cachedData.data);

				// Fit map to show all markers if this is the first load
				if (reset && cachedData.data.length > 0) {
					fitMapToMarkers();
				}

				console.log(
					`Loaded ${cachedData.data.length} locations from cache (total: ${locationData.length})`
				);
				isCacheLoading = false;

				// Ensure minimum loading time
				const elapsed = Date.now() - loadingStartTime;
				if (elapsed < MIN_LOADING_TIME) {
					await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_TIME - elapsed));
				}

				// Update cache statistics display
				cacheUpdateTrigger++;
				return;
			}

			// Try to get data from day-specific cache if we have date filters
			if (state.filtersStartDate && state.filtersEndDate && reset) {
				const startDateStr =
					getDateObject(state.filtersStartDate)?.toISOString().split('T')[0] || '';
				const endDateStr = getDateObject(state.filtersEndDate)?.toISOString().split('T')[0] || '';

				const dayCachedData = LocationCacheService.getCachedDataForDateRange(
					startDateStr,
					endDateStr
				);

				if (dayCachedData && dayCachedData.length > 0) {
					console.log('Using day-specific cached data');
					isCacheLoading = true;

					// Simulate a small delay to show cache loading
					await new Promise((resolve) => setTimeout(resolve, 300));

					// Apply pagination to the cached data
					const startIndex = currentOffset;
					const endIndex = startIndex + BATCH_SIZE;
					const paginatedData = dayCachedData.slice(startIndex, endIndex);

					locationData = paginatedData;
					hasMoreData = endIndex < dayCachedData.length;
					currentOffset += paginatedData.length;

					// Add markers to map
					addMarkersToMap(paginatedData);

					// Fit map to show all markers if this is the first load
					if (reset && paginatedData.length > 0) {
						fitMapToMarkers();
					}

					console.log(
						`Loaded ${paginatedData.length} locations from day cache (total: ${locationData.length})`
					);
					isCacheLoading = false;

					// Ensure minimum loading time
					const elapsed = Date.now() - loadingStartTime;
					if (elapsed < MIN_LOADING_TIME) {
						await new Promise((resolve) => setTimeout(resolve, MIN_LOADING_TIME - elapsed));
					}

					// Update cache statistics display
					cacheUpdateTrigger++;
					return;
				}
			}

			// If we reach here, cache is empty or no cache found - make API call
			console.log('Cache is empty or no cache found - making API call');

			const params = new URLSearchParams({
				limit: BATCH_SIZE.toString(),
				offset: currentOffset.toString(),
				includeLocations: 'true',
				includePOIs: 'false',
				includeTrackerData: 'true'
			});

			// Add date filters if set
			if (state.filtersStartDate) {
				params.set(
					'startDate',
					getDateObject(state.filtersStartDate)?.toISOString().split('T')[0] || ''
				);
			}
			if (state.filtersEndDate) {
				params.set(
					'endDate',
					getDateObject(state.filtersEndDate)?.toISOString().split('T')[0] || ''
				);
			}

			console.log('API request URL:', `/api/v1/trips/locations?${params.toString()}`);
			console.log('API parameters:', Object.fromEntries(params.entries()));

			const response = await fetch(`/api/v1/trips/locations?${params.toString()}`);
			if (!response.ok) {
				throw new Error('Failed to load location data');
			}

			const result = await response.json();

			if (!result.success) {
				throw new Error(result.error?.message || 'Failed to load location data');
			}

			const newData = result.data.locations || [];

			console.log('API response:', {
				success: result.success,
				total: result.data.total,
				count: result.data.count,
				hasMore: result.data.hasMore,
				locationsReceived: newData.length
			});

			if (reset) {
				locationData = newData;
			} else {
				locationData = [...locationData, ...newData];
			}

			hasMoreData = result.data.hasMore;
			currentOffset += newData.length;

			// Cache the data (this will also cache by individual days)
			LocationCacheService.setCachedData(cacheKey, newData, result.data.total, result.data.hasMore);

			// Update cache statistics display
			cacheUpdateTrigger++;

			// Add markers to map
			addMarkersToMap(newData);

			// Fit map to show all markers if this is the first load
			if (reset && newData.length > 0) {
				fitMapToMarkers();
			}

			console.log(
				`Loaded ${newData.length} locations from API (total: ${locationData.length}, hasMore: ${hasMoreData})`
			);

			// DEBUG: Force the load more button to always appear
			hasMoreData = true; // Remove this after debugging

			// Update loaded/total GPS points state
			loadedGpsPoints = locationData.length;
			totalGpsPoints = result.data.total || loadedGpsPoints;
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
			console.log('=== LOADING COMPLETE ===');
		}
	}

	function addMarkersToMap(data: any[]) {
		if (!map || !L) return;

		// Separate tracker data and location data
		const trackerPoints = data.filter((item) => item.type === 'tracker' && item.coordinates);
		const locationPoints = data.filter((item) => item.type === 'location' && item.coordinates);

		// Color map for transport modes
		const modeColors: Record<string, string> = {
			car: '#ef4444', // red
			train: '#a21caf', // purple
			airplane: '#000000', // black
			cycling: '#f59e42', // orange
			walking: '#10b981', // green
			unknown: '#6b7280' // gray
		};

		// Draw lines between tracker points, colored by the mode of the NEXT point
		if (trackerPoints.length > 1) {
			// Sort tracker points by recorded_at timestamp
			const sortedTrackerPoints = trackerPoints.sort((a, b) => {
				const dateA = new Date(a.recorded_at || a.created_at).getTime();
				const dateB = new Date(b.recorded_at || b.created_at).getTime();
				return dateA - dateB;
			});

			for (let i = 0; i < sortedTrackerPoints.length - 1; i++) {
				const curr = sortedTrackerPoints[i];
				const next = sortedTrackerPoints[i + 1];
				const lineCoordinates = [
					[curr.coordinates.lat, curr.coordinates.lng],
					[next.coordinates.lat, next.coordinates.lng]
				];
				const mode = next.transport_mode || 'unknown';
				const polyline = L.polyline(lineCoordinates, {
					color: modeColors[mode] || '#6b7280',
					weight: 3,
					opacity: 0.8
				}).addTo(map);
				polylines.push(polyline);
			}

			// Add start and end markers for the path
			if (sortedTrackerPoints.length > 0) {
				const startPoint = sortedTrackerPoints[0];
				const endPoint = sortedTrackerPoints[sortedTrackerPoints.length - 1];

				// Start marker (green)
				const startMarker = L.circleMarker(
					[startPoint.coordinates.lat, startPoint.coordinates.lng],
					{
						radius: 4,
						fillColor: '#10b981',
						color: 'transparent',
						weight: 0,
						opacity: 1,
						fillOpacity: 0.8
					}
				)
					.bindPopup(createPopupContent(startPoint))
					.addTo(map);

				// End marker (red)
				const endMarker = L.circleMarker([endPoint.coordinates.lat, endPoint.coordinates.lng], {
					radius: 4,
					fillColor: '#ef4444',
					color: 'transparent',
					weight: 0,
					opacity: 1,
					fillOpacity: 0.8
				})
					.bindPopup(createPopupContent(endPoint))
					.addTo(map);

				markers.push(startMarker, endMarker);
			}
		}

		// Add markers for all tracker points (not just start/end)
		trackerPoints.forEach((item) => {
			const transportMode = item.transport_mode || 'unknown';
			const markerColor = modeColors[transportMode] || '#6b7280';
			const marker = L.circleMarker([item.coordinates.lat, item.coordinates.lng], {
				radius: 3,
				fillColor: markerColor,
				color: 'transparent',
				weight: 0,
				opacity: 0.8,
				fillOpacity: 0.6
			})
				.bindPopup(createPopupContent(item))
				.on('click', () => selectMarker(marker, item))
				.addTo(map);
			(marker as any).item = item;
			if (isEditMode) {
				(marker as any)._path.style.cursor = 'pointer';
			}
			markers.push(marker);
		});

		// Add markers for location points
		locationPoints.forEach((item) => {
			const marker = L.circleMarker([item.coordinates.lat, item.coordinates.lng], {
				radius: 4,
				fillColor: '#f59e0b',
				color: 'transparent',
				weight: 0,
				opacity: 1,
				fillOpacity: 0.8
			})
				.bindPopup(createPopupContent(item))
				.addTo(map);

			markers.push(marker);
		});
	}

	function createPopupContent(item: any): string {
		const date = item.recorded_at || item.created_at;
		const formattedDate = date ? format(new Date(date), 'MMM d, yyyy HH:mm') : 'Unknown date';
		const updatedDate = item.updated_at
			? format(new Date(item.updated_at), 'MMM d, yyyy HH:mm')
			: null;

		// Always use transport_mode from backend
		const transportMode = item.transport_mode || 'unknown';

		let content = `
			<div class="p-3 max-w-sm">
				<div class="flex items-center gap-2 mb-2">
					<div class="w-3 h-3 rounded-full ${getTypeColor(item.type)}"></div>
					<h3 class="font-semibold text-sm text-gray-900">${item.name || 'Unnamed Location'}</h3>
				</div>

				<div class="space-y-2 text-xs">
					<div class="flex justify-between">
						<span class="text-gray-500">Type:</span>
						<span class="font-medium capitalize">${item.type}</span>
					</div>

					<div class="flex justify-between">
						<span class="text-gray-500">Date:</span>
						<span class="font-medium">${formattedDate}</span>
					</div>
		`;

		// Add transport mode if available (for tracker points)
		if (item.type === 'tracker') {
			content += `
				<div class="flex justify-between">
					<span class="text-gray-500">Mode:</span>
					<span class="font-medium capitalize">${transportMode || 'Unknown'}</span>
				</div>
			`;
		}

		// Add updated date if different from created date
		if (updatedDate && updatedDate !== formattedDate) {
			content += `
				<div class="flex justify-between">
					<span class="text-gray-500">Updated:</span>
					<span class="font-medium">${updatedDate}</span>
				</div>
			`;
		}

		// Add coordinates
		if (item.coordinates) {
			content += `
				<div class="flex justify-between">
					<span class="text-gray-500">Coordinates:</span>
					<span class="font-medium">${item.coordinates.lat.toFixed(6)}, ${item.coordinates.lng.toFixed(6)}</span>
				</div>
			`;
		}

		// Add description
		if (item.description) {
			content += `
				<div class="flex justify-between">
					<span class="text-gray-500">Description:</span>
					<span class="font-medium">${item.description}</span>
				</div>
			`;
		}

		// Add speed if available (for tracker points)
		if (item.type === 'tracker' && item.speed !== undefined && item.speed !== null) {
			const speedKmh = (item.speed * 3.6).toFixed(1); // Convert m/s to km/h
			content += `
				<div class="flex justify-between">
					<span class="text-gray-500">Speed:</span>
					<span class="font-medium">${speedKmh} km/h</span>
				</div>
			`;
		}

		// Add altitude if available (for tracker points)
		if (item.type === 'tracker' && item.altitude !== undefined && item.altitude !== null) {
			content += `
				<div class="flex justify-between">
					<span class="text-gray-500">Altitude:</span>
					<span class="font-medium">${item.altitude.toFixed(0)} m</span>
				</div>
			`;
		}

		// Add accuracy if available (for tracker points)
		if (item.type === 'tracker' && item.accuracy !== undefined && item.accuracy !== null) {
			content += `
				<div class="flex justify-between">
					<span class="text-gray-500">Accuracy:</span>
					<span class="font-medium">${item.accuracy.toFixed(0)} m</span>
				</div>
			`;
		}

		content += `
				</div>
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
		console.log('Edit mode:', isEditMode);
		if (!isEditMode) {
			// Clear selections when exiting edit mode
			deselectAllMarkers();
		}
	}

	function selectMarker(marker: any, item: any) {
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

			console.log('Trip data:', tripData);
			toast.success(`Created trip with ${selectedItems.length} points`);

			// TODO: Implement actual trip creation/saving
			// This could involve calling an API endpoint to save the trip
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

	// Debug loading states
	$: console.log('Loading states:', { isLoading, isCacheLoading, isInitialLoad });

	// Track last filter state to prevent infinite loops
	let lastFilterState = '';

	// Watch for date changes and reload data
	$: if (browser && !isInitialLoad) {
		const filterState = {
			startDate: getDateObject(state.filtersStartDate)?.toISOString().split('T')[0] || '',
			endDate: getDateObject(state.filtersEndDate)?.toISOString().split('T')[0] || ''
		};

		const filterStateString = JSON.stringify(filterState);

		// Only reload if we have some filter applied and the state actually changed
		if ((filterState.startDate || filterState.endDate) && filterStateString !== lastFilterState) {
			console.log('=== DATE FILTER CHANGE ===');
			console.log('Previous filter state:', lastFilterState);
			console.log('New filter state:', filterState);
			console.log('Start Date:', state.filtersStartDate);
			console.log('End Date:', state.filtersEndDate);
			console.log('===========================');
			lastFilterState = filterStateString;
			loadLocationData(true);
		}
	}

	// Add function to clear cache
	async function clearCache() {
		try {
			LocationCacheService.clearCache();
			toast.success('Cache cleared successfully');
			// Trigger reactive update
			cacheUpdateTrigger++;
		} catch (error) {
			console.error('Error clearing cache:', error);
			toast.error('Failed to clear cache');
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

	// Function to get cache key for statistics
	function getStatisticsCacheKey(): string {
		const startDate = state.filtersStartDate
			? getDateObject(state.filtersStartDate)?.toISOString().split('T')[0]
			: '';
		const endDate = state.filtersEndDate
			? getDateObject(state.filtersEndDate)?.toISOString().split('T')[0]
			: '';
		return `statistics_${startDate}_${endDate}`;
	}

	// Function to get cached statistics
	function getCachedStatistics(): any | null {
		const cacheKey = getStatisticsCacheKey();
		const cached = statisticsCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < STATISTICS_CACHE_DURATION) {
			return cached.data;
		}
		return null;
	}

	// Function to set cached statistics
	function setCachedStatistics(data: any): void {
		const cacheKey = getStatisticsCacheKey();
		statisticsCache.set(cacheKey, { data, timestamp: Date.now() });
	}

	// Function to clear statistics cache
	function clearStatisticsCache(): void {
		statisticsCache.clear();
	}

	// Function to fetch statistics data
	async function fetchStatisticsData(forceRefresh = false) {
		try {
			// Check cache first (unless force refresh is requested)
			if (!forceRefresh) {
				const cachedData = getCachedStatistics();
				if (cachedData) {
					console.log('Using cached statistics data');
					statisticsData = cachedData;
					return;
				}
			}

			statisticsLoading = true;
			statisticsError = '';
			const params = new URLSearchParams();
			if (state.filtersStartDate) {
				const startDateObj = getDateObject(state.filtersStartDate);
				if (startDateObj) params.set('startDate', startDateObj.toISOString().split('T')[0]);
			}
			if (state.filtersEndDate) {
				const endDateObj = getDateObject(state.filtersEndDate);
				if (endDateObj) params.set('endDate', endDateObj.toISOString().split('T')[0]);
			}
			const url = `/api/v1/statistics?${params.toString()}`;
			console.log('Fetching statistics from:', url);
			const response = await fetch(url);
			console.log('API response status:', response.status);
			let result;
			try {
				result = await response.json();
				console.log('API response JSON:', result);
			} catch (jsonErr) {
				console.error('Failed to parse JSON:', jsonErr);
				throw new Error('Invalid JSON response from statistics API');
			}
			if (!response.ok) throw new Error('HTTP error: ' + response.status);
			if (!result.success) throw new Error(result.error?.message || 'Failed to fetch statistics');
			statisticsData = result.data;
			console.log('Fetched statisticsData:', statisticsData);

			// Cache the result
			setCachedStatistics(result.data);

			// Update cache statistics display
			cacheUpdateTrigger++;
		} catch (err) {
			console.error('Statistics fetch error:', err);
			statisticsError = err instanceof Error ? err.message : String(err);
			statisticsData = null;
		} finally {
			statisticsLoading = false;
		}
	}

	// Move this to the top-level scope, outside of getStatistics
	function formatEarthCircumferences(value: number): string {
		if (value == null) return '';
		console.log('Earth Circumferences value:', value, typeof value);
		if (typeof value === 'string') value = parseFloat(value);
		if (value > 0 && value < 0.001) {
			return value.toExponential(2) + 'x'; // Scientific notation for very small values
		} else if (value < 1 && value > 0) {
			return value.toFixed(4) + 'x'; // Show 4 decimal places for small values
		} else {
			return value.toFixed(3) + 'x'; // Show 3 decimal places for zero or larger values
		}
	}

	// Function to get statistics for display
	function getStatistics() {
		if (!statisticsData) return [];
		return [
			{
				id: 1,
				title: 'Total Distance',
				value: statisticsData.totalDistance ?? '',
				icon: Navigation,
				color: 'blue'
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
				value: statisticsData.geopoints?.toLocaleString() ?? '',
				icon: MapPin,
				color: 'blue'
			},
			{
				id: 4,
				title: 'Time Moving',
				value: statisticsData.timeSpentMoving ?? '',
				icon: Clock,
				color: 'blue'
			},
			{
				id: 5,
				title: 'Unique Places',
				value: statisticsData.uniquePlaces?.toLocaleString() ?? '',
				icon: Flag,
				color: 'blue'
			},
			{
				id: 6,
				title: 'Countries Visited',
				value: statisticsData.countriesVisited?.toString() ?? '',
				icon: Globe2,
				color: 'blue'
			},
			{
				id: 7,
				title: 'Visited Places',
				value: statisticsData.visitedPlaces?.toLocaleString() ?? '',
				icon: MapPin,
				color: 'blue'
			},
			{
				id: 8,
				title: 'Approximate Steps',
				value: statisticsData.steps?.toLocaleString() ?? '',
				icon: Footprints,
				color: 'blue'
			}
		];
	}

	// Watch for date changes and reload statistics
	$: if (state.filtersStartDate || state.filtersEndDate) {
		if (map) {
			// Only reload if map is initialized
			fetchStatisticsData(true); // Force refresh when date changes
		}
	}

	// Country code to country name map (extend as needed)
	const countryNames: Record<string, Record<string, string>> = {
		NL: { en: 'Netherlands', nl: 'Nederland' },
		BE: { en: 'Belgium', nl: 'België' },
		DE: { en: 'Germany', nl: 'Duitsland' },
		FR: { en: 'France', nl: 'Frankrijk' },
		US: { en: 'United States', nl: 'Verenigde Staten' },
		MA: { en: 'Morocco', nl: 'Marokko' },
		GB: { en: 'Great Britain', nl: 'Groot-Brittannië' }
		// ...add more as needed
	};

	// Detect current language (replace with your i18n detection if available)
	let currentLang = 'en';
	if (typeof navigator !== 'undefined' && navigator.language) {
		currentLang = navigator.language.split('-')[0];
	}

	function getCountryName(code: string): string {
		if (!code) return code;
		return countryNames[code]?.[currentLang] || countryNames[code]?.en || code;
	}

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
	function formatTime(seconds: number): string {
		if (!seconds || isNaN(seconds)) return '0:00:00';
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	}

	// Add a legend for transport mode colors to the map
	// Place it in the top left corner
	$: if (map && L) {
		const legendId = 'transport-mode-legend';
		let legend = document.getElementById(legendId);
		if (!legend) {
			legend = document.createElement('div');
			legend.id = legendId;
			legend.className = 'leaflet-control leaflet-bar bg-white dark:bg-gray-800 p-3 rounded shadow';
			legend.style.position = 'absolute';
			legend.style.top = '90px';
			legend.style.left = '10px';
			legend.style.zIndex = '1000';
			legend.innerHTML = `
				<div class="font-semibold mb-2 text-xs text-gray-700 dark:text-gray-200">Mode Colors</div>
				<div class="flex flex-col gap-1">
					<div class="flex items-center gap-2"><span style="display:inline-block;width:16px;height:4px;background:#ef4444;"></span>Car</div>
					<div class="flex items-center gap-2"><span style="display:inline-block;width:16px;height:4px;background:#a21caf;"></span>Train</div>
					<div class="flex items-center gap-2"><span style="display:inline-block;width:16px;height:4px;background:#000000;"></span>Airplane</div>
					<div class="flex items-center gap-2"><span style="display:inline-block;width:16px;height:4px;background:#f59e42;"></span>Cycling</div>
					<div class="flex items-center gap-2"><span style="display:inline-block;width:16px;height:4px;background:#10b981;"></span>Walking</div>
					<div class="flex items-center gap-2"><span style="display:inline-block;width:16px;height:4px;background:#6b7280;"></span>Unknown</div>
				</div>
			`;
			map.getContainer().appendChild(legend);
		}
	}

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

		// Set default date range to last 7 days if not already set
		if (!state.filtersStartDate || !state.filtersEndDate) {
			const today = new Date();
			const sevenDaysAgo = new Date();
			sevenDaysAgo.setDate(today.getDate() - 6); // Last 7 days includes today and 6 days before
			state.filtersStartDate = sevenDaysAgo;
			state.filtersEndDate = today;
		}

		// Load initial data
		await loadLocationData();
		await fetchStatisticsData(false); // Allow cache for initial load
	});

	onDestroy(() => {
		clearMapMarkers();
	});

	// Add a function to update statistics only when both dates are set
	function loadStatistics() {
		// Your existing logic to update statistics, e.g. reload data, etc.
		// This should be the same logic that previously ran on date change
		// Example:
		if (state.filtersStartDate && state.filtersEndDate) {
			// ... trigger statistics update logic here ...
			// e.g. fetchStatistics(state.filtersStartDate, state.filtersEndDate);
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
		.custom-marker {
			background: transparent !important;
			border: none !important;
		}
		.date-field {
			align-items: center;
			background-color: #fff;
			border-bottom: 1px solid #e8e9ea;
			display: inline-flex;
			gap: 8px;
			min-width: 100px;
			padding: 6px;
			border-radius: 0.75rem;
		}
		.date-field .icon-calendar {
			background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAABYlAAAWJQFJUiTwAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAEmSURBVHgB7ZcPzcIwEMUfXz4BSCgKwAGgACRMAg6YBBxsOMABOAAHFAXgAK5Z2Y6lHbfQ8SfpL3lZaY/1rb01N+BHUKSMNBfEJjZWISA56Uo6C2KvVpkgFn9oRx9vICFtUT1JKO3tvRtZdjBxXQs+YY+1FenIfuesPUGVVLzfRWKvmrSzbbN19wS+kAb2+sCEuUxrYzkbe4YvCVM2Vr5NPAkVa+van7Wn38U95uTpN5TJ/A8ZKemAakmbmJJGpI0gVmwA0huieFItjG19DgTHtwIZhCfZq3ztCuzQYh+FKBSvusjAGs8PnLYkLgMf34JoIBqIBqKBaIAb0Kw9RlhMCTbzzPWAqYq7LsuPaGDUsYmznaOk5zChUJTNQ4TFVMkrOL4HPsoNn26PxROHCggAAAAASUVORK5CYII=)
				no-repeat center center;
			background-size: 14px 14px;
			height: 14px;
			width: 14px;
		}
		html.dark .air-datepicker,
		body.dark .air-datepicker {
			background: #23232a !important;
			color: #f3f4f6 !important;
			border-color: #44444c !important;
		}
		html.dark .air-datepicker-nav,
		body.dark .air-datepicker-nav {
			background: #23232a !important;
			color: #f3f4f6 !important;
		}
		html.dark .air-datepicker-cell,
		body.dark .air-datepicker-cell {
			color: #f3f4f6 !important;
		}
		html.dark .air-datepicker-cell.-selected-,
		body.dark .air-datepicker-cell.-selected- {
			background: #2563eb !important;
			color: #fff !important;
		}
		html.dark .air-datepicker-cell.-current-,
		body.dark .air-datepicker-cell.-current- {
			border-color: #2563eb !important;
		}
		html.dark .air-datepicker-nav--title,
		body.dark .air-datepicker-nav--title {
			color: #f3f4f6 !important;
		}
		html.dark .air-datepicker-nav--action,
		body.dark .air-datepicker-nav--action {
			color: #f3f4f6 !important;
		}
		html.dark .air-datepicker-buttons,
		body.dark .air-datepicker-buttons {
			background: #23232a !important;
		}
		html.dark .air-datepicker-time,
		body.dark .air-datepicker-time {
			background: #23232a !important;
			color: #f3f4f6 !important;
		}
	</style>
</svelte:head>

<svelte:window on:click={handleClickOutside} />

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
		<div class="flex items-center gap-2 min-w-0">
			<BarChart class="h-8 w-8 flex-shrink-0 text-blue-600 dark:text-gray-400" />
			<h1 class="whitespace-nowrap text-3xl font-bold text-gray-900 dark:text-gray-100">Statistics</h1>
		</div>
		<div class="flex items-center gap-6 flex-1 justify-end">
			<div class="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded px-4 py-2 text-sm text-gray-500 dark:text-gray-400 shadow-sm">
				<span>Location cache: {cacheStats.entries} entries, {(cacheStats.size / (1024 * 1024)).toFixed(1)}MB</span>
				<span>•</span>
				<span>Statistics cache: {statisticsCache.size} periods</span>
					<button
					onclick={() => { clearCache(); clearStatisticsCache(); }}
					class="cursor-pointer text-xs text-red-500 underline hover:text-red-700 dark:hover:text-red-400 ml-2"
					title="Clear all caches"
				>
					Clear all
					</button>
			</div>
			<div class="relative flex items-center h-full self-stretch" style="z-index:2001;">
			<button
					type="button"
					class="date-field w-[250px] max-w-full px-2 py-0.5 text-base text-left rounded-lg shadow bg-white dark:bg-gray-800 flex items-center gap-2 cursor-pointer"
				onclick={toggleDatePicker}
					onkeydown={(e) => e.key === 'Enter' && toggleDatePicker()}
					class:open={isOpen}
					aria-label="Select date range"
					aria-expanded={isOpen}
				>
					<i class="icon-calendar"></i>
					<div class="date">
						{#if state.filtersStartDate}
							{formattedStartDate} - {formattedEndDate}
						{:else}
							Pick a date
						{/if}
		</div>
				</button>
				{#if isOpen}
					<div class="date-picker-container absolute right-0 mt-2" style="z-index:2001;">
						<DatePicker
							bind:isOpen
							bind:startDate={state.filtersStartDate}
							bind:endDate={state.filtersEndDate}
							isRange
							showPresets
							align="right"
							on:change={() => {
								if (state.filtersStartDate && state.filtersEndDate) {
									// Only update when both dates are selected
									loadStatistics();
								}
							}}
					/>
				</div>
				{/if}
				</div>
			</div>
		</div>

	<!-- Map -->
	<div
		class="relative h-96 w-full overflow-hidden rounded-lg bg-gray-100 md:h-[600px] dark:bg-gray-900 {isEditMode ? 'ring-4 ring-blue-400 cursor-pointer' : ''}"
		style={isEditMode ? 'cursor: pointer;' : ''}
	>
		{#if isEditMode}
			<div
				class="absolute left-0 top-0 z-[1100] w-full bg-blue-500 py-2 text-center font-semibold text-white shadow-lg">
				Edit mode: Click points to select. Use the buttons to delete or create a trip.
	</div>
		{/if}
		<div bind:this={mapContainer} class="h-full w-full"></div>

		<!-- Edit Controls -->
		<div class="absolute right-4 top-4 z-[1001] flex flex-col gap-2">
			<button
				onclick={toggleEditMode}
				class="rounded bg-white p-2 shadow transition-colors hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
				class:bg-blue-100={isEditMode}
				class:dark:bg-blue-900={isEditMode}
				title={isEditMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
			>
				<Edit class="h-4 w-4 text-gray-700 dark:text-gray-300" />
			</button>

			{#if isEditMode && selectedMarkers.length > 0}
				<button
					onclick={deleteSelectedPoints}
					class="rounded bg-red-500 p-2 text-white shadow transition-colors hover:bg-red-600"
					title="Delete Selected Points"
				>
					<Trash2 class="h-4 w-4" />
				</button>

				{#if selectedMarkers.length >= 2}
					<button
						onclick={createTripFromSelected}
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

		<!-- Load More Button -->
		{#if hasMoreData && loadedGpsPoints < totalGpsPoints}
			<button
				onclick={() => loadLocationData(false)}
				disabled={isLoading}
				class="absolute bottom-4 right-4 z-[1001] rounded bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
			>
				{#if isLoading}
					<Loader2 class="mr-1 inline h-4 w-4 animate-spin" />
				{/if}
				Load More ({loadedGpsPoints}/{totalGpsPoints})
			</button>
		{/if}
			</div>

	<!-- Stats -->
	<div class="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
		{#if statisticsError}
			<div class="col-span-4 py-8 text-center font-semibold text-red-600 dark:text-red-400">
				Error loading statistics: {statisticsError}
			</div>
		{:else if statisticsLoading}
			{#each Array(8) as _, i}
				<div
					class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
				>
					<div class="flex items-center gap-2">
						<div class="h-5 w-5 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
						<div class="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
							</div>
					<div class="mt-1 h-6 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
						</div>
					{/each}
		{:else if getStatistics().length === 0}
			<div class="col-span-4 py-8 text-center font-semibold text-gray-500 dark:text-gray-400">
				No statistics available for this period.
				</div>
		{:else}
			{#each getStatistics() as stat}
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
		{/if}
	</div>

	<!-- Country Time Distribution and Modes of Transport: Side by Side -->
	<div class="mb-8 flex flex-col gap-6 md:flex-row">
		{#if statisticsData && statisticsData.countryTimeDistribution && statisticsData.countryTimeDistribution.length > 0}
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
									>{getCountryName(country.country_code)}</span
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

		{#if statisticsData && statisticsData.transport && statisticsData.transport.length > 0}
			<div
				class="w-full rounded-lg border border-gray-200 bg-white p-4 md:w-1/2 dark:border-gray-700 dark:bg-gray-800"
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
								class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>Mode</th
							>
							<th
								class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>Distance (km)</th
							>
							<th
								class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>Time</th
							>
							<th
								class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
								>% of Total</th
							>
						</tr>
					</thead>
					<tbody>
						{#each statisticsData.transport as mode}
							<tr>
								<td
									class="whitespace-nowrap px-4 py-2 text-sm capitalize text-gray-900 dark:text-gray-100"
									>{mode.mode}</td
								>
								<td
									class="whitespace-nowrap px-4 py-2 text-sm font-bold text-blue-700 dark:text-blue-300"
									>{mode.distance}</td
								>
								<td class="whitespace-nowrap px-4 py-2 text-sm text-gray-700 dark:text-gray-300"
									>{formatTime(mode.time)}</td
								>
								<td class="whitespace-nowrap px-4 py-2 text-sm text-gray-700 dark:text-gray-300"
									>{mode.percentage}%</td
								>
							</tr>
					{/each}
					</tbody>
				</table>
				<div class="mt-4 text-xs text-gray-500 dark:text-gray-400">based on speed and context</div>
				</div>
							{/if}
						</div>

	<!-- Train Station Visits Table -->
	{#if statisticsData && statisticsData.trainStationVisits && statisticsData.trainStationVisits.length > 0}
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
							class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
							>Station</th
						>
						<th
							class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
							>Visits</th
						>
					</tr>
				</thead>
				<tbody>
					{#each statisticsData.trainStationVisits
						.slice()
						.sort((a: { count: number }, b: { count: number }) => b.count - a.count) as station}
						<tr>
							<td class="whitespace-nowrap px-4 py-2 text-sm text-gray-900 dark:text-gray-100"
								>{station.name}</td
							>
							<td
								class="whitespace-nowrap px-4 py-2 text-sm font-bold text-blue-700 dark:text-blue-300"
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
