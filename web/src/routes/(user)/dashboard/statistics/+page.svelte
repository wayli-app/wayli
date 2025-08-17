<script lang="ts">
	console.log('🚀 Statistics page script loaded');

	import { format } from 'date-fns';
	import {
		MapPin,
		Activity,
		Loader2,
		Route,
		Navigation,
		Globe2,
		Clock,
		Flag,
		Footprints,
		Train,
		BarChart,
		Import
	} from 'lucide-svelte';
	import { onMount, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';

	import DateRangePicker from '$lib/components/ui/date-range-picker.svelte';
	import { getCountryNameReactive, translate } from '$lib/i18n';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { state as appState } from '$lib/stores/app-state.svelte';
	import { supabase } from '$lib/supabase';
	import {
		getTransportDetectionReasonLabel,
		type TransportDetectionReason
	} from '$lib/types/transport-detection-reasons';

	import type { Map as LeafletMap } from 'leaflet';

	import { browser } from '$app/environment';

	// Use the reactive translation function
	let t = $derived($translate);

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
		tz_diff?: number; // Timezone difference from UTC in hours
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
		transport?: Array<{
			mode: string;
			distance: number;
			time: number;
			percentage: number;
			points?: number;
		}>;
		countryTimeDistribution?: Array<{ country_code: string; percent: number }>;
		trainStationVisits?: Array<{ name: string; count: number }>;
		_dateRange?: string; // Internal property to track when statistics were calculated
	}

	let map: LeafletMap;
	let L: typeof import('leaflet');
	let mapContainer: HTMLDivElement;
	let currentTileLayer = $state<any>(null);
	let markers = $state<any[]>([]);
	let polylines = $state<any[]>([]);
	let selectedMarkers = $state<any[]>([]);
	let currentPopup = $state<any>(null);
	let isEditMode = $state(false);
	let isLoading = $state(false);
	let isInitialLoad = $state(true);
	let isInitializing = $state(true); // Flag to prevent reactive statement during initial setup
	let locationData = $state<TrackerLocation[]>([]);
	let currentOffset = $state(0);
	let totalPoints = $state(0);

	// Progress tracking
	let loadingProgress = $state(0); // 0-100
	let loadingStage = $state(''); // Current loading stage description

	// Add statistics state
	let statisticsData = $state<StatisticsData | null>(null);
	let statisticsLoading = $state(false);
	let statisticsError = $state('');

	// Helper to ensure a value is a Date object
	function getDateObject(val: any) {
		if (!val) return null;
		return val instanceof Date ? val : new Date(val);
	}

	function addMarkersToMap(data: TrackerLocation[], reset = true) {
		if (!map || !L) {
			console.log('❌ [Statistics] Map or L not available');
			return;
		}

		// Clear existing polylines and markers only if resetting
		if (reset) {
			polylines.forEach((polyline: any) => {
				if (map) map.removeLayer(polyline);
			});
			polylines = [];
			markers.forEach((marker: any) => {
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
			.filter((item) => {
				const hasValidCoords =
					item.coordinates &&
					typeof item.coordinates.lat === 'number' &&
					typeof item.coordinates.lng === 'number';
				if (!hasValidCoords) {
					console.log(
						'❌ [Statistics] Filtered out item with invalid coordinates:',
						item.coordinates
					);
				}
				return hasValidCoords;
			})
			.sort((a, b) => {
				const dateA = new Date(a.recorded_at || a.created_at).getTime();
				const dateB = new Date(b.recorded_at || b.created_at).getTime();
				return dateA - dateB;
			});

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
			const {
				data: { session },
				error: sessionError
			} = await supabase.auth.getSession();
			if (sessionError || !session) {
				throw new Error('User not authenticated');
			}

			const serviceAdapter = new ServiceAdapter({ session });

			// Use the tracker-data-with-mode endpoint to get geocode data for this specific point
			const result = (await serviceAdapter.edgeFunctionsService.getTrackerDataWithMode(session, {
				startDate: item.recorded_at.split('T')[0],
				endDate: item.recorded_at.split('T')[0],
				limit: 1,
				offset: 0,
				includeStatistics: false
			})) as any;

			// Find the matching point
			const matchingPoint = result.locations?.find(
				(loc: any) =>
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

	// --- Create popup content with timezone-aware time ---
	async function createPopupContentWithTimezone(item: TrackerLocation): Promise<string> {
		const date = item.recorded_at || item.created_at;
		// Use the new timezone-aware formatting function that uses tz_diff
		const formattedDate = formatTimestampWithTimezone(date, item.tz_diff);

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
						<span class="text-gray-600 text-xs">${t('statistics.popupMode')}</span>
						<span class="font-medium text-gray-900 text-xs">${translateTransportMode(transportMode)}</span>
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
				// Re-render tooltip with geocode data and timezone-aware time
				if (currentPopup) {
					const timezoneAwareContent = await createPopupContentWithTimezone(item);
					currentPopup.setContent(timezoneAwareContent);
				}
			} catch (error) {
				console.error('Failed to fetch geocode:', error);
				item.geocode = { error: true };
				if (currentPopup) {
					const timezoneAwareContent = await createPopupContentWithTimezone(item);
					currentPopup.setContent(timezoneAwareContent);
				}
			}
		} else {
			// Update popup with timezone-aware time even if geocode is already loaded
			if (currentPopup) {
				const timezoneAwareContent = await createPopupContentWithTimezone(item);
				currentPopup.setContent(timezoneAwareContent);
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
					.replace(/^./, (str) => str.toUpperCase())
					.replace(/_/g, ' ')
					.trim();
				return [formattedKey, value];
			})
			.sort(([a], [b]) => (a as string).localeCompare(b as string));

		// Always append class and type if present on the geocode object itself
		const extraRows: string[] = [];
		if ((data as GeocodeData).class) {
			extraRows.push(
				`<tr><td class='pr-2 text-gray-600 align-top py-0.5 text-xs font-medium'>Class:</td><td class='text-gray-900 py-0.5 text-xs'>${(data as GeocodeData).class}</td></tr>`
			);
		}
		if ((data as GeocodeData).type) {
			extraRows.push(
				`<tr><td class='pr-2 text-gray-600 align-top py-0.5 text-xs font-medium'>Type:</td><td class='text-gray-900 py-0.5 text-xs'>${(data as GeocodeData).type}</td></tr>`
			);
		}

		const rows =
			allFields
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
		const formattedDate = formatTimestampWithTimezone(date, item.tz_diff);
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
						<span class="text-gray-600 text-xs">${t('statistics.popupMode')}</span>
						<span class="font-medium text-gray-900 text-xs">${translateTransportMode(transportMode)}</span>
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

	function clearMapMarkers() {
		markers.forEach((marker: any) => {
			if (map) {
				map.removeLayer(marker);
			}
		});
		markers = [];

		polylines.forEach((polyline: any) => {
			if (map) {
				map.removeLayer(polyline);
			}
		});
		polylines = [];

		// Clear selected markers
		selectedMarkers = [];
	}

	function selectMarker(marker: any) {
		if (!isEditMode) return;

		if (selectedMarkers.includes(marker)) {
			// Deselect
			selectedMarkers = selectedMarkers.filter((m: any) => m !== marker);
			marker.setStyle({ radius: 3, fillOpacity: 0.6 });
		} else {
			// Select
			selectedMarkers.push(marker);
			marker.setStyle({ radius: 5, fillOpacity: 0.9, weight: 2, color: '#ff0000' });
		}
	}

	function fitMapToMarkers() {
		if (!map || (markers.length === 0 && polylines.length === 0)) return;

		const allLayers = [...markers, ...polylines];
		const group = L.featureGroup(allLayers);
		map.fitBounds(group.getBounds(), { padding: [20, 20] });
	}

	// Track last filter state to prevent infinite loops
	let lastFilterState = $state('');
	let hasLoadedInitialData = $state(false);
	let dataLoadTimeout: ReturnType<typeof setTimeout> | null = null;

	// Debounced data loading function
	function debouncedLoadData(_reset = true) {
		if (dataLoadTimeout) {
			clearTimeout(dataLoadTimeout);
		}
		dataLoadTimeout = setTimeout(() => {
			if (map && !isLoading) {
				console.log('🔄 Debounced data load triggered');
				fetchMapDataAndStatistics(0);
			}
		}, 300); // 300ms debounce
	}

	// Initialize lastFilterState with current date range to prevent reactive statement from firing on initial load
	$effect(() => {
		if (appState.filtersStartDate && appState.filtersEndDate && !lastFilterState) {
			const initialFilterState = {
				startDate: getDateObject(appState.filtersStartDate)?.toISOString().split('T')[0] || '',
				endDate: getDateObject(appState.filtersEndDate)?.toISOString().split('T')[0] || ''
			};
			lastFilterState = JSON.stringify(initialFilterState);
		}
	});

	// Single consolidated effect for date changes
	$effect(() => {
		if (browser && !isInitializing && hasLoadedInitialData && map && !isLoading) {
			const filterState = {
				startDate: getDateObject(appState.filtersStartDate)?.toISOString().split('T')[0] || '',
				endDate: getDateObject(appState.filtersEndDate)?.toISOString().split('T')[0] || ''
			};

			const filterStateString = JSON.stringify(filterState);

			// Only reload if we have some filter applied and the state actually changed
			// Only load when a full range is selected (both start and end present)
			if (filterState.startDate && filterState.endDate && filterStateString !== lastFilterState) {
				console.log('🔍 State changed, triggering debounced data load:', {
					oldState: lastFilterState,
					newState: filterStateString,
					hasMap: !!map
				});
				lastFilterState = filterStateString;
				debouncedLoadData(true);
			}
		}
	});

	// Helper function to translate transport mode names
	function translateTransportMode(mode: string): string {
		switch (mode?.toLowerCase()) {
			case 'car':
				return t('statistics.car');
			case 'train':
				return t('statistics.train');
			case 'airplane':
			case 'plane':
				return t('statistics.airplane');
			case 'cycling':
			case 'bike':
				return t('statistics.cycling');
			case 'walking':
			case 'walk':
				return t('statistics.walking');
			case 'stationary':
				return t('statistics.stationary');
			case 'unknown':
			default:
				return t('statistics.unknown');
		}
	}

	// Function to get total count of records for progress indication
	async function getTotalCount(): Promise<number> {
		try {
			isCountingRecords = true;
			loadingStage = t('statistics.countingRecords');
			loadingProgress = 10;

			const startDate = appState.filtersStartDate
				? getDateObject(appState.filtersStartDate)?.toISOString().split('T')[0]
				: '';
			const endDate = appState.filtersEndDate
				? getDateObject(appState.filtersEndDate)?.toISOString().split('T')[0]
				: '';

			const {
				data: { session },
				error: sessionError
			} = await supabase.auth.getSession();
			if (sessionError || !session) {
				throw new Error('User not authenticated');
			}

			// Use direct Supabase query for more reliable count
			let countQuery = supabase.from('tracker_data').select('*', { count: 'exact', head: true });

			// Apply date filters
			if (startDate) {
				countQuery = countQuery.gte('recorded_at', startDate);
			}
			if (endDate) {
				countQuery = countQuery.lte('recorded_at', endDate + ' 23:59:59');
			}

			const { count, error: countError } = await countQuery;

			if (countError) {
				console.error('Error getting count from database:', countError);
				// Fallback to Edge Function
				const serviceAdapter = new ServiceAdapter({ session });
				const result = (await serviceAdapter.edgeFunctionsService.getTrackerDataWithMode(session, {
					startDate,
					endDate,
					limit: 100,
					offset: 0,
					includeStatistics: false
				})) as { total?: number; hasMore?: boolean };

				const total = result.total || 0;
				loadingProgress = 20;
				loadingStage = t('statistics.foundRecords', { count: total.toLocaleString() });
				return total;
			}

			const total = count || 0;
			loadingProgress = 20;
			loadingStage = t('statistics.foundRecords', { count: total.toLocaleString() });

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
	async function fetchMapDataAndStatistics(loadMoreOffset: number = 0): Promise<void> {
		// Prevent duplicate calls
		if (isLoading && loadMoreOffset === 0) {
			console.log('🔄 Data loading already in progress, skipping duplicate call');
			return;
		}

		try {
			// Set loading states - map loading for initial loads and date range changes, not for "load more"
			if (loadMoreOffset === 0) {
				isLoading = true;
				isInitialLoad = false;
			}
			statisticsLoading = true;
			statisticsError = '';

			// If this is the initial load, get the total count first for progress indication
			if (loadMoreOffset === 0) {
				loadingStage = t('statistics.gettingRecordCount');
				loadingProgress = 5;
				totalPoints = await getTotalCount();
			}

			const startDate = appState.filtersStartDate
				? getDateObject(appState.filtersStartDate)?.toISOString().split('T')[0]
				: '';
			const endDate = appState.filtersEndDate
				? getDateObject(appState.filtersEndDate)?.toISOString().split('T')[0]
				: '';

			// Don't fetch data if no date range is set
			if (!startDate && !endDate) {
				console.log('📅 No date range set, skipping data fetch');
				return;
			}

			console.log('📅 Date range being sent to API:', { startDate, endDate });

			// Get current user's session
			const {
				data: { session },
				error: sessionError
			} = await supabase.auth.getSession();
			if (sessionError || !session) {
				console.error('Session error:', sessionError);
				console.error('Session data:', session);
				throw new Error('User not authenticated');
			}

			// Update progress for data fetching
			loadingStage =
				loadMoreOffset === 0 ? t('statistics.loadingInitialData') : t('statistics.loadingMoreData');
			loadingProgress = loadMoreOffset === 0 ? 30 : 60;

			const serviceAdapter = new ServiceAdapter({ session });

			type TrackerApiResponse = {
				total?: number;
				locations?: TrackerLocation[];
				hasMore?: boolean;
				statistics?: StatisticsData;
			};

			// Optimize: Make a single API call to get both data and statistics
			// Only include statistics on initial load (not when loading more data)
			const shouldIncludeStatistics = loadMoreOffset === 0;
			const currentDateRange = `${startDate}_${endDate}`;
			const needsNewStatistics =
				shouldIncludeStatistics &&
				(!statisticsData || statisticsData._dateRange !== currentDateRange);

			let result = (await serviceAdapter.edgeFunctionsService.getTrackerDataWithMode(session, {
				startDate,
				endDate,
				limit: 5000,
				offset: loadMoreOffset,
				includeStatistics: needsNewStatistics // Include statistics only when needed
			})) as TrackerApiResponse;

			// Check if the result indicates an error
			if (result && typeof result === 'object' && 'success' in result && !result.success) {
				throw new Error((result as any).error || 'Failed to fetch data');
			}

			// Update progress for data processing
			loadingStage = t('statistics.processingData');
			loadingProgress = loadMoreOffset === 0 ? 70 : 80;

			// Process statistics if they were included in the response
			if (needsNewStatistics && result.statistics) {
				// Store the date range with the statistics to track when they were calculated
				statisticsData = {
					...result.statistics,
					_dateRange: currentDateRange
				};
			}

			// Transform and set location data for map
			if (result.locations) {
				loadingStage = t('statistics.transformingData');
				loadingProgress = loadMoreOffset === 0 ? 85 : 90;

				const transformedLocations: TrackerLocation[] = (result.locations as unknown[]).map(
					(location, index) => {
						const loc = location as Record<string, unknown>;

						return {
							id: `${loc.user_id}_${loc.recorded_at}_${loadMoreOffset + index}`,
							name:
								loc.geocode && typeof loc.geocode === 'object' && 'display_name' in loc.geocode
									? (loc.geocode as GeocodeData).display_name || 'Unknown Location'
									: 'Unknown Location',
							description:
								loc.geocode && typeof loc.geocode === 'object' && 'name' in loc.geocode
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
							city:
								loc.geocode && typeof loc.geocode === 'object' && 'city' in loc.geocode
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
							geocode: loc.geocode as GeocodeData | string | null,
							tz_diff: loc.tz_diff as number | undefined
						};
					}
				);

				if (loadMoreOffset === 0) {
					// Initial load - replace all data
					locationData = transformedLocations;
					addMarkersToMap(transformedLocations, true);
					if (transformedLocations.length > 0) {
						fitMapToMarkers();
					}
				} else {
					// Load more - append to existing data
					locationData = [...locationData, ...transformedLocations];
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
			loadingStage = t('statistics.complete');
			loadingProgress = 100;
		} catch (err) {
			console.error('Error fetching map data and statistics:', err);
			statisticsError = err instanceof Error ? err.message : String(err);
			if (loadMoreOffset === 0) {
				statisticsData = null;
			}
			loadingStage = t('statistics.errorOccurred');
			loadingProgress = 0;
		} finally {
			// Reset loading states
			if (loadMoreOffset === 0) {
				isLoading = false;
			}
			statisticsLoading = false;
			// Reset progress after a short delay
			setTimeout(() => {
				loadingProgress = 0;
				loadingStage = '';
			}, 1000);
		}
	}

	// Function to load more data points
	async function loadMoreData() {
		if (isLoading) return;

		isLoading = true;
		try {
			console.log(t('statistics.loadingMoreDataFromOffset', { offset: currentOffset }));
			await fetchMapDataAndStatistics(currentOffset);
		} catch (error) {
			console.error(t('statistics.errorLoadingMoreData'), error);
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
				.reduce(
					(sum: number, t: { distance: number }) =>
						sum + (typeof t.distance === 'number' ? t.distance : 0),
					0
				);
		}

		const greenDistance = getGreenDistance();

		return [
			{
				id: 1,
				title: t('statistics.totalDistance'),
				value: statisticsData.totalDistance ?? '0 km',
				icon: Navigation,
				color: 'blue'
			},
			{
				id: 'green',
				title: t('statistics.distanceTravelledGreen'),
				value:
					greenDistance > 0
						? `${greenDistance.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`
						: '0 km',
				icon: Activity,
				color: 'green'
			},
			{
				id: 2,
				title: t('statistics.earthCircumferences'),
				value: formatEarthCircumferences(statisticsData.earthCircumferences),
				icon: Globe2,
				color: 'blue'
			},
			{
				id: 3,
				title: t('statistics.geopointsTracked'),
				value: statisticsData.geopoints?.toLocaleString() ?? '0',
				icon: MapPin,
				color: 'blue'
			},
			{
				id: 4,
				title: t('statistics.timeMoving'),
				value: statisticsData.timeSpentMoving ?? '0h',
				icon: Clock,
				color: 'blue'
			},
			{
				id: 5,
				title: t('statistics.uniquePlaces'),
				value: statisticsData.uniquePlaces?.toLocaleString() ?? '0',
				icon: Flag,
				color: 'blue'
			},
			{
				id: 6,
				title: t('statistics.countriesVisited'),
				value: statisticsData.countriesVisited?.toString() ?? '0',
				icon: Globe2,
				color: 'blue'
			},
			{
				id: 7,
				title: t('statistics.approximateSteps'),
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
	// Format timestamp with timezone information using tz_diff
	function formatTimestampWithTimezone(timestamp: string | Date, tzDiff?: number): string {
		if (!timestamp) return 'Unknown date';

		const date = new Date(timestamp);
		if (isNaN(date.getTime())) return 'Invalid date';

		// Format the date part
		const formattedDate = format(date, 'MMM d, yyyy, HH:mm');

		// If we have timezone difference, add it to the timestamp
		if (tzDiff !== undefined && tzDiff !== null) {
			// Format timezone offset as +HH:MM or -HH:MM
			const sign = tzDiff >= 0 ? '+' : '-';
			const absHours = Math.abs(tzDiff);
			const wholeHours = Math.floor(absHours);
			const minutesOffset = Math.round((absHours - wholeHours) * 60);

			const timezoneString = `${sign}${String(wholeHours).padStart(2, '0')}:${String(minutesOffset).padStart(2, '0')}`;

			return `${formattedDate}${timezoneString}`;
		}

		// Fallback to date without timezone if tz_diff is not available
		return formattedDate;
	}

	onDestroy(() => {
		clearMapMarkers();
		if (dataLoadTimeout) {
			clearTimeout(dataLoadTimeout);
		}
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
		}).addTo(map) as any;

		// --- Theme switching observer ---
		const updateMapTheme = () => {
			if (!map || !L) return;
			const isDark = document.documentElement.classList.contains('dark');
			const newUrl = getTileLayerUrl();
			const newAttribution = getAttribution();
			if (currentTileLayer && (currentTileLayer as any)._url !== newUrl) {
				map.removeLayer(currentTileLayer);
				currentTileLayer = L.tileLayer(newUrl, { attribution: newAttribution }).addTo(map) as any;
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
				<div class="font-semibold mb-2 text-xs text-gray-900 dark:text-gray-100">${t('statistics.modeColors')}</div>
				<div class="flex flex-col gap-1">
					<div class="flex items-center gap-2 text-gray-900 dark:text-gray-100"><span style="display:inline-block;width:16px;height:4px;background:#ef4444;"></span>${t('statistics.car')}</div>
					<div class="flex items-center gap-2 text-gray-900 dark:text-gray-100"><span style="display:inline-block;width:16px;height:4px;background:#a21caf;"></span>${t('statistics.train')}</div>
					<div class="flex items-center gap-2 text-gray-900 dark:text-gray-100"><span style="display:inline-block;width:16px;height:4px;background:#000000;"></span>${t('statistics.airplane')}</div>
					<div class="flex items-center gap-2 text-gray-900 dark:text-gray-100"><span style="display:inline-block;width:16px;height:4px;background:#f59e42;"></span>${t('statistics.cycling')}</div>
					<div class="flex items-center gap-2 text-gray-900 dark:text-gray-100"><span style="display:inline-block;width:16px;height:4px;background:#10b981;"></span>${t('statistics.walking')}</div>
					<div class="flex items-center gap-2 text-gray-900 dark:text-gray-100"><span style="display:inline-block;width:16px;height:4px;background:#6b7280;"></span>${t('statistics.unknown')}</div>
				</div>
			`;
			map.getContainer().appendChild(legend);
		}

		// Set default date range to last 7 days if not already set
		if (!appState.filtersStartDate || !appState.filtersEndDate) {
			const today = new Date();
			const sevenDaysAgo = new Date();
			sevenDaysAgo.setDate(today.getDate() - 6); // Last 7 days includes today and 6 days before
			appState.filtersStartDate = sevenDaysAgo;
			appState.filtersEndDate = today;
			console.log('📅 Set default date range:', { start: sevenDaysAgo, end: today });

			await fetchMapDataAndStatistics(0); // Allow cache for initial load
		} else {
			console.log('📅 Using existing date range:', {
				start: appState.filtersStartDate,
				end: appState.filtersEndDate
			});

			// Debug: Check if the date range makes sense
			const startDate = appState.filtersStartDate;
			const endDate = appState.filtersEndDate;
			console.log('📅 Date range debug:', {
				startDate: startDate?.toISOString(),
				endDate: endDate?.toISOString(),
				startDateType: typeof startDate,
				endDateType: typeof endDate,
				isStartDateValid: startDate instanceof Date && !isNaN(startDate.getTime()),
				isEndDateValid: endDate instanceof Date && !isNaN(endDate.getTime())
			});

			// Load initial data only if dates are already set
			await fetchMapDataAndStatistics(0); // Allow cache for initial load
		}

		// Mark initialization as complete
		isInitializing = false;
		hasLoadedInitialData = true;
	});

	let localStartDate = $state(
		appState.filtersStartDate instanceof Date ? appState.filtersStartDate : ''
	);
	let localEndDate = $state(appState.filtersEndDate instanceof Date ? appState.filtersEndDate : '');

	$effect(() => {
		localStartDate = appState.filtersStartDate instanceof Date ? appState.filtersStartDate : '';
		localEndDate = appState.filtersEndDate instanceof Date ? appState.filtersEndDate : '';
	});

	// Remove handleDateRangeChange and its on:change binding from DateRangePicker
	// Add MutationObserver logic in onMount
	onMount(() => {
		let lastText = '';
		const dateField = document.querySelector('.datepicker-statistics-fix .date-field .date');
		if (!dateField) return;
		const observer = new MutationObserver(() => {
			const text = dateField.textContent?.trim();
			if (!text || text === lastText) return;
			lastText = text;
			// Try to parse the date range
			const match = text.match(/([A-Za-z]{3,} \d{1,2}, \d{4}) - ([A-Za-z]{3,} \d{1,2}, \d{4})/);
			if (match) {
				const [, startStr, endStr] = match;
				const start = new Date(startStr);
				const end = new Date(endStr);
				if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
					appState.filtersStartDate = start;
					appState.filtersEndDate = end;
					void fetchMapDataAndStatistics(0);
				}
			}
		});
		observer.observe(dateField, { childList: true, subtree: true, characterData: true });
		return () => observer.disconnect();
	});

	// In the DateRangePicker usage:
	// <DateRangePicker bind:startDate={localStartDate} bind:endDate={localEndDate} pickLabel={t('datePicker.pickDateRange')} />
	// (remove on:change={handleDateRangeChange})
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
		/* Calendar icon now uses SVG - no custom CSS needed */

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

		.datepicker-statistics-fix .date-filter {
			position: static !important;
		}
		.datepicker-statistics-fix .datepicker-dropdown {
			position: absolute !important;
			right: 0 !important;
			left: auto !important;
			min-width: 340px;
			max-width: 95vw;
			z-index: 3000 !important;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
			border-radius: 12px;
			margin-top: 8px;
			overflow-x: auto;
		}
		@media (max-width: 600px) {
			.datepicker-statistics-fix .datepicker-dropdown {
				left: 0 !important;
				right: auto !important;
				min-width: 0;
				width: 98vw;
				max-width: 98vw;
			}
		}
		.datepicker-statistics-fix .date-field,
		.datepicker-statistics-fix .date-field.open {
			cursor: pointer !important;
		}
		.datepicker-statistics-fix .calendars-container {
			right: 0 !important;
			left: auto !important;
			max-width: 95vw !important;
			overflow-x: auto !important;
			position: absolute !important;
			z-index: 3000 !important;
		}
		@media (max-width: 600px) {
			.datepicker-statistics-fix .calendars-container {
				left: 0 !important;
				right: auto !important;
				width: 98vw !important;
				max-width: 98vw !important;
			}
		}
	</style>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col justify-between gap-4 md:flex-row md:items-start">
		<div class="flex min-w-0 items-center gap-2">
			<BarChart class="h-8 w-8 flex-shrink-0 text-blue-600 dark:text-gray-400" />
			<h1 class="text-3xl font-bold whitespace-nowrap text-gray-900 dark:text-gray-100">
				{t('navigation.statistics')}
			</h1>
		</div>
		<div class="flex flex-1 items-center justify-end gap-6" style="z-index: 2001;">
			<div class="datepicker-statistics-fix relative">
				<DateRangePicker
					bind:startDate={localStartDate}
					bind:endDate={localEndDate}
					pickLabel={t('datePicker.pickDateRange')}
				/>
			</div>
		</div>
	</div>

	<!-- Map -->
	<div
		class="relative h-96 w-full rounded-lg bg-gray-100 md:h-[600px] dark:bg-gray-900 {isEditMode
			? 'cursor-pointer ring-4 ring-blue-400'
			: ''}"
		style={isEditMode ? 'cursor: pointer;' : ''}
	>
		{#if isLoading}
			<div
				class="absolute inset-0 z-[2000] flex flex-col items-center justify-center bg-white/70 dark:bg-gray-900/70"
			>
				<Loader2 class="h-16 w-16 animate-spin text-blue-500 dark:text-blue-300" />
				<div class="mt-4 text-center">
					<div class="mb-2 text-lg font-medium text-gray-700 dark:text-gray-200">
						{loadingStage || t('statistics.loading')}
					</div>
					{#if loadingProgress > 0}
						<div class="mb-2 h-2 w-64 rounded-full bg-gray-200 dark:bg-gray-700">
							<div
								class="h-2 rounded-full bg-blue-500 transition-all duration-300 ease-out"
								style="width: {loadingProgress}%"
							></div>
						</div>
						<div class="text-sm text-gray-600 dark:text-gray-400">
							{t('statistics.percentComplete', { percent: loadingProgress })}
						</div>
					{/if}
					{#if totalPoints > 0}
						<div class="mt-1 text-sm text-gray-500 dark:text-gray-400">
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
						{t('statistics.noDataMessage')}
					</h3>
					<p class="mb-4 text-sm text-gray-500 dark:text-gray-400" style="pointer-events: none;">
						{t('statistics.noDataMessage')}
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

		<!-- Selection Info -->
		{#if isEditMode && selectedMarkers.length > 0}
			<div class="absolute bottom-4 left-4 z-[1001] rounded bg-white p-3 shadow dark:bg-gray-800">
				<div class="text-sm text-gray-700 dark:text-gray-300">
					{selectedMarkers.length} point{selectedMarkers.length !== 1 ? 's' : ''} selected
				</div>
			</div>
		{/if}

		<!-- Load More Button -->
		{#if locationData.length < totalPoints}
			<div class="absolute right-4 bottom-4 z-[1001] flex flex-col gap-2">
				<button
					onclick={() => loadMoreData()}
					disabled={isLoading}
					class="rounded bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
				>
					{#if isLoading}
						<Loader2 class="mr-1 inline h-4 w-4 animate-spin" />
						{#if loadingStage}
							<span class="text-xs text-gray-500">{loadingStage}</span>
						{/if}
					{:else}
						{t('statistics.loadMore')} (+5,000) ({locationData.length.toLocaleString()}/{totalPoints.toLocaleString()})
					{/if}
				</button>
			</div>
		{/if}
	</div>

	<!-- Stats -->
	{#if statisticsError}
		<div class="mb-8 py-8 text-center font-semibold text-red-600 dark:text-red-400">
			{t('statistics.errorLoadingStatistics')}
			{statisticsError}
		</div>
	{:else if statisticsLoading}
		<!-- Loading Placeholders -->
		<!-- Top section: 4 tiles that span 25% width on larger screens -->
		<div class="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
			{#each Array(8) as i (i)}
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
		</div>

		<!-- Bottom section: 2 tiles that span 50% width -->
		<div class="mb-8 flex flex-col gap-6 md:flex-row">
			{#each Array(2) as i (i)}
				<div
					class="w-full rounded-lg border border-gray-200 bg-white p-4 md:w-1/2 dark:border-gray-700 dark:bg-gray-800"
				>
					<div class="mb-3 flex items-center gap-2">
						<div class="h-5 w-5 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
						<div class="h-5 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
					</div>
					<div class="space-y-3">
						{#each Array(3) as i (i)}
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
			{#each getStatistics() as stat (stat.title)}
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

	<!-- Country Time Distribution and Modes of Transport: Side by Side -->
	{#if statisticsData && !statisticsLoading && !statisticsError}
		<div class="mb-8 flex flex-col gap-6 md:flex-row">
			{#if statisticsData.countryTimeDistribution && statisticsData.countryTimeDistribution.length > 0}
				<div class="w-full md:w-1/2">
					<div
						class="w-full rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
					>
						<div class="mb-3 flex items-center gap-2">
							<Globe2 class="h-5 w-5 text-blue-500" />
							<span class="text-lg font-semibold text-gray-800 dark:text-gray-100"
								>{t('statistics.countryTimeDistribution')}</span
							>
						</div>
						<div class="space-y-4">
							{#each statisticsData.countryTimeDistribution as country (country.country_code)}
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
						<div class="mt-4 text-xs text-gray-500 dark:text-gray-400">
							{t('statistics.ofSelectedPeriod')}
						</div>
					</div>
				</div>
			{/if}

			{#if statisticsData.transport && statisticsData.transport.length > 0}
				<div class="w-full md:w-1/2">
					<div
						class="w-full rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
					>
						<div class="mb-3 flex items-center gap-2">
							<Route class="h-5 w-5 text-blue-500" />
							<span class="text-lg font-semibold text-gray-800 dark:text-gray-100"
								>{t('statistics.transportModes')}</span
							>
						</div>
						<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
							<thead>
								<tr>
									<th
										class="px-4 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
										>{t('statistics.mode')}</th
									>
									<th
										class="px-4 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
										>{t('statistics.distanceKm')}</th
									>
									<th
										class="px-4 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
										>{t('statistics.time')}</th
									>
									<th
										class="px-4 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
										>{t('statistics.percentOfTotal')}</th
									>
									<th
										class="px-4 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
										>{t('statistics.points')}</th
									>
								</tr>
							</thead>
							<tbody>
								{#each statisticsData.transport
									.slice()
									.filter((mode) => mode.mode !== 'stationary')
									.sort((a, b) => b.distance - a.distance) as mode (mode.mode)}
									<tr>
										<td class="px-4 py-2 text-sm whitespace-nowrap text-gray-900 dark:text-gray-100"
											>{translateTransportMode(mode.mode)}</td
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
					>{t('statistics.trainStationVisits')}</span
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
						.sort((a: { count: number }, b: { count: number }) => b.count - a.count) as station (station.name)}
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
