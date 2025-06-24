<script lang="ts">
	import {
		Edit,
		MapPin,
		Car,
		Bike,
		Bus,
		Train,
		Plane,
		HelpCircle,
		Trash2,
		ChevronDown,
		ChevronUp,
		Calendar,
		Map,
		Clock,
		Star,
		StarOff
	} from 'lucide-svelte';
	import { onMount } from 'svelte';
	import type { Map as LeafletMap, LatLngBounds } from 'leaflet';
	import { fade } from 'svelte/transition';
	import * as Popover from '$lib/components/ui/popover/index.svelte';
	import { format } from 'date-fns';
	import { state } from '$lib/stores/app-state.svelte';

	let map: LeafletMap;
	let L: typeof import('leaflet');
	let mapContainer: HTMLDivElement;
	let currentTileLayer: any;
	let selectedDateRange = '';
	let markers: any[] = [];
	let startDate: Date | null = null;
	let endDate: Date | null = null;
	let isDatePickerOpen = false;
	let expandedGroups: Record<string, boolean> = {};

	$: selectedDateRange =
		startDate && endDate
			? `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`
			: '';

	type TransportMode = 'walking' | 'car' | 'bike' | 'train' | 'plane' | 'bus' | 'unknown';

	interface Point {
		id: string;
		time: string;
		lat: number;
		lng: number;
		title?: string;
		type?: string;
		transportMode: TransportMode;
		hidden?: boolean;
		groupId?: string;
		city: string;
		lastVisited: string;
		totalVisits: number;
		favorite: boolean;
		muted: boolean;
	}

	interface PointGroup {
		id: string;
		points: Point[];
		startTime: string;
		endTime: string;
		count: number;
	}

	const mockPoints: Point[] = [
		{
			id: '1',
			time: '17:20',
			lat: 40.705,
			lng: -74.0022,
			title: 'Downtown Market',
			type: 'Shop',
			transportMode: 'car',
			city: 'New York',
			lastVisited: '2023-04-15',
			totalVisits: 10,
			favorite: false,
			muted: false
		},
		{
			id: '2',
			time: '11:45',
			lat: 40.7111,
			lng: -74.0071,
			title: 'Blue Hotel',
			type: 'Hotel',
			transportMode: 'train',
			city: 'New York',
			lastVisited: '2023-04-15',
			totalVisits: 10,
			favorite: false,
			muted: false
		},
		{
			id: '3',
			time: '09:00',
			lat: 40.7127,
			lng: -74.005,
			title: 'Cafe Sunrise',
			type: 'Restaurant',
			transportMode: 'walking',
			city: 'New York',
			lastVisited: '2023-04-15',
			totalVisits: 10,
			favorite: false,
			muted: false
		}
	];

	const rawPoints: Point[] = [
		{
			id: 'r1',
			time: '18:35',
			lat: 40.713,
			lng: -74.006,
			transportMode: 'unknown',
			groupId: 'raw1',
			city: 'New York',
			lastVisited: '2023-04-15',
			totalVisits: 10,
			favorite: false,
			muted: false
		},
		{
			id: 'r2',
			time: '18:35',
			lat: 40.7131,
			lng: -74.0061,
			transportMode: 'unknown',
			groupId: 'raw1',
			city: 'New York',
			lastVisited: '2023-04-15',
			totalVisits: 10,
			favorite: false,
			muted: false
		},
		{
			id: 'r3',
			time: '18:35',
			lat: 40.7132,
			lng: -74.0062,
			transportMode: 'unknown',
			groupId: 'raw1',
			city: 'New York',
			lastVisited: '2023-04-15',
			totalVisits: 10,
			favorite: false,
			muted: false
		}
	];

	const pointGroups: PointGroup[] = [
		{
			id: 'raw1',
			points: rawPoints,
			startTime: '18:35',
			endTime: '18:35',
			count: 3
		}
	];

	let points: Point[] = mockPoints;

	function setTransportMode(point: Point, mode: TransportMode) {
		point.transportMode = mode;
		points = [...points];
	}

	function handlePointHover(point: Point) {
		if (!map) return;
		const bounds = new L.LatLngBounds(
			[point.lat - 0.002, point.lng - 0.002],
			[point.lat + 0.002, point.lng + 0.002]
		);
		map.flyToBounds(bounds, { duration: 0.5 });
	}

	function handlePointLeave() {
		if (!map) return;
		const bounds = L.latLngBounds(points.concat(rawPoints).map((p) => [p.lat, p.lng]));
		map.flyToBounds(bounds, { duration: 0.5, padding: [50, 50] });
	}

	function toggleDatePicker() {
		isDatePickerOpen = !isDatePickerOpen;
	}

	function handleDateChange() {
		// Update the map markers based on the selected date range
		if (startDate && endDate) {
			// Filter points based on date range
			const filteredPoints = points.filter(point => {
				const pointDate = new Date(point.time);
				return pointDate >= startDate! && pointDate <= endDate!;
			});
			updateMarkers(filteredPoints);
		} else {
			updateMarkers(points);
		}
	}

	function updateMarkers(pointsToShow: Point[] = points) {
		if (!map) return;

		// Remove existing markers and layers
		markers.forEach(marker => marker.remove());
		map.eachLayer((layer) => {
			if (layer instanceof L.CircleMarker) {
				layer.remove();
			}
		});

		// Add markers for regular points
		markers = pointsToShow.map(point =>
			L.marker([point.lat, point.lng])
				.bindPopup(point.title || '')
				.addTo(map)
		);

		// Add circle markers for raw points
		rawPoints.forEach(point => {
			L.circleMarker([point.lat, point.lng], {
				radius: 6,
				color: '#2563eb',
				weight: 2,
				opacity: 1,
				fillColor: '#2563eb',
				fillOpacity: 0.6
			}).addTo(map);
		});

		const bounds = L.latLngBounds(pointsToShow.concat(rawPoints).map(p => [p.lat, p.lng]));
		map.fitBounds(bounds, { padding: [50, 50] });
	}

	function toggleGroup(groupId: string) {
		expandedGroups[groupId] = !expandedGroups[groupId];
		expandedGroups = expandedGroups;
	}

	function confirmDelete(point: Point) {
		if (point.groupId) {
			const group = pointGroups.find((g) => g.id === point.groupId);
			if (group) {
				group.points = group.points.filter((p) => p.id !== point.id);
				group.count = group.points.length;
			}
		} else {
			points = points.filter((p) => p.id !== point.id);
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

		L.tileLayer(getTileLayerUrl(), {
			attribution: getAttribution()
		}).addTo(map);

		// Add markers for regular points
		markers = points.map((point) =>
			L.marker([point.lat, point.lng])
				.bindPopup(point.title || '')
				.addTo(map)
		);

		// Add circle markers for raw points
		rawPoints.forEach(point => {
			L.circleMarker([point.lat, point.lng], {
				radius: 6,
				color: '#2563eb',
				weight: 2,
				opacity: 1,
				fillColor: '#2563eb',
				fillOpacity: 0.6
			}).addTo(map);
		});

		// Fit map to show all points
		const bounds = L.latLngBounds(points.concat(rawPoints).map((p) => [p.lat, p.lng]));
		map.fitBounds(bounds, { padding: [50, 50] });

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

	const transportModes: { mode: TransportMode; icon: any; label: string }[] = [
		{ mode: 'walking', icon: MapPin, label: 'Walking' },
		{ mode: 'car', icon: Car, label: 'Car' },
		{ mode: 'bike', icon: Bike, label: 'Bike' },
		{ mode: 'train', icon: Train, label: 'Train' },
		{ mode: 'plane', icon: Plane, label: 'Plane' },
		{ mode: 'bus', icon: Bus, label: 'Bus' },
		{ mode: 'unknown', icon: HelpCircle, label: 'Unknown' }
	];

	$: if (startDate || endDate) {
		handleDateChange();
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

<svelte:window />

<div>
	<!-- Header -->
	<div class="mb-8 flex items-center gap-3">
		<Edit class="h-7 w-7 text-[rgb(37,140,244)]" />
		<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">GPS Point Editor</h1>
	</div>

	<!-- Date Range Picker -->
	<div class="mb-6">
		<button
			class="flex w-full items-center justify-between rounded-md border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#23232a] cursor-pointer select-none"
			on:click={() => isDatePickerOpen = !isDatePickerOpen}
			type="button"
			tabindex="0"
			aria-haspopup="dialog"
			aria-expanded={isDatePickerOpen}
		>
			<div class="flex items-center gap-2">
				<Calendar class="h-4 w-4 text-gray-400" />
				<span>{selectedDateRange || 'Pick a date range'}</span>
			</div>
			{#if isDatePickerOpen}
				<ChevronUp class="h-4 w-4 text-gray-400" />
			{:else}
				<ChevronDown class="h-4 w-4 text-gray-400" />
			{/if}
		</button>

		{#if isDatePickerOpen}
			<div class="mt-3 mb-6 rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-4">
				<div class="grid gap-4 md:grid-cols-2">
					<div>
						<label for="startDate" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">Start Date</label>
						<input
							type="date"
							id="startDate"
							bind:value={startDate}
							class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
						/>
					</div>
					<div>
						<label for="endDate" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">End Date</label>
						<input
							type="date"
							id="endDate"
							bind:value={endDate}
							class="w-full rounded-md border border-[rgb(218,218,221)] bg-white dark:bg-[#23232a] text-gray-900 dark:text-gray-100 py-2 px-3 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
						/>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Left column: Timeline -->
		<div>
			<!-- Raw GPS Points Groups -->
			{#each pointGroups as group}
				<div class="mb-6">
					<button
						class="flex w-full items-center justify-between rounded-md border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#23232a] cursor-pointer"
						on:click={() => toggleGroup(group.id)}
					>
						<div class="flex items-center gap-2">
							<span class="font-medium">{group.count} Raw GPS Points</span>
							<span class="text-gray-500">From {group.startTime} to {group.endTime}</span>
						</div>
						{#if expandedGroups[group.id]}
							<ChevronUp class="h-4 w-4 text-gray-400" />
						{:else}
							<ChevronDown class="h-4 w-4 text-gray-400" />
						{/if}
					</button>

					{#if expandedGroups[group.id]}
						<div class="mt-2 space-y-2">
							{#each group.points as point}
								<div
									class="group relative overflow-hidden rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-pointer"
									on:mouseenter={() => handlePointHover(point)}
									on:mouseleave={handlePointLeave}
									role="button"
									tabindex="0"
									aria-label="Point {point.title || point.time}"
								>
									<div class="flex items-center gap-2 mb-1">
										<span class="text-lg font-bold text-gray-900 dark:text-gray-100">{point.title || point.time}</span>
										{#if point.favorite}
											<Star class="h-4 w-4 text-yellow-400" />
										{/if}
										{#if point.muted}
											<StarOff class="h-4 w-4 text-gray-400" />
										{/if}
										<span class="ml-auto text-xs uppercase text-gray-400 dark:text-gray-500">{point.type}</span>
									</div>
									<div class="flex justify-between text-sm text-gray-700 dark:text-gray-300">
										<div>
											<div class="text-xs text-gray-400 dark:text-gray-500">City</div>
											<div>{point.city}</div>
										</div>
										<div>
											<div class="text-xs text-gray-400 dark:text-gray-500">Last visited</div>
											<div>{point.lastVisited}</div>
										</div>
										<div>
											<div class="text-xs text-gray-400 dark:text-gray-500">Total visits</div>
											<div>{point.totalVisits}</div>
										</div>
									</div>
									<div class="flex gap-1">
										{#each transportModes as mode}
											<button
												class="rounded-full p-1 cursor-pointer {point.transportMode === mode.mode
													? 'bg-gray-100 text-gray-900'
													: 'text-gray-400 hover:text-gray-600'}"
												on:click={() => setTransportMode(point, mode.mode)}
												title={mode.label}
											>
												<svelte:component this={mode.icon} class="h-4 w-4" />
											</button>
										{/each}
									</div>
									<button
										class="text-red-500 hover:text-red-600"
										on:click={() => confirmDelete(point)}
									>
										<Trash2 class="h-4 w-4" />
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}

			<!-- Regular Points Timeline -->
			<div class="space-y-4">
				{#each points as point}
					<div
						class="group relative overflow-hidden rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-pointer"
						on:mouseenter={() => handlePointHover(point)}
						on:mouseleave={handlePointLeave}
						role="button"
						tabindex="0"
						aria-label="Point {point.title || point.time}"
					>
						<div class="flex items-center gap-2 mb-1">
							<span class="text-lg font-bold text-gray-900 dark:text-gray-100">{point.title || point.time}</span>
							{#if point.favorite}
								<Star class="h-4 w-4 text-yellow-400" />
							{/if}
							{#if point.muted}
								<StarOff class="h-4 w-4 text-gray-400" />
							{/if}
							<span class="ml-auto text-xs uppercase text-gray-400 dark:text-gray-500">{point.type}</span>
						</div>
						<div class="flex justify-between text-sm text-gray-700 dark:text-gray-300">
							<div>
								<div class="text-xs text-gray-400 dark:text-gray-500">City</div>
								<div>{point.city}</div>
							</div>
							<div>
								<div class="text-xs text-gray-400 dark:text-gray-500">Last visited</div>
								<div>{point.lastVisited}</div>
							</div>
							<div>
								<div class="text-xs text-gray-400 dark:text-gray-500">Total visits</div>
								<div>{point.totalVisits}</div>
							</div>
						</div>
						<div class="flex gap-1">
							{#each transportModes as mode}
								<button
									class="rounded-full p-1 cursor-pointer {point.transportMode === mode.mode
										? 'bg-gray-100 text-gray-900'
										: 'text-gray-400 hover:text-gray-600'}"
									on:click={() => setTransportMode(point, mode.mode)}
									title={mode.label}
								>
									<svelte:component this={mode.icon} class="h-4 w-4" />
								</button>
							{/each}
						</div>
						<button
							class="text-red-500 hover:text-red-600"
							on:click={() => confirmDelete(point)}
						>
							<Trash2 class="h-4 w-4" />
						</button>
					</div>
				{/each}
			</div>
		</div>

		<!-- Right column: Map -->
		<div class="hidden lg:block">
			<div class="overflow-hidden rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a]">
				<div
					bind:this={mapContainer}
					class="relative h-[calc(100vh-12rem)] w-full"
					style="z-index: 10;"
				></div>
			</div>
		</div>
	</div>
</div>
