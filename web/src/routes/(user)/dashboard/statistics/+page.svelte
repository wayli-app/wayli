<script lang="ts">
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
		Import,
		AlertTriangle,
		ChevronRight,
		X,
		Flame
	} from 'lucide-svelte';
	import { onMount, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';

	import DateRangePicker from '$lib/components/ui/date-range-picker.svelte';
	import StatisticsCharts from '$lib/components/statistics/StatisticsCharts.svelte';
	import { percentDelta } from '$lib/services/statistics/aggregate';
	import { getCountryNameReactive, translate } from '$lib/i18n';
	import { state as appState } from '$lib/stores/app-state.svelte';
	import { fluxbase } from '$lib/fluxbase';
	import { ClientStatisticsService } from '$lib/services/client-statistics.service';
	import { segmentByGaps } from '$lib/services/transport-mode';
	import { HomeAddressAdapter } from '$lib/services/api/adapters/home-address-adapter';
	import { TripExclusionsApiService } from '$lib/services/api/trip-exclusions-api.service';
	import {
		getTransportDetectionReasonLabel,
		type TransportDetectionReason
	} from '$lib/types/transport-detection-reasons';
	import { formatDateInTimezone, getTimezoneFromOffset } from '$lib/utils/timezone-utils';
	import { formatLocalDate } from '$lib/utils/utils';

	import type { Map as LeafletMap } from 'leaflet';
	import { watchMapTheme, TILE_URLS } from '$lib/utils/map-theme';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { SvelteDate } from 'svelte/reactivity';

	// Use the reactive translation function
	let t = $derived($translate);

	// Interfaces
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
		distance?: number;
		geocode?: any;
		tz_diff?: number;
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
		geocodingStats?: {
			total: number;
			geocoded: number;
			successRate: number;
		};
	}

	// Map state
	let map: LeafletMap;
	let L: typeof import('leaflet');
	let mapContainer: HTMLDivElement;
	let currentTileLayer = $state<any>(null);
	let cleanupThemeWatcher: (() => void) | null = null;
	let isInitializing = $state(true);
	let tripFilterTitle = $state<string | null>(null);
	// Trailing ~53 weeks of points (date-picker-independent) for the activity
	// calendar + records/streaks widgets. Populated once on mount.
	let historyPoints = $state<any[]>([]);
	let calendarLoading = $state(true);
	// Use a regular array instead of $state to avoid triggering effects
	let mapMarkers: any[] = [];
	let selectedPoint: any = $state(null);
	// Segment editor: click a point → its whole 5-min-gap segment is selected and
	// can be relabelled. `segmentGroups` is index groups into the sorted points;
	// `selectedSegmentIdxs` is the set of selected segment indices (shift-click
	// adds/removes, so multiple segments can be relabelled at once).
	let segmentGroups: number[][] = [];
	let selectedSegmentIdxs = $state<Set<number>>(new Set());
	let segmentHighlight: any[] = [];
	let isUpdatingMode = $state(false);
	// Heat layer: shows where the user actually spends time (slow/stationary
	// points), built from the same rawDataPoints the circle-marker map uses.
	let heatLayer: any = null;
	let showHeatmap = $state(false);

	// Loading and progress state
	let isLoading = $state(false);
	let isInitialLoad = $state(true);
	let loadingProgress = $state(0);
	let loadingStage = $state('');
	let progressAnimationId = $state<NodeJS.Timeout | null>(null);
	let isHandlingDateChange = $state(false);

	// Statistics state
	let statisticsData = $state<StatisticsData | null>(null);
	let statisticsLoading = $state(false);
	let statisticsError = $state('');

	// Exclusion zones state
	let homeAddress = $state<any>(null);
	let tripExclusions = $state<Array<any>>([]);
	let exclusionZoneCircles: any[] = []; // Store circle references for cleanup

	// Radius constants for exclusion zones (in meters)
	const DEFAULT_EXCLUSION_RADIUS = 100; // Point-level exclusion
	const CITY_EXCLUSION_RADIUS = 5000; // City-level exclusion (5km)

	// Warning state
	let showLargeDatasetWarning = $state(false);
	let totalPointsCount = $state(0);
	let userConfirmedLargeDataset = $state(false);

	// Service instance
	let statisticsService = $state<ClientStatisticsService | null>(null);

	// Cleanup tracking for memory leak prevention
	let themeObserver: MutationObserver | null = null;
	let mapInitTimeout: NodeJS.Timeout | null = null;
	let mapInvalidateTimeout: NodeJS.Timeout | null = null;

	// Helper to ensure a value is a Date object
	function getDateObject(val: any) {
		if (!val) return null;
		return val instanceof Date ? val : new Date(val);
	}

	// Smooth progress animation function (reused from original)
	function animateProgress(target: number, duration: number = 800, immediate: boolean = false) {
		if (progressAnimationId) {
			clearTimeout(progressAnimationId);
		}

		// If immediate is true or we're starting from 0, set immediately without animation
		if (immediate || (loadingProgress === 0 && target > 0)) {
			loadingProgress = target;
			return;
		}

		const start = loadingProgress;
		const change = target - start;
		const startTime = Date.now();

		function updateProgress() {
			const elapsed = Date.now() - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const easeOutCubic = 1 - Math.pow(1 - progress, 3);
			const currentProgress = start + change * easeOutCubic;
			loadingProgress = Math.round(currentProgress);

			if (progress < 1) {
				progressAnimationId = setTimeout(updateProgress, 16);
			} else {
				loadingProgress = target;
				progressAnimationId = null;
			}
		}

		updateProgress();
	}

	// Clean up animation on component unmount
	onDestroy(() => {
		console.log('🧹 Cleaning up statistics page resources...');

		// Clear animation timeout
		if (progressAnimationId) {
			clearTimeout(progressAnimationId);
			progressAnimationId = null;
		}

		// Clear map initialization timeouts
		if (mapInitTimeout) {
			clearTimeout(mapInitTimeout);
			mapInitTimeout = null;
		}
		if (mapInvalidateTimeout) {
			clearTimeout(mapInvalidateTimeout);
			mapInvalidateTimeout = null;
		}

		// Disconnect theme watcher
		cleanupThemeWatcher?.();
		cleanupThemeWatcher = null;

		// Clear map markers and their event listeners
		if (map && L) {
			clearMapMarkers();

			// Destroy map instance
			map.remove();
			map = null as any;
		}

		// Reset service to free accumulated data
		if (statisticsService) {
			statisticsService.reset();
			statisticsService = null;
		}
	});

	// Initialize the statistics service
	function initializeService() {
		if (!statisticsService) {
			statisticsService = new ClientStatisticsService();
		}
	}

	// Check if dataset is large and show warning
	async function checkDatasetSize(): Promise<boolean> {
		if (!statisticsService) return false;

		try {
			// Format dates in local timezone to avoid timezone shifting
			const startDate = formatLocalDate(appState.filtersStartDate);
			const endDate = formatLocalDate(appState.filtersEndDate);

			const { data, error: sessionError } = await fluxbase.auth.getSession();
			if (sessionError || !data?.session) {
				throw new Error('User not authenticated');
			}

			totalPointsCount = await statisticsService.getTotalCount(
				data.session.user.id,
				startDate,
				endDate
			);

			if (totalPointsCount > 100000) {
				showLargeDatasetWarning = true;
				return false; // Don't proceed until user confirms
			}

			return true; // Proceed with loading
		} catch (error) {
			console.error('❌ Error checking dataset size:', error);
			toast.error('Failed to check dataset size');
			return false;
		}
	}

	// Handle user confirmation for large dataset
	function handleLargeDatasetConfirmation(proceed: boolean) {
		showLargeDatasetWarning = false;
		if (proceed) {
			userConfirmedLargeDataset = true;
			loadStatisticsData();
		}
	}

	// Main function to load statistics data using the new service
	async function loadStatisticsData(): Promise<void> {
		if (!statisticsService) {
			initializeService();
		}

		try {
			isLoading = true;
			isInitialLoad = false;
			statisticsLoading = true;
			statisticsError = '';
			loadingProgress = 0; // Reset progress to 0 for new loading session

			// Format dates in local timezone to avoid timezone shifting
			const startDate = formatLocalDate(appState.filtersStartDate);
			const endDate = formatLocalDate(appState.filtersEndDate);

			if (!startDate && !endDate) {
				return;
			}

			const { data, error: sessionError } = await fluxbase.auth.getSession();
			if (sessionError || !data?.session) {
				throw new Error('User not authenticated');
			}

			// Load and process data with progress tracking
			const statistics = await statisticsService!.loadAndProcessData(
				data.session.user.id,
				startDate,
				endDate,
				// Progress callback
				(progress) => {
					loadingStage = progress.stage;
					animateProgress(progress.percentage);
				},
				// Error callback
				(error, canRetry) => {
					console.error('❌ Error during processing:', error);
					statisticsError = error.message;
					if (canRetry) {
						toast.error(`Processing error: ${error.message}. You can retry.`);
					} else {
						toast.error(`Processing failed: ${error.message}`);
					}
				}
			);

			// Get formatted statistics for display
			statisticsData = statisticsService!.getFormattedStatistics();

			// Draw data points on map
			const rawDataPoints = (statisticsService as any).rawDataPoints;
			if (rawDataPoints && rawDataPoints.length > 0) {
				recomputeSegments(rawDataPoints);
				drawDataPointsOnMap(rawDataPoints);
				// Refresh the heat layer too (only renders if the toggle is on).
				updateHeatmap(rawDataPoints);
			}
		} catch (error) {
			console.error('❌ Error loading statistics:', error);
			statisticsError = error instanceof Error ? error.message : 'Unknown error';
			toast.error('Failed to load statistics');
		} finally {
			isLoading = false;
			statisticsLoading = false;
		}
	}

	// Retry loading with resume capability
	async function retryLoading(): Promise<void> {
		if (statisticsService && statisticsService.isCurrentlyProcessing()) {
			console.log('🔄 Already processing, cannot retry');
			return;
		}

		statisticsError = '';
		await loadStatisticsData();
	}

	// Handle date range changes
	async function handleDateRangeChange() {
		// Prevent concurrent calls
		if (isHandlingDateChange || isLoading) {
			return;
		}

		isHandlingDateChange = true;

		try {
			// Reset state
			userConfirmedLargeDataset = false;
			statisticsData = null;
			statisticsError = '';

			// Clear map markers before loading new data
			clearMapMarkers();

			// CRITICAL: Reset the service to clear accumulated data
			if (statisticsService) {
				statisticsService.reset();
			}

			// Check dataset size first
			const canProceed = await checkDatasetSize();
			if (canProceed) {
				await loadStatisticsData();
			}
		} finally {
			isHandlingDateChange = false;
		}
	}

	// Get statistics for display (reused from original)
	function getStatistics() {
		if (!statisticsData) return [];

		// Helper to sum green distances
		function getGreenDistance() {
			if (!statisticsData || !statisticsData.transport) return 0;
			// Sum distances in meters and convert to kilometers
			const distanceInMeters = statisticsData.transport
				.filter((t: { mode: string }) => greenModes.includes(t.mode))
				.reduce(
					(sum: number, t: { distance: number }) =>
						sum + (typeof t.distance === 'number' ? t.distance : 0),
					0
				);
			return distanceInMeters / 1000; // Convert meters to kilometers
		}

		const greenDistance = getGreenDistance();

		// Half-period trend deltas: split the loaded points chronologically into
		// first half vs second half, then compute the % change. This gives an
		// immediate "trending up/down" signal without a second DB query. Returns
		// null when there's not enough data in the first half.
		const rawPts: any[] = (statisticsService as any)?.rawDataPoints ?? [];
		const sortedPts = [...rawPts].sort(
			(a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
		);
		const mid = Math.floor(sortedPts.length / 2);
		const firstHalf = sortedPts.slice(0, mid);
		const secondHalf = sortedPts.slice(mid);
		const halfDist = (pts: any[]) =>
			pts.reduce((a, p) => a + (typeof p.distance === 'number' ? p.distance : 0), 0);
		const halfTime = (pts: any[]) =>
			pts.reduce((a, p) => a + (typeof p.time_spent === 'number' ? p.time_spent : 0), 0);
		const distDelta =
			firstHalf.length > 0 ? percentDelta(halfDist(firstHalf), halfDist(secondHalf)) : null;
		const timeDelta =
			firstHalf.length > 0 ? percentDelta(halfTime(firstHalf), halfTime(secondHalf)) : null;
		const ptsDelta =
			firstHalf.length > 0 ? percentDelta(firstHalf.length, secondHalf.length) : null;

		return [
			{
				id: 'total-distance',
				title: t('statistics.movingDistance'),
				value: statisticsData.totalDistance ?? '0 km',
				icon: Navigation,
				color: 'blue',
				delta: distDelta
			},
			{
				id: 'green-distance',
				title: t('statistics.distanceTravelledGreen'),
				value:
					greenDistance > 0
						? `${greenDistance.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`
						: '0 km',
				icon: Activity,
				color: 'green'
			},
			{
				id: 'earth-circumferences',
				title: t('statistics.earthCircumferences'),
				value: formatEarthCircumferences(statisticsData.earthCircumferences),
				icon: Globe2,
				color: 'blue'
			},
			{
				id: 'geopoints-tracked',
				title: t('statistics.geopointsTracked'),
				value: statisticsData.geopoints?.toLocaleString() ?? '0',
				icon: MapPin,
				color: 'blue',
				delta: ptsDelta
			},
			{
				id: 'time-moving',
				title: t('statistics.timeMoving'),
				value: statisticsData.timeSpentMoving ?? '0h',
				icon: Clock,
				color: 'blue',
				delta: timeDelta
			},
			{
				id: 'unique-places',
				title: t('statistics.uniquePlaces'),
				value: statisticsData.uniquePlaces?.toLocaleString() ?? '0',
				icon: Flag,
				color: 'blue'
			},
			{
				id: 'countries-visited',
				title: t('statistics.countriesVisited'),
				value: statisticsData.countriesVisited?.toString() ?? '0',
				icon: Globe2,
				color: 'blue'
			},
			{
				id: 'approximate-steps',
				title: t('statistics.approximateSteps'),
				value: statisticsData.steps?.toLocaleString() ?? '0',
				icon: Footprints,
				color: 'blue'
			}
		];
	}
	let localStartDate = $state(
		appState.filtersStartDate instanceof Date ? appState.filtersStartDate : ''
	);
	let localEndDate = $state(appState.filtersEndDate instanceof Date ? appState.filtersEndDate : '');

	// Sync appState to local dates
	$effect(() => {
		localStartDate = appState.filtersStartDate instanceof Date ? appState.filtersStartDate : '';
		localEndDate = appState.filtersEndDate instanceof Date ? appState.filtersEndDate : '';
	});

	// Use MutationObserver to detect date picker changes and trigger data loads
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
					// Update appState directly to trigger the main $effect
					appState.filtersStartDate = start;
					appState.filtersEndDate = end;
					// The main $effect will handle the data loading
				}
			}
		});

		observer.observe(dateField, { childList: true, subtree: true, characterData: true });
		return () => observer.disconnect();
	});

	// Helper functions (reused from original)
	const greenModes = ['walking', 'cycling'];

	function formatEarthCircumferences(circumferences?: number): string {
		if (!circumferences || circumferences === 0) return '0';
		if (circumferences < 0.01) return '< 0.01';
		return circumferences.toFixed(2);
	}

	// Translate transport mode to display name
	function translateTransportMode(mode: string): string {
		// Remove 'transport.' prefix if present
		const cleanMode = mode.replace('transport.', '');

		const modeTranslations: Record<string, string> = {
			walking: t('transport.walking'),
			cycling: t('transport.cycling'),
			car: t('transport.car'),
			train: t('transport.train'),
			airplane: t('transport.airplane'),
			stationary: t('transport.stationary'),
			unknown: t('transport.unknown')
		};
		return modeTranslations[cleanMode] || cleanMode;
	}

	// Get flag emoji for country code
	function getFlagEmoji(countryCode: string): string {
		const codePoints = countryCode
			.toUpperCase()
			.split('')
			.map((char) => 127397 + char.charCodeAt(0));
		return String.fromCodePoint(...codePoints);
	}

	// Transport mode colors
	const transportModeColors: Record<string, string> = {
		car: '#dc2626', // Red
		train: '#7c3aed', // Purple
		airplane: '#000000', // Black
		cycling: '#ea580c', // Orange
		walking: '#16a34a', // Green
		unknown: '#6b7280' // Grey
	};

	// Get color for transport mode
	function getTransportModeColor(mode: string): string {
		const cleanMode = mode.replace('transport.', '');
		return transportModeColors[cleanMode] || transportModeColors.unknown;
	}

	/**
	 * Normalize home address data to handle both formats:
	 * - New format: { address, location: { lat, lon }, display_name }
	 * - Old/Raw format: { display_name, lat, lon, name, layer, address, addendum }
	 */
	function normalizeHomeAddress(raw: any): any {
		if (!raw) return null;

		// If already has location.lat/lon, return as-is
		if (raw.location?.lat && raw.location?.lon) {
			return raw;
		}

		// Otherwise, convert from raw Pelias format
		if (raw.lat !== undefined && raw.lon !== undefined) {
			return {
				address: raw.display_name || raw.name || 'Home',
				location: { lat: raw.lat, lon: raw.lon },
				display_name: raw.display_name,
				layer: raw.layer, // 'locality' for cities, etc.
				name: raw.name
			};
		}

		return null;
	}

	/**
	 * Normalize trip exclusion data to handle both formats:
	 * - New format: { id, name, location: { coordinates: { lat, lng }, ... } }
	 * - Old/Raw format: { id, name, lat, lon, display_name, layer, address, ... }
	 */
	function normalizeTripExclusion(exclusion: any): any {
		if (!exclusion) return null;

		// If already has location.coordinates.lat/lng, return as-is
		if (
			exclusion.location?.coordinates?.lat !== undefined &&
			exclusion.location?.coordinates?.lng !== undefined
		) {
			return exclusion;
		}

		// Otherwise, convert from raw Pelias format
		if (exclusion.lat !== undefined && exclusion.lon !== undefined) {
			return {
				id: exclusion.id,
				name: exclusion.name,
				location: {
					coordinates: {
						lat: exclusion.lat,
						lng: exclusion.lon
					},
					display_name: exclusion.display_name,
					layer: exclusion.layer
				},
				// Preserve other properties
				...(exclusion.created_at && { created_at: exclusion.created_at }),
				...(exclusion.updated_at && { updated_at: exclusion.updated_at })
			};
		}

		return exclusion;
	}

	// Load exclusion zones (home address and trip exclusions)
	async function loadExclusionZones(): Promise<void> {
		try {
			const { data: userData } = await fluxbase.auth.getUser();
			if (!userData || !userData.user) return;

			// Load home address
			const homeAddressAdapter = new HomeAddressAdapter({
				session: { user: userData.user } as any
			});
			const homeData = await homeAddressAdapter.getHomeAddress();
			homeAddress = normalizeHomeAddress(homeData.home_address);

			// Load trip exclusions
			const tripExclusionsService = new TripExclusionsApiService({ fluxbase });
			const exclusionsData = await tripExclusionsService.getTripExclusions(userData.user.id);
			// Normalize each trip exclusion to handle both coordinate formats
			tripExclusions = (exclusionsData.exclusions || [])
				.map(normalizeTripExclusion)
				.filter(Boolean);

			// Draw exclusion zones on map
			drawExclusionZones();
		} catch (error) {
			console.error('❌ Error loading exclusion zones:', error);
		}
	}

	// Draw exclusion zones on the map
	function drawExclusionZones(): void {
		if (!map || !L) return;

		// Clear existing exclusion zone circles
		clearExclusionZones();

		// Helper to get radius based on layer (city-level vs point-level)
		function getRadiusForLayer(layer: string | undefined): number {
			// Use larger radius for cities/localities
			if (layer === 'locality' || layer === 'region' || layer === 'country') {
				return CITY_EXCLUSION_RADIUS;
			}
			return DEFAULT_EXCLUSION_RADIUS;
		}

		// Helper to format radius for display
		function formatRadius(radius: number): string {
			if (radius >= 1000) {
				return `${radius / 1000}km`;
			}
			return `${radius}m`;
		}

		// Draw home address exclusion zone (blue)
		if (homeAddress?.location?.lat && homeAddress?.location?.lon) {
			const homeRadius = getRadiusForLayer(homeAddress.layer);
			const homeCircle = L.circle([homeAddress.location.lat, homeAddress.location.lon], {
				radius: homeRadius,
				color: '#3b82f6', // Blue
				fillColor: '#3b82f6',
				fillOpacity: 0.1,
				weight: 2,
				dashArray: '5, 10'
			});

			// Add popup with home address info
			const homeName =
				homeAddress.layer === 'locality' ? homeAddress.name || homeAddress.address : 'Home';
			homeCircle.bindPopup(`
				<div class="text-sm font-medium">🏠 ${homeName}</div>
				<div class="text-xs text-gray-600">${homeAddress.display_name || homeAddress.address}</div>
				<div class="text-xs text-muted-foreground">Radius: ${formatRadius(homeRadius)}</div>
			`);

			homeCircle.addTo(map);
			exclusionZoneCircles.push(homeCircle);
		}

		// Draw trip exclusion zones (red)
		tripExclusions.forEach((exclusion) => {
			// After normalization, we can expect location.coordinates format
			const lat = exclusion.location?.coordinates?.lat;
			const lng = exclusion.location?.coordinates?.lng;
			const layer = exclusion.location?.layer;

			if (lat !== undefined && lng !== undefined) {
				const exclusionRadius = getRadiusForLayer(layer);
				const exclusionCircle = L.circle([lat, lng], {
					radius: exclusionRadius,
					color: '#ef4444', // Red
					fillColor: '#ef4444',
					fillOpacity: 0.1,
					weight: 2,
					dashArray: '5, 10'
				});

				// Add popup with exclusion info
				// For cities, show the city name prominently; otherwise show the exclusion name
				const displayName = exclusion.location?.display_name || exclusion.display_name || '';
				const exclusionName =
					layer === 'locality'
						? exclusion.location?.name || exclusion.name || 'City Exclusion'
						: exclusion.name || 'Exclusion';
				exclusionCircle.bindPopup(`
					<div class="text-sm font-medium">🚫 ${exclusionName}</div>
					<div class="text-xs text-gray-600">${displayName}</div>
					<div class="text-xs text-muted-foreground">Radius: ${formatRadius(exclusionRadius)}</div>
				`);

				exclusionCircle.addTo(map);
				exclusionZoneCircles.push(exclusionCircle);
			}
		});
	}

	// Clear exclusion zone circles from map
	function clearExclusionZones(): void {
		if (!map) return;
		for (const circle of exclusionZoneCircles) {
			if (circle.off) {
				circle.off();
			}
			map.removeLayer(circle);
		}
		exclusionZoneCircles = [];
	}

	// Clear existing map markers
	function clearMapMarkers() {
		if (!map || !L) return;
		for (const marker of mapMarkers) {
			// Remove all event listeners before removing from map
			if (marker.off) {
				marker.off();
			}
			map.removeLayer(marker);
		}
		mapMarkers.length = 0;
		mapMarkers = [];
		if (heatLayer) {
			map.removeLayer(heatLayer);
			heatLayer = null;
		}
		// Note: Exclusion zones are kept when clearing markers, as they're independent
	}

	// ── Heat layer ────────────────────────────────────────────────────────────
	// A density heatmap of where the user actually spends time. Built from the
	// same rawDataPoints array as the circle-marker map (zero extra DB traffic):
	// we keep slow/stationary points and weight each by dwell time (time_spent /
	// distance), so a long stay at a café glows brighter than a brief passing.
	// Inherits the page's client-side sampling automatically.
	function buildHeatPoints(dataPoints: any[]): Array<[number, number, number]> {
		const points: Array<[number, number, number]> = [];
		for (const p of dataPoints) {
			const lat = typeof p.lat === 'number' ? p.lat : parseFloat(p.lat);
			const lng = typeof p.lon === 'number' ? p.lon : parseFloat(p.lon);
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

			// Keep points that represent "being somewhere": stationary mode, or
			// low speed. A point moving at 60 km/h isn't a dwell.
			const mode = p.transport_mode || 'unknown';
			const speed = p.velocity ?? p.speed ?? 0;
			if (mode !== 'stationary' && speed > 8) continue;

			// Intensity ∝ time spent here (clamped). Default to a small constant
			// when time_spent is unavailable so isolated slow fixes still show.
			const dwell = Number(p.time_spent ?? 60);
			const intensity = Math.max(0.1, Math.min(1, dwell / 1800)); // 30min → max
			points.push([lat, lng, intensity]);
		}
		return points;
	}

	function updateHeatmap(dataPoints: any[]) {
		if (!map || !L) return;
		// Remove any existing heat layer first.
		if (heatLayer) {
			map.removeLayer(heatLayer);
			heatLayer = null;
		}
		if (!showHeatmap) return;

		const heatPoints = buildHeatPoints(dataPoints);
		if (heatPoints.length === 0) return;

		// leaflet.heat extends L with L.heatLayer. It's loaded via a dynamic
		// import to keep it out of the initial bundle; the side-effect import
		// attaches L.heatLayer to the leaflet namespace. Guarded to client-only:
		// the plugin references `window` at module-eval time, which would reject
		// during SSR and crash the page render.
		if (!browser) return;
		import('leaflet.heat')
			.then(() => {
				if (!map || !L) return;
				const heatFn = (L as any).heatLayer;
				if (!heatFn) return;
				heatLayer = heatFn(heatPoints, {
					radius: 25,
					blur: 18,
					maxZoom: 14,
					minOpacity: 0.35,
					gradient: {
						0.2: '#3b82f6',
						0.4: '#22c55e',
						0.6: '#eab308',
						0.8: '#f97316',
						1.0: '#ef4444'
					}
				}).addTo(map);
			})
			.catch((err) => {
				// Swallow: the heat layer is optional; never let its load failure
				// (e.g. plugin missing in a build) blank the statistics page.
				console.warn('leaflet.heat failed to load; heatmap disabled', err);
			});
	}

	function toggleHeatmap() {
		showHeatmap = !showHeatmap;
		const rawDataPoints = (statisticsService as any).rawDataPoints;
		if (rawDataPoints && rawDataPoints.length > 0) {
			updateHeatmap(rawDataPoints);
		} else if (!showHeatmap && heatLayer && map) {
			map.removeLayer(heatLayer);
			heatLayer = null;
		}
	}

	// Draw data points on map
	function drawDataPointsOnMap(dataPoints: any[]) {
		if (!map || !L || !dataPoints.length) return;

		// Clear existing markers
		clearMapMarkers();

		// Sort points by recorded_at timestamp to ensure proper order
		const sortedPoints = [...dataPoints].sort(
			(a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
		);

		// Draw lines between consecutive points
		for (let i = 0; i < sortedPoints.length - 1; i++) {
			const currentPoint = sortedPoints[i];
			const nextPoint = sortedPoints[i + 1];

			if (currentPoint.lat && currentPoint.lon && nextPoint.lat && nextPoint.lon) {
				const currentLat = parseFloat(currentPoint.lat);
				const currentLon = parseFloat(currentPoint.lon);
				const nextLat = parseFloat(nextPoint.lat);
				const nextLon = parseFloat(nextPoint.lon);

				if (!isNaN(currentLat) && !isNaN(currentLon) && !isNaN(nextLat) && !isNaN(nextLon)) {
					// Use the transport mode of the NEXT point for the line color
					// The detection at nextPoint tells us what mode was used to REACH that point
					const mode = nextPoint.transport_mode || 'unknown';
					const color = getTransportModeColor(mode);

					// Create polyline between consecutive points
					const polyline = L.polyline(
						[
							[currentLat, currentLon],
							[nextLat, nextLon]
						],
						{
							color: color,
							weight: 3,
							opacity: 0.7
						}
					);

					// Add to map
					polyline.addTo(map);
					mapMarkers.push(polyline);
				}
			}
		}

		// Group points by transport mode for markers. Tag each point with its
		// index into sortedPoints so a click can resolve which segment it's in.
		const pointsByMode: Record<string, any[]> = {};
		sortedPoints.forEach((point, idx) => {
			point._sortedIdx = idx;
			const mode = point.transport_mode || 'unknown';
			if (!pointsByMode[mode]) {
				pointsByMode[mode] = [];
			}
			pointsByMode[mode].push(point);
		});

		// Draw markers for each transport mode
		Object.entries(pointsByMode).forEach(([mode, points]) => {
			const color = getTransportModeColor(mode);

			points.forEach((point) => {
				if (point.lat && point.lon) {
					const lat = parseFloat(point.lat);
					const lon = parseFloat(point.lon);

					if (!isNaN(lat) && !isNaN(lon)) {
						// Create circle marker
						const marker = L.circleMarker([lat, lon], {
							radius: 4,
							fillColor: color,
							color: color,
							weight: 1,
							opacity: 0.8,
							fillOpacity: 0.6
						});

						// Add click handler: select the whole segment this point
						// belongs to (for relabelling). Shift-click toggles the
						// segment into/out of the selection so several can be
						// relabelled at once.
						marker.on('click', (e: any) => {
							selectedPoint = point;
							const additive = !!e.originalEvent?.shiftKey;
							selectSegmentForPoint(point._sortedIdx, additive);
						});

						// Add to map
						marker.addTo(map);
						mapMarkers.push(marker);
					}
				}
			});
		});

		// Fit map to show all points
		if (mapMarkers.length > 0) {
			const group = (L as any).featureGroup(mapMarkers);
			map.fitBounds(group.getBounds().pad(0.1));
		}

		// Re-apply segment highlight if one is selected (after a redraw).
		if (selectedSegmentIdxs.size > 0) drawSegmentHighlight();
	}

	// ─── Segment editor ──────────────────────────────────────────────────────

	/**
	 * Recompute gap-bounded segments from the loaded points (sorted ascending by
	 * recorded_at). Uses the same SEGMENT_GAP_MS the HMM detector uses, so the
	 * editable groups match what was decoded as a unit. Call after data loads.
	 */
	function recomputeSegments(rawDataPoints: any[]) {
		const sorted = [...rawDataPoints].sort(
			(a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
		);
		segmentGroups = segmentByGaps(
			sorted.map((p) => ({ timestamp: new Date(p.recorded_at).getTime() }))
		);
		// Keep a parallel ref so click→segment can resolve the actual points.
		(segmentGroups as any)._sorted = sorted;
		selectedSegmentIdxs = new Set();
		clearSegmentHighlight();
	}

	/**
	 * Select the segment a sorted point index falls in.
	 * - Plain click: replace the selection with this segment (clicking the
	 *   already-selected segment clears it).
	 * - Shift-click: toggle this segment in/out of the selection, so several
	 *   segments can be relabelled at once.
	 */
	function selectSegmentForPoint(sortedIdx: number, additive: boolean) {
		const segIdx = segmentGroups.findIndex((seg) => seg.includes(sortedIdx));
		if (segIdx < 0) return;
		const next = new Set(additive ? selectedSegmentIdxs : []);
		if (next.has(segIdx)) next.delete(segIdx);
		else next.add(segIdx);
		selectedSegmentIdxs = next;
		drawSegmentHighlight();
	}

	function clearSegmentHighlight() {
		for (const layer of segmentHighlight) {
			if (map && layer) map.removeLayer(layer);
		}
		segmentHighlight = [];
	}

	/** Close the Point Details popup. Leaves the segment selection intact so
	 *  the relabel toolbar stays available after dismissing the popup. */
	function closePointDetails() {
		selectedPoint = null;
	}

	/** Speed comes from a Postgres numeric column, which PostgREST returns as a
	 *  string. Coerce before formatting so we never call `.toFixed` on a string
	 *  (which throws and blanks the page via the root error boundary). Prefer the
	 *  detector's computed velocity when the raw speed is absent. */
	function formatPointSpeed(point: any): string {
		const raw = point.velocity ?? point.speed;
		const speed = Number(raw);
		if (!isFinite(speed) || speed <= 0) return 'N/A';
		return `${speed.toFixed(1)} km/h`;
	}

	/** Distance (meters from the previous point) is also a Postgres numeric, so
	 *  it arrives as a string. Coerce before dividing, and guard against <= 0 to
	 *  avoid rendering "NaN km" or "0.00 km" for null/empty legs. */
	function formatPointDistance(point: any): string {
		const distance = Number(point.distance);
		if (!isFinite(distance) || distance <= 0) return 'N/A';
		return `${(distance / 1000).toFixed(2)} km`;
	}

	/** Draw a bright outline over every selected segment's markers. */
	function drawSegmentHighlight() {
		clearSegmentHighlight();
		if (!map || !L || selectedSegmentIdxs.size === 0) return;
		const sorted: any[] = (segmentGroups as any)._sorted ?? [];
		for (const segIdx of selectedSegmentIdxs) {
			const seg = segmentGroups[segIdx];
			if (!seg) continue;
			for (const idx of seg) {
				const p = sorted[idx];
				if (!p || !p.lat || !p.lon) continue;
				const lat = parseFloat(p.lat);
				const lon = parseFloat(p.lon);
				if (isNaN(lat) || isNaN(lon)) continue;
				const ring = L.circleMarker([lat, lon], {
					radius: 7,
					fillColor: '#ffffff',
					color: '#000000',
					weight: 2,
					opacity: 0.95,
					fillOpacity: 0.15
				}).addTo(map);
				segmentHighlight.push(ring);
			}
		}
	}

	/** All points across every selected segment (empty if none). */
	const selectedSegmentPoints = $derived.by(() => {
		if (selectedSegmentIdxs.size === 0) return [];
		const sorted: any[] = (segmentGroups as any)._sorted ?? [];
		const out: any[] = [];
		for (const segIdx of selectedSegmentIdxs) {
			const seg = segmentGroups[segIdx];
			if (!seg) continue;
			for (const idx of seg) {
				if (sorted[idx]) out.push(sorted[idx]);
			}
		}
		return out;
	});

	/**
	 * Relabel the selected segment's transport mode in the DB and update the
	 * in-memory points + map. `mode` is one of the canonical modes; passing
	 * null clears the override (resets to auto) by clearing the manual flag.
	 */
	async function applyModeToSegment(mode: string | null) {
		const points = selectedSegmentPoints;
		if (points.length === 0 || isUpdatingMode) return;
		isUpdatingMode = true;
		try {
			const { data: userData } = await fluxbase.auth.getUser();
			const userId = userData?.user?.id;
			if (!userId) throw new Error('Not authenticated');

			const ts = points.map((p) => p.recorded_at);
			const payload =
				mode === null
					? { transport_mode_manual: false }
					: {
							transport_mode: mode,
							detection_reason: 'user_override',
							transport_mode_confidence: 1,
							transport_mode_manual: true
						};

			// Batch the UPDATE in 500s (URL-length safety, mirrors deletePoints).
			const batchSize = 500;
			for (let i = 0; i < ts.length; i += batchSize) {
				const batch = ts.slice(i, i + batchSize);
				const { error } = await fluxbase
					.from('tracker_data')
					.update(payload)
					.eq('user_id', userId)
					.in('recorded_at', batch);
				if (error) throw new Error(error.message);
			}

			// Optimistic in-memory update so the map re-colors immediately.
			const rawDataPoints = (statisticsService as any).rawDataPoints as any[];
			if (mode !== null) {
				const tsSet = new Set(ts);
				for (const p of rawDataPoints) {
					if (tsSet.has(p.recorded_at)) {
						p.transport_mode = mode;
						p.detection_reason = 'user_override';
					}
				}
			}
			drawDataPointsOnMap(rawDataPoints);

			toast.success(
				mode === null
					? t('statistics.resetToAutoDone')
					: t('statistics.modeUpdated', { mode: translateTransportMode(mode) })
			);
		} catch (err: any) {
			console.error('Failed to update transport mode:', err);
			toast.error(t('statistics.modeUpdateFailed'), { description: err?.message });
		} finally {
			isUpdatingMode = false;
		}
	}

	// Format segment duration
	function formatSegmentDuration(hours: number): string {
		if (hours < 1) {
			const minutes = Math.round(hours * 60);
			return `${minutes}m`;
		}
		return `${hours.toFixed(1)}h`;
	}

	// Format distance from meters to a human-readable format
	function formatDistance(meters: number): string {
		const km = meters / 1000;
		if (km < 0.1) {
			return `${Math.round(meters)} m`;
		} else if (km < 10) {
			return `${km.toFixed(2)} km`;
		} else if (km < 100) {
			return `${km.toFixed(1)} km`;
		} else {
			return `${Math.round(km)} km`;
		}
	}

	// Format date with timezone information
	function formatDateWithTimezoneSync(recordedAt: string, tzDiff?: number): string {
		const utcDate = new Date(recordedAt);

		// If we have tz_diff, use it to look up the timezone
		if (tzDiff !== undefined && tzDiff !== null) {
			try {
				const timezone = getTimezoneFromOffset(tzDiff);
				return formatDateInTimezone(utcDate, timezone);
			} catch (error) {
				console.warn('Failed to get timezone, falling back to UTC:', error);
			}
		}

		// Fallback to UTC if no timezone info
		return formatDateInTimezone(utcDate, 'UTC');
	}

	// Initialize on mount
	onMount(async () => {
		initializeService();
		await initializeMap();

		// Check for URL params first (e.g., from trip "Location Data" button)
		const startParam = $page.url.searchParams.get('start');
		const endParam = $page.url.searchParams.get('end');
		const tripId = $page.url.searchParams.get('trip');

		// Fetch trip title for breadcrumb if trip param is present
		if (tripId) {
			try {
				const { data } = await fluxbase.from('trips').select('title').eq('id', tripId).single();
				tripFilterTitle = (data as any)?.title ?? null;
			} catch {
				/* ignore */
			}
		}

		if (startParam && endParam) {
			// Use dates from URL params
			appState.filtersStartDate = new Date(startParam);
			appState.filtersEndDate = new Date(endParam);
		} else if (!appState.filtersStartDate && !appState.filtersEndDate) {
			// Set default date range to past 7 days if no date range is set
			const endDate = new SvelteDate();
			const startDate = new SvelteDate();
			startDate.setDate(endDate.getDate() - 6); // Last 7 days includes today and 6 days before

			appState.filtersStartDate = startDate;
			appState.filtersEndDate = endDate;
		}

		// Don't call handleDateRangeChange() here - the $effect will handle it
		isInitializing = false;

		// Fire-and-forget: load the trailing ~53 weeks for the activity calendar
		// and records/streaks widgets (independent of the date picker). Non-fatal;
		// those widgets just stay empty if it fails. Triggers a re-render via the
		// historyPoints-derived state below once populated.
		(async () => {
			try {
				const { data: s } = await fluxbase.auth.getSession();
				const uid = (s as any)?.session?.user?.id;
				if (uid && statisticsService) {
					await statisticsService.loadCalendarHistory(uid);
					historyPoints = statisticsService.getCalendarPoints();
				}
			} catch {
				/* non-fatal */
			} finally {
				calendarLoading = false;
			}
		})();
	});

	// Manual calendar refresh: submits the refresh-daily-activity job, waits for
	// it to finish, then re-fetches the cached data. Shown when the cache is
	// empty/stale (scheduled job hasn't run yet) or on user demand.
	let calendarRefreshing = $state(false);

	async function refreshCalendar() {
		if (calendarRefreshing) return;
		calendarRefreshing = true;
		try {
			const { data: jobData, error: submitErr } = await fluxbase.jobs.submit(
				'refresh-daily-activity',
				{},
				{ namespace: 'wayli' }
			);
			// Optimistically show the job in the sidebar immediately.
			const jobId = (jobData as any)?.job_id || (jobData as any)?.id;
			if (jobId) {
				try {
					const { addJobToStore } = await import('$lib/stores/job-store');
					addJobToStore({
						id: jobId,
						job_name: 'refresh-daily-activity',
						namespace: 'wayli',
						status: 'pending',
						created_at: new Date().toISOString(),
						created_by: ''
					});
				} catch {
					/* store not initialised — non-fatal */
				}
			}
			if (submitErr) throw submitErr;

			// Wait for the job to complete via the job store's realtime updates.
			// The store subscribes to postgres_changes on jobs.queue and updates
			// on every status change. We watch for the job to reach a terminal
			// state, then re-fetch the calendar data.
			if (jobId) {
				const { jobsStore } = await import('$lib/stores/job-store');
				const finished = await new Promise<boolean>((resolve) => {
					const unsub = jobsStore.subscribe((jobs) => {
						const job = jobs.get(jobId);
						if (job?.status === 'completed') {
							unsub();
							resolve(true);
						} else if (job?.status === 'failed' || job?.status === 'cancelled') {
							unsub();
							resolve(false);
						}
					});
					// Safety timeout: 5 minutes
					setTimeout(
						() => {
							unsub();
							resolve(false);
						},
						5 * 60 * 1000
					);
				});

				if (!finished) {
					toast.error('Activity refresh job failed or timed out');
					return;
				}
			}

			// Clear the client cache and re-fetch from the (now-populated) RPC.
			try {
				const { data: s } = await fluxbase.auth.getSession();
				const uid = (s as any)?.session?.user?.id;
				if (uid && statisticsService) {
					(statisticsService as any).calendarPoints = [];
					sessionStorage.removeItem(`wayli:calendar:${uid}:53`);
					await statisticsService.loadCalendarHistory(uid);
					historyPoints = statisticsService.getCalendarPoints();
				}
			} catch {
				/* ignore re-fetch errors */
			}
		} catch (err) {
			console.error('❌ Calendar refresh failed:', err);
			toast.error('Failed to refresh activity data');
		} finally {
			calendarRefreshing = false;
		}
	}

	// Track last processed dates to prevent duplicate processing
	let lastProcessedStart: Date | string | null = null;
	let lastProcessedEnd: Date | string | null = null;

	// Reactive statement for date range changes
	$effect(() => {
		// Only watch the date changes, not other reactive state
		const startDate = appState.filtersStartDate;
		const endDate = appState.filtersEndDate;

		// Convert to comparable strings
		const startStr = startDate instanceof Date ? startDate.toISOString() : String(startDate);
		const endStr = endDate instanceof Date ? endDate.toISOString() : String(endDate);
		const lastStartStr =
			lastProcessedStart instanceof Date
				? lastProcessedStart.toISOString()
				: String(lastProcessedStart);
		const lastEndStr =
			lastProcessedEnd instanceof Date ? lastProcessedEnd.toISOString() : String(lastProcessedEnd);

		// Only trigger if dates actually changed and we're not initializing
		if (!isInitializing && (startDate || endDate)) {
			if (startStr !== lastStartStr || endStr !== lastEndStr) {
				lastProcessedStart = startDate;
				lastProcessedEnd = endDate;
				handleDateRangeChange();
			}
		}
	});

	// Initialize map
	async function initializeMap() {
		if (!browser || !mapContainer) return;

		try {
			L = (await import('leaflet')).default;
			if (map) return;

			// Small delay to ensure container is ready
			mapInitTimeout = setTimeout(() => {}, 100);
			await new Promise((resolve) => setTimeout(resolve, 100));

			map = L.map(mapContainer, {
				center: [20, 0],
				zoom: 2,
				zoomControl: true,
				attributionControl: false
			});

			mapInvalidateTimeout = setTimeout(() => {
				if (map) {
					map.invalidateSize();
				}
			}, 200);

			// Theme-aware tile layer via shared utility — consistent with all other maps
			cleanupThemeWatcher = watchMapTheme(map, (theme) =>
				L.tileLayer(TILE_URLS[theme].url, {
					attribution: TILE_URLS[theme].attribution
				})
			);

			// Load exclusion zones after map is ready
			await loadExclusionZones();
		} catch (error) {
			console.error('❌ Error initializing map:', error);
		}
	}
</script>

<svelte:head>
	<title>{t('common.navigation.statistics')} · Wayli</title>
	<link
		rel="stylesheet"
		href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
		integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
		crossorigin=""
	/>
	<style>
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
			margin-top: 8px;
			overflow-x: auto;
		}
		@media (max-width: 767px) {
			.datepicker-statistics-fix .datepicker-dropdown {
				left: 0 !important;
				right: auto !important;
				min-width: 0;
				width: 98vw;
				max-width: 98vw;
			}
		}
		.datepicker-statistics-fix .calendars-container {
			right: 0 !important;
			left: auto !important;
			max-width: 95vw !important;
			overflow-x: auto !important;
			position: absolute !important;
			z-index: 3000 !important;
		}
		@media (max-width: 767px) {
			.datepicker-statistics-fix .calendars-container {
				left: 0 !important;
				right: auto !important;
				width: 98vw !important;
				max-width: 98vw !important;
			}
		}
	</style>
</svelte:head>

<!-- Large Dataset Warning Modal -->
{#if showLargeDatasetWarning}
	<div class="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50">
		<div class="bg-card mx-4 max-w-md rounded-lg p-6 shadow-xl">
			<div class="mb-4 flex items-center">
				<AlertTriangle class="mr-3 h-6 w-6 text-yellow-500" />
				<h3 class="text-foreground text-lg font-semibold">Large Dataset Warning</h3>
			</div>
			<div class="text-muted-foreground mb-6 text-sm">
				<p class="mb-2">
					You have <strong>{totalPointsCount.toLocaleString()}</strong> data points in the selected date
					range.
				</p>
				<p class="mb-2">
					Processing this much data may take several minutes and could slow down your browser.
				</p>
				<p>
					Consider selecting a smaller date range for better performance, or proceed if you want to
					process all data.
				</p>
			</div>
			<div class="flex justify-end space-x-3">
				<button
					onclick={() => handleLargeDatasetConfirmation(false)}
					class="hover:bg-muted dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
				>
					Cancel
				</button>
				<button
					onclick={() => handleLargeDatasetConfirmation(true)}
					class="bg-primary hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium text-white"
				>
					Proceed Anyway
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Header -->
<div class="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
	<div class="flex items-center gap-3">
		<BarChart class="text-primary h-6 w-6 flex-shrink-0" />
		<div>
			<h1 class="text-foreground text-xl font-bold">
				{t('common.navigation.statistics')}
			</h1>
			<p class="text-muted-foreground text-sm">Your travel data at a glance</p>
		</div>
	</div>
	<div class="flex min-w-0 flex-1 items-center justify-start gap-2 md:justify-end">
		<div class="datepicker-statistics-fix relative">
			<DateRangePicker
				bind:startDate={localStartDate}
				bind:endDate={localEndDate}
				pickLabel={t('datePicker.pickDateRange')}
				showClear={false}
			/>
		</div>
	</div>
</div>

<div class="space-y-6">
	<!-- Trip breadcrumb (when navigated from a trip) -->
	{#if tripFilterTitle}
		<nav class="text-muted-foreground flex items-center gap-1 text-sm" aria-label="Breadcrumb">
			<a href="/dashboard/travel" class="hover:text-foreground">{t('common.navigation.travel')}</a>
			<ChevronRight class="h-3.5 w-3.5 opacity-50" />
			<a
				href="/dashboard/travel?trip={$page.url.searchParams.get('trip')}"
				class="hover:text-foreground">{tripFilterTitle}</a
			>
			<ChevronRight class="h-3.5 w-3.5 opacity-50" />
			<span class="text-foreground font-medium">{t('common.navigation.statistics')}</span>
		</nav>
	{/if}
	<!-- Map -->
	<div class="bg-muted relative isolate z-0 h-96 w-full rounded-lg md:h-[600px]">
		<div
			bind:this={mapContainer}
			class="h-full w-full rounded-lg"
			style="pointer-events: auto; touch-action: manipulation;"
		></div>

		<!-- Heatmap toggle -->
		<button
			type="button"
			onclick={toggleHeatmap}
			class="absolute top-4 right-4 z-[1001] inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors {showHeatmap
				? 'border-primary bg-primary text-primary-foreground'
				: 'border-border bg-card text-foreground hover:bg-muted'}"
			title={t('statistics.heatmapToggle') || 'Show where you spend time'}
		>
			<Flame class="h-4 w-4" />
			{t('statistics.heatmap') || 'Heatmap'}
		</button>

		<!-- Map Legend -->
		<div
			class="bg-card absolute bottom-4 left-4 z-[1001] max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto rounded-lg p-3 shadow-lg"
		>
			<h4 class="text-muted-foreground mb-2 text-sm font-semibold">
				{t('statistics.modeColors')}
			</h4>
			<div class="space-y-1">
				{#each Object.entries(transportModeColors) as [mode, color] (mode)}
					<div class="flex items-center space-x-2">
						<div class="h-3 w-3 rounded-full" style="background-color: {color}"></div>
						<span class="text-muted-foreground text-xs">{translateTransportMode(mode)}</span>
					</div>
				{/each}
				<!-- Exclusion Zones Legend -->
				<div class="border-border mt-2 border-t pt-2">
					<div class="text-muted-foreground mb-1 text-xs font-semibold">
						{t('statistics.exclusionZones') || 'Exclusion Zones'}
					</div>
					<div class="flex items-center space-x-2">
						<div
							class="h-3 w-3 rounded-full border-2 border-dashed border-blue-500 bg-blue-500/10"
						></div>
						<span class="text-muted-foreground text-xs">🏠 Home</span>
					</div>
					<div class="flex items-center space-x-2">
						<div
							class="h-3 w-3 rounded-full border-2 border-dashed border-red-500 bg-red-500/10"
						></div>
						<span class="text-muted-foreground text-xs">🚫 Exclusions</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Segment editor: appears when a segment is selected by clicking a point. -->
		{#if selectedSegmentIdxs.size > 0}
			<div
				class="border-border bg-card absolute top-4 left-1/2 z-[1002] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg border p-3 shadow-lg"
			>
				<div class="mb-2 flex items-center justify-between">
					<h4 class="text-foreground text-sm font-semibold">
						{selectedSegmentIdxs.size}
						{selectedSegmentIdxs.size === 1
							? t('statistics.segmentSingular')
							: t('statistics.segmentPlural')}
						· {selectedSegmentPoints.length}
						{t('statistics.pointsLabel')}
					</h4>
					<button
						type="button"
						onclick={() => {
							selectedSegmentIdxs = new Set();
							clearSegmentHighlight();
						}}
						class="text-muted-foreground hover:text-foreground"
						title={t('common.actions.close') || 'Close'}
					>
						<X class="h-4 w-4" />
					</button>
				</div>
				<p class="text-muted-foreground mb-2 text-xs">
					{t('statistics.editModeHelp')}
				</p>
				<div class="flex flex-wrap gap-1.5">
					{#each ['walking', 'cycling', 'car', 'train', 'airplane', 'stationary'] as mode (mode)}
						<button
							type="button"
							disabled={isUpdatingMode}
							onclick={() => applyModeToSegment(mode)}
							class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-white shadow-sm disabled:opacity-50"
							style="background-color: {getTransportModeColor(mode)}"
						>
							{translateTransportMode(mode)}
						</button>
					{/each}
					<button
						type="button"
						disabled={isUpdatingMode}
						onclick={() => applyModeToSegment(null)}
						class="border-border text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium shadow-sm disabled:opacity-50"
						title={t('statistics.resetToAuto') || 'Reset to auto'}
					>
						{t('statistics.resetToAuto') || 'Auto'}
					</button>
				</div>
			</div>
		{/if}

		<!-- Point Details Popup -->
		{#if selectedPoint}
			<div
				class="bg-card absolute top-4 right-4 left-4 z-[1001] max-w-sm rounded-lg p-4 shadow-lg sm:left-auto sm:w-80"
			>
				<div class="mb-3 flex items-start justify-between">
					<h4 class="text-muted-foreground text-sm font-semibold">
						{t('statistics.pointDetails')}
					</h4>
					<button
						onclick={closePointDetails}
						class="text-muted-foreground hover:text-muted-foreground"
					>
						<X class="h-4 w-4" />
					</button>
				</div>

				<div class="space-y-2 text-xs">
					<div class="grid grid-cols-2 gap-2">
						<div>
							<span class="text-muted-foreground font-medium">{t('statistics.date')}:</span>
							<div class="dark:text-muted-foreground text-gray-800">
								{formatDateWithTimezoneSync(selectedPoint.recorded_at, selectedPoint.tz_diff)}
							</div>
						</div>
						<div>
							<span class="text-muted-foreground font-medium">{t('statistics.mode')}:</span>
							<div class="dark:text-muted-foreground text-gray-800">
								{translateTransportMode(selectedPoint.transport_mode || 'unknown')}
							</div>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-2">
						<div>
							<span class="text-muted-foreground font-medium">{t('statistics.coordinates')}:</span>
							<div class="dark:text-muted-foreground text-gray-800">
								{selectedPoint.lat}, {selectedPoint.lon}
							</div>
						</div>
						<div>
							<span class="text-muted-foreground font-medium">{t('statistics.popupSpeed')}:</span>
							<div class="dark:text-muted-foreground text-gray-800">
								{formatPointSpeed(selectedPoint)}
							</div>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-2">
						<div>
							<span class="text-muted-foreground font-medium">{t('statistics.popupDistance')}:</span
							>
							<div class="dark:text-muted-foreground text-gray-800">
								{formatPointDistance(selectedPoint)}
							</div>
						</div>
						<div>
							<span class="text-muted-foreground font-medium">{t('statistics.country')}:</span>
							<div class="dark:text-muted-foreground text-gray-800">
								{selectedPoint.country_code || 'N/A'}
							</div>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-2">
						<div>
							<span class="text-muted-foreground font-medium">{t('statistics.popupReason')}</span>
							<div class="dark:text-muted-foreground text-gray-800">
								{selectedPoint.detection_reason
									? getTransportDetectionReasonLabel(
											selectedPoint.detection_reason as TransportDetectionReason
										)
									: 'N/A'}
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- No Data Message -->
		{#if !isLoading && !isInitialLoad && (!statisticsData || Object.keys(statisticsData).length === 0)}
			<div
				class="dark:bg-background/80 absolute inset-0 flex items-center justify-center bg-white/80"
			>
				<div class="text-center">
					<MapPin class="text-muted-foreground mx-auto mb-4 h-12 w-12" />
					<h3 class="text-muted-foreground mb-4 text-lg font-semibold">
						{t('statistics.noDataMessage')}
					</h3>
					<a
						href="/dashboard/import-export"
						class="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
					>
						<Import class="h-4 w-4" />
						Import Data
					</a>
				</div>
			</div>
		{/if}
	</div>
	<!-- Loading State -->
	{#if statisticsLoading}
		<div class="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
			{#each Array(8) as _, index (`loading-${index}`)}
				<div class="bg-card border-border rounded-lg border p-4">
					<div class="mb-3 flex items-center gap-2">
						<div class="dark:bg-muted h-5 w-5 animate-pulse rounded bg-gray-200"></div>
						<div class="dark:bg-muted h-5 w-32 animate-pulse rounded bg-gray-200"></div>
					</div>
					<div class="space-y-3">
						{#each Array(3) as _innerItem, index2 (`loading-inner-${index}-${index2}`)}
							<div class="flex items-center gap-4">
								<div class="dark:bg-muted h-4 w-20 animate-pulse rounded bg-gray-200"></div>
								<div class="dark:bg-muted h-4 w-16 animate-pulse rounded bg-gray-200"></div>
								<div class="dark:bg-muted h-4 w-12 animate-pulse rounded bg-gray-200"></div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{:else if !statisticsData || Object.keys(statisticsData).length === 0}
		<div class="text-muted-foreground mb-8 py-8 text-center font-semibold">
			No statistics available for this period.
		</div>
	{:else}
		<!-- Actual Statistics Content -->
		<div class="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
			{#each getStatistics() as stat, index (`stat-${index}-${stat.id || 'unknown'}`)}
				{@const IconComponent = stat.icon}
				<div class="bg-card border-border rounded-lg border p-4">
					<div class="flex items-center gap-2">
						<IconComponent
							class="h-5 w-5 {stat.color === 'green' ? 'text-green-500' : 'text-blue-500'}"
						/>
						<span class="text-muted-foreground text-sm font-medium">{stat.title}</span>
					</div>
					<div class="text-foreground mt-1 text-2xl font-bold">
						{stat.value}
					</div>
					{#if stat.delta != null}
						<div
							class="mt-0.5 text-xs font-medium {stat.delta >= 0
								? 'text-green-600 dark:text-green-400'
								: 'text-red-600 dark:text-red-400'}"
						>
							{stat.delta >= 0 ? '▲' : '▼'}
							{Math.abs(stat.delta).toFixed(0)}% vs first half
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Country Time Distribution (the redundant Modes of Transport table was
	     removed; the Mode-share donut in StatisticsCharts now covers that, with
	     per-mode time + points in its legend). -->
	{#if statisticsData && !statisticsLoading && !statisticsError}
		<div class="mb-8 flex flex-col gap-6">
			{#if statisticsData.countryTimeDistribution && statisticsData.countryTimeDistribution.length > 0}
				<div class="w-full">
					<div class="bg-card border-border w-full rounded-lg border p-4">
						<div class="mb-3 flex items-center gap-2">
							<Globe2 class="text-primary dark:text-primary h-5 w-5" />
							<span class="dark:text-foreground text-lg font-semibold text-gray-800">
								{t('statistics.countryTimeDistribution')}
							</span>
						</div>
						<div class="space-y-4">
							{#each statisticsData.countryTimeDistribution as country, index (`country-${index}-${country.country_code || 'unknown'}`)}
								<div>
									<div class="mb-1 flex items-center gap-2">
										<span class="text-xl">{getFlagEmoji(country.country_code)}</span>
										<span class="text-muted-foreground text-base">
											{$getCountryNameReactive(country.country_code)}
										</span>
									</div>
									<div class="relative w-full">
										<div class="dark:bg-muted h-4 rounded bg-gray-200">
											<div
												class="bg-primary flex h-4 items-center justify-center rounded text-xs font-bold text-white transition-all duration-300"
												style="width: {country.percent}%; min-width: 2.5rem;"
											>
												<span>{country.percent}%</span>
											</div>
										</div>
									</div>
								</div>
							{/each}
						</div>
						<div class="text-muted-foreground mt-4 text-xs">
							{t('statistics.ofSelectedPeriod')}
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Train Station Visits Table -->
	{#if statisticsData && !statisticsLoading && !statisticsError && statisticsData.trainStationVisits && statisticsData.trainStationVisits.length > 0}
		<div class="bg-card border-border mb-8 w-full rounded-lg border p-4 md:w-1/2">
			<div class="mb-3 flex items-center gap-2">
				<Train class="text-primary dark:text-primary h-5 w-5" />
				<span class="dark:text-foreground text-lg font-semibold text-gray-800">
					{t('statistics.trainStationVisits')}
				</span>
			</div>
			<div class="-mx-4 overflow-x-auto px-4">
				<table class="divide-border min-w-full divide-y">
					<thead>
						<tr>
							<th
								class="text-muted-foreground px-4 py-2 text-left text-xs font-medium tracking-wider uppercase"
							>
								Station
							</th>
							<th
								class="text-muted-foreground px-4 py-2 text-left text-xs font-medium tracking-wider uppercase"
							>
								Visits
							</th>
						</tr>
					</thead>
					<tbody>
						{#each statisticsData.trainStationVisits
							.slice()
							.sort((a: { count: number }, b: { count: number }) => b.count - a.count) as station, index (`station-${index}-${station.name || 'unknown'}`)}
							<tr>
								<td class="text-foreground px-4 py-2 text-sm whitespace-nowrap">
									{station.name}
								</td>
								<td
									class="text-primary dark:text-muted-foreground px-4 py-2 text-sm font-bold whitespace-nowrap"
								>
									{station.count}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- Extra visualizations: activity calendar, time-of-day, speed, mode donut, records -->
	{#if statisticsData && !statisticsLoading && !statisticsError}
		{@const rawDataPoints = (statisticsService as any)?.rawDataPoints ?? []}
		{#if rawDataPoints.length > 0}
			<StatisticsCharts
				points={rawDataPoints}
				{historyPoints}
				{calendarLoading}
				{calendarRefreshing}
				onRefreshCalendar={refreshCalendar}
				{transportModeColors}
			/>
		{/if}
	{/if}

	<!-- Error Display -->
	{#if statisticsError}
		<div
			class="mb-8 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
		>
			<div class="flex items-center">
				<X class="mr-3 h-5 w-5 text-red-500" />
				<div>
					<h3 class="text-sm font-medium text-red-800 dark:text-red-200">
						Error loading statistics
					</h3>
					<p class="mt-1 text-sm text-red-700 dark:text-red-300">
						{statisticsError}
					</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Loading Overlay -->
	{#if isLoading}
		<div
			class="dark:bg-background/70 fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-white/70"
		>
			<Loader2 class="text-primary dark:text-muted-foreground h-16 w-16 animate-spin" />
			<div class="mt-4 text-center">
				<div class="text-muted-foreground mb-2 text-lg font-medium">
					{loadingStage || t('statistics.loading')}
				</div>
				{#if loadingProgress > 0}
					<div class="dark:bg-muted mb-2 h-2 w-64 max-w-[80vw] rounded-full bg-gray-200">
						<div
							class="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
							style="width: {Math.round(loadingProgress)}%"
						></div>
					</div>
					<div class="text-muted-foreground text-sm">
						{t('statistics.percentComplete', { percent: Math.round(loadingProgress) })}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
