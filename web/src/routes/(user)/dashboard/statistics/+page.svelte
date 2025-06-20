<script lang="ts">
	import { toast } from 'svelte-sonner';
	import {
		BarChart,
		PieChart,
		TrendingUp,
		Map,
		Calendar,
		Clock,
		Navigation,
		MapPin,
		Globe2,
		Car,
		Train,
		Plane,
		Bike,
		Footprints,
		Pin,
		Route,
		Flag,
		BarChart3,
		ChevronDown,
		ChevronUp
	} from 'lucide-svelte';
	import Card from '$lib/components/ui/card/index.svelte';
	import Badge from '$lib/components/ui/badge/index.svelte';
	import { onMount } from 'svelte';
	import type { Map as LeafletMap } from 'leaflet';
	import { format } from 'date-fns';
	import { state, setPeriod, setStartDate, setEndDate, toggleDatePicker, closeDatePicker } from '$lib/stores/app-state.svelte';

	// Earth's circumference in km
	const EARTH_CIRCUMFERENCE = 40075;

	// Mock data for visited locations
	const visitedLocations: Array<{ name: string; lat: number; lng: number }> = [
		{ name: 'Paris', lat: 48.8566, lng: 2.3522 },
		{ name: 'Rome', lat: 41.9028, lng: 12.4964 },
		{ name: 'Barcelona', lat: 41.3851, lng: 2.1734 },
		{ name: 'Berlin', lat: 52.52, lng: 13.405 },
		{ name: 'Amsterdam', lat: 52.3676, lng: 4.9041 }
	];

	let map: LeafletMap;
	let L: typeof import('leaflet');
	let mapContainer: HTMLDivElement;
	let currentTileLayer: any;

	function selectedDateRange() {
		return state.filtersStartDate && state.filtersEndDate
			? `${format(state.filtersStartDate, 'MMM d, yyyy')} - ${format(state.filtersEndDate, 'MMM d, yyyy')}`
			: '';
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.date-picker-container')) {
			closeDatePicker();
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

		const markers = visitedLocations.map((loc) =>
			L.marker([loc.lat, loc.lng]).bindPopup(loc.name).addTo(map)
		);

		const bounds = L.latLngBounds(visitedLocations.map((loc) => [loc.lat, loc.lng]));
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

	type PeriodData = {
		totalDistance: string;
		earthCircumferences: number;
		locationsVisited: string;
		timeSpent: string;
		geopoints: number;
		steps: number;
		uniquePlaces: number;
		countriesVisited: number;
		activity: Array<{
			label: string;
			distance: number;
			locations: number;
		}>;
		transport: Array<{
			mode: string;
			distance: number;
			percentage: number;
		}>;
	};

	type Periods = 'Last 7 days' | 'Last 30 days' | 'Last 90 days' | 'Last year';

	const periodData: Record<Periods, PeriodData> = {
		'Last 7 days': {
			totalDistance: '234 km',
			earthCircumferences: 0.006,
			locationsVisited: '12',
			timeSpent: '28 hrs',
			geopoints: 1245,
			steps: 32500,
			uniquePlaces: 8,
			countriesVisited: 2,
			activity: [
				{ label: 'Mon', distance: 45, locations: 3 },
				{ label: 'Tue', distance: 32, locations: 2 },
				{ label: 'Wed', distance: 28, locations: 2 },
				{ label: 'Thu', distance: 40, locations: 3 },
				{ label: 'Fri', distance: 35, locations: 2 },
				{ label: 'Sat', distance: 30, locations: 1 },
				{ label: 'Sun', distance: 24, locations: 1 }
			],
			transport: [
				{ mode: 'Car', distance: 120, percentage: 51 },
				{ mode: 'Train', distance: 80, percentage: 34 },
				{ mode: 'Plane', distance: 0, percentage: 0 },
				{ mode: 'Bike', distance: 24, percentage: 10 },
				{ mode: 'Walking', distance: 10, percentage: 5 }
			]
		},
		'Last 30 days': {
			totalDistance: '1,234 km',
			earthCircumferences: 0.031,
			locationsVisited: '89',
			timeSpent: '156 hrs',
			geopoints: 5678,
			steps: 145000,
			uniquePlaces: 35,
			countriesVisited: 4,
			activity: [
				{ label: 'Week 1', distance: 320, locations: 12 },
				{ label: 'Week 2', distance: 280, locations: 10 },
				{ label: 'Week 3', distance: 350, locations: 15 },
				{ label: 'Week 4', distance: 284, locations: 11 }
			],
			transport: [
				{ mode: 'Car', distance: 650, percentage: 53 },
				{ mode: 'Train', distance: 420, percentage: 34 },
				{ mode: 'Plane', distance: 0, percentage: 0 },
				{ mode: 'Bike', distance: 124, percentage: 10 },
				{ mode: 'Walking', distance: 40, percentage: 3 }
			]
		},
		'Last 90 days': {
			totalDistance: '3,567 km',
			earthCircumferences: 0.089,
			locationsVisited: '245',
			timeSpent: '412 hrs',
			geopoints: 15789,
			steps: 456000,
			uniquePlaces: 89,
			countriesVisited: 6,
			activity: [
				{ label: 'Jan', distance: 1200, locations: 82 },
				{ label: 'Feb', distance: 1100, locations: 75 },
				{ label: 'Mar', distance: 1267, locations: 88 }
			],
			transport: [
				{ mode: 'Car', distance: 1850, percentage: 52 },
				{ mode: 'Train', distance: 1200, percentage: 34 },
				{ mode: 'Plane', distance: 400, percentage: 11 },
				{ mode: 'Bike', distance: 117, percentage: 3 },
				{ mode: 'Walking', distance: 0, percentage: 0 }
			]
		},
		'Last year': {
			totalDistance: '12,456 km',
			earthCircumferences: 0.311,
			locationsVisited: '892',
			timeSpent: '1,245 hrs',
			geopoints: 58901,
			steps: 1567000,
			uniquePlaces: 245,
			countriesVisited: 12,
			activity: [
				{ label: 'Jan', distance: 1200, locations: 82 },
				{ label: 'Feb', distance: 900, locations: 65 },
				{ label: 'Mar', distance: 1100, locations: 75 },
				{ label: 'Apr', distance: 950, locations: 70 },
				{ label: 'May', distance: 1300, locations: 85 },
				{ label: 'Jun', distance: 1250, locations: 80 },
				{ label: 'Jul', distance: 1400, locations: 90 },
				{ label: 'Aug', distance: 1350, locations: 88 },
				{ label: 'Sep', distance: 750, locations: 67 },
				{ label: 'Oct', distance: 850, locations: 70 },
				{ label: 'Nov', distance: 700, locations: 60 },
				{ label: 'Dec', distance: 706, locations: 60 }
			],
			transport: [
				{ mode: 'Car', distance: 6500, percentage: 52 },
				{ mode: 'Train', distance: 4200, percentage: 34 },
				{ mode: 'Plane', distance: 1000, percentage: 8 },
				{ mode: 'Bike', distance: 756, percentage: 6 },
				{ mode: 'Walking', distance: 0, percentage: 0 }
			]
		}
	};

	function currentPeriodData() {
		return periodData[state.filtersPeriod as Periods];
	}

	function activityTitle() {
		return state.filtersPeriod === 'Last 7 days'
			? 'Daily Activity'
			: state.filtersPeriod === 'Last 30 days'
				? 'Weekly Activity'
				: state.filtersPeriod === 'Last 90 days'
					? 'Monthly Activity'
					: 'Monthly Activity';
	}

	// Mock data for countries
	const countryData = [
		{ code: 'fr', name: 'France', count: 25, percentage: 31.25 },
		{ code: 'it', name: 'Italy', count: 20, percentage: 25 },
		{ code: 'es', name: 'Spain', count: 15, percentage: 18.75 },
		{ code: 'de', name: 'Germany', count: 12, percentage: 15 },
		{ code: 'nl', name: 'Netherlands', count: 8, percentage: 10 }
	];

	// Mock data for cities
	const cityData = [
		{ name: 'Paris', country: 'fr', count: 15, percentage: 20 },
		{ name: 'Rome', country: 'it', count: 12, percentage: 16 },
		{ name: 'Barcelona', country: 'es', count: 10, percentage: 13.33 },
		{ name: 'Berlin', country: 'de', count: 8, percentage: 10.67 },
		{ name: 'Amsterdam', country: 'nl', count: 7, percentage: 9.33 }
	];

	function stats() {
		return [
			{ id: 1, title: 'Total Distance', value: currentPeriodData().totalDistance, icon: Navigation, color: 'blue' },
			{ id: 2, title: 'Earth Circumferences', value: currentPeriodData().earthCircumferences.toFixed(3) + 'x', icon: Globe2, color: 'blue' },
			{ id: 3, title: 'Geopoints Tracked', value: currentPeriodData().geopoints.toLocaleString(), icon: Pin, color: 'blue' },
			{ id: 4, title: 'Time Moving', value: currentPeriodData().timeSpent, icon: Clock, color: 'blue' },
			{ id: 5, title: 'Unique Places', value: currentPeriodData().uniquePlaces.toLocaleString(), icon: Flag, color: 'blue' },
			{ id: 6, title: 'Countries Visited', value: currentPeriodData().countriesVisited.toString(), icon: Globe2, color: 'blue' },
			{ id: 7, title: 'Locations Visited', value: currentPeriodData().locationsVisited, icon: Map, color: 'blue' },
			{ id: 8, title: 'Approximate Steps', value: currentPeriodData().steps.toLocaleString(), icon: Footprints, color: 'blue' }
		];
	}

	const periods = ['Last 7 days', 'Last 30 days', 'Last 90 days'];
</script>

<svelte:head>
	<link
		rel="stylesheet"
		href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
		integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
		crossorigin=""
	/>
</svelte:head>

<svelte:window on:click={handleClickOutside} />

<div>
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<div class="flex items-center gap-3">
			<BarChart3 class="h-7 w-7 text-blue-600" />
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Statistics</h1>
		</div>
		<div class="flex items-center gap-4">
			<div class="flex rounded-md border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-1">
				{#each periods as p}
					<button
						class="cursor-pointer rounded px-3 py-1.5 text-sm transition-colors {state.filtersPeriod === p
							? 'bg-[rgb(37,140,244)] text-white dark:bg-blue-700 dark:text-white'
							: 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-[#23232a] dark:hover:text-gray-100'}"
						onclick={() => setPeriod(p)}
					>
						{p}
					</button>
				{/each}
			</div>
			<button
				class="flex h-[38px] cursor-pointer items-center gap-2 rounded-md border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] px-4 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#23232a]"
				onclick={toggleDatePicker}
				aria-haspopup="dialog"
				aria-expanded={state.filtersIsDatePickerOpen}
			>
				<Calendar class="h-4 w-4" />
				{selectedDateRange() || 'Date range'}
			</button>
		</div>
	</div>
	{#if state.filtersIsDatePickerOpen}
		<div class="mb-6 mt-3 rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-4">
			<div class="grid gap-4 md:grid-cols-2">
				<div>
					<label for="startDate" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100"
						>Start Date</label
					>
					<input
						type="date"
						id="startDate"
						value={state.filtersStartDate?.toISOString().split('T')[0] || ''}
						onchange={(e) => setStartDate((e.target as HTMLInputElement).value ? new Date((e.target as HTMLInputElement).value) : null)}
						class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] px-3 py-2 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
					/>
				</div>
				<div>
					<label for="endDate" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100"
						>End Date</label
					>
					<input
						type="date"
						id="endDate"
						value={state.filtersEndDate?.toISOString().split('T')[0] || ''}
						onchange={(e) => { setEndDate((e.target as HTMLInputElement).value ? new Date((e.target as HTMLInputElement).value) : null); closeDatePicker(); }}
						class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] px-3 py-2 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
					/>
				</div>
			</div>
		</div>
	{/if}

	<!-- Map -->
	<div class="mb-8 overflow-hidden rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a]">
		<div bind:this={mapContainer} class="h-[400px] w-full" style="z-index: 10;"></div>
	</div>

	<!-- Stats Cards -->
	<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
		{#each stats() as stat}
			{@const IconComponent = stat.icon}
			<div
				class="group relative overflow-hidden rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
			>
				<div class="flex items-start justify-between">
					<div class="flex items-center space-x-3">
						<div class="rounded-full bg-{stat.color}-100 dark:bg-{stat.color}-900/40 p-2">
							<IconComponent class="h-5 w-5 text-{stat.color}-600 dark:text-{stat.color}-400" />
						</div>
						<div>
							<h3 class="font-semibold text-gray-900 dark:text-gray-100">{stat.title}</h3>
							<p class="text-2xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</p>
						</div>
					</div>
				</div>
			</div>
		{/each}
	</div>

	<!-- Charts -->
	<div class="mt-8 grid gap-6 md:grid-cols-2">
		<div
			class="group relative overflow-hidden rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
		>
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{activityTitle()}</h3>
				<Calendar class="h-5 w-5 text-gray-400 dark:text-gray-300" />
			</div>
			<div class="h-64 w-full rounded-lg bg-gray-50 dark:bg-[#23232a] p-4">
				<div class="flex h-full items-center justify-between">
					{#each currentPeriodData().activity as data: { label: string; distance: number; locations: number }}
						<div class="flex h-full flex-col items-center justify-end gap-2">
							<div
								class="w-12 rounded-t bg-blue-100 dark:bg-blue-900/40"
								style="height: {(data.distance /
									Math.max(
										...currentPeriodData().activity.map((d: { distance: number }) => d.distance)
									)) *
									100}%"
							>
								<div class="h-full w-full rounded-t bg-blue-500 opacity-50 dark:bg-blue-400"></div>
							</div>
							<span class="text-xs text-gray-500 dark:text-gray-300">{data.label}</span>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<div
			class="group relative overflow-hidden rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
		>
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Countries</h3>
				<Map class="h-5 w-5 text-gray-400 dark:text-gray-300" />
			</div>
			<div class="h-64 w-full rounded-lg bg-gray-50 dark:bg-[#23232a] p-4">
				<div class="flex h-full flex-col justify-between">
					{#each countryData as data}
						<div class="flex items-center gap-4">
							<div class="w-32 text-sm text-gray-600 dark:text-gray-300">
								<div class="flex items-center gap-2">
									<img
										src={`https://flagcdn.com/w20/${data.code}.png`}
										alt={data.name}
										class="h-4 w-6 rounded"
									/>
									<span>{data.name}</span>
								</div>
							</div>
							<div class="flex-1">
								<div class="h-4 w-full rounded-full bg-gray-200 dark:bg-gray-700">
									<div
										class="h-full rounded-full bg-blue-500 dark:bg-blue-400"
										style="width: {data.percentage}%"
									></div>
								</div>
							</div>
							<div class="w-24 text-right text-sm">
								<span class="font-medium text-gray-900 dark:text-gray-100">{data.percentage}%</span>
								<span class="ml-1 text-gray-500 dark:text-gray-300">({data.count})</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<!-- Additional Stats -->
	<div class="mt-8 grid gap-6 md:grid-cols-2">
		<div
			class="group relative overflow-hidden rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
		>
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Cities</h3>
				<MapPin class="h-5 w-5 text-gray-400 dark:text-gray-300" />
			</div>
			<div class="h-64 w-full rounded-lg bg-gray-50 dark:bg-[#23232a] p-4">
				<div class="flex h-full flex-col justify-between">
					{#each cityData as data}
						<div class="flex items-center gap-4">
							<div class="w-32 text-sm text-gray-600 dark:text-gray-300">
								<div class="flex items-center gap-2">
									<img
										src={`https://flagcdn.com/w20/${data.country}.png`}
										alt={data.name}
										class="h-4 w-6 rounded"
									/>
									<span>{data.name}</span>
								</div>
							</div>
							<div class="flex-1">
								<div class="h-4 w-full rounded-full bg-gray-200 dark:bg-gray-700">
									<div
										class="h-full rounded-full bg-blue-500 dark:bg-blue-400"
										style="width: {data.percentage}%"
									></div>
								</div>
							</div>
							<div class="w-24 text-right text-sm">
								<span class="font-medium text-gray-900 dark:text-gray-100">{data.percentage}%</span>
								<span class="ml-1 text-gray-500 dark:text-gray-300">({data.count})</span>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<div
			class="group relative overflow-hidden rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
		>
			<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Transport Modes</h3>
			<div class="space-y-4">
				{#each currentPeriodData().transport as mode}
					<div class="flex items-center gap-4">
						<div class="flex w-24 items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
							{#if mode.mode === 'Car'}
								<Car class="h-4 w-4" />
							{:else if mode.mode === 'Train'}
								<Train class="h-4 w-4" />
							{:else if mode.mode === 'Plane'}
								<Plane class="h-4 w-4" />
							{:else if mode.mode === 'Bike'}
								<Bike class="h-4 w-4" />
							{:else}
								<Navigation class="h-4 w-4" />
							{/if}
							{mode.mode}
						</div>
						<div class="flex-1">
							<div class="h-4 w-full rounded-full bg-gray-200 dark:bg-gray-700">
								<div
									class="h-full rounded-full bg-blue-500 dark:bg-blue-400"
									style="width: {mode.percentage}%"
								></div>
							</div>
						</div>
						<div class="w-24 text-right text-sm">
							<span class="font-medium text-gray-900 dark:text-gray-100">{mode.percentage}%</span>
							<span class="ml-1 text-gray-500 dark:text-gray-300">({mode.distance} km)</span>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
