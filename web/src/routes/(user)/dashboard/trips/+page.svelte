<script lang="ts">
	import { onMount } from 'svelte';
	import type { Map as LeafletMap, LatLngExpression } from 'leaflet';
	import { BookOpen, Calendar } from 'lucide-svelte';
	import LocationCard from '$lib/components/LocationCard.svelte';
	import { format } from 'date-fns';
	import { state, setPeriod, setDateRange, setMapInitialState, clearMapInitialState, setStartDate, setEndDate, toggleDatePicker, closeDatePicker } from '$lib/stores/app-state.svelte';

	let map: LeafletMap;
	let L: typeof import('leaflet');
	let mapContainer: HTMLDivElement;
	let currentTileLayer: any;

	const periods = ['Last 7 days', 'Last 30 days', 'Last 90 days'];

	const locations = [
		{
			image: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=800&h=600&fit=crop',
			title: 'Eiffel Tower, Paris',
			date: 'Visited on 2025-06-14',
			lat: 48.8584,
			lng: 2.2945
		},
		{
			image: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&h=600&fit=crop',
			title: 'Colosseum, Rome',
			date: 'Visited on 2025-06-10',
			lat: 41.8902,
			lng: 12.4922
		},
		{
			image: 'https://images.unsplash.com/photo-1695877288656-7328e69aac68?w=800&h=600&fit=crop',
			title: 'Statue of Liberty, NYC',
			date: 'Visited on 2025-05-28',
			lat: 40.6892,
			lng: -74.0445
		},
		{
			image: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=800&h=600&fit=crop',
			title: 'Tokyo Tower, Tokyo',
			date: 'Visited on 2025-05-15',
			lat: 35.6586,
			lng: 139.7454
		},
		{
			image: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=800&h=600&fit=crop',
			title: 'Sydney Opera House',
			date: 'Visited on 2025-04-20',
			lat: -33.8568,
			lng: 151.2153
		},
		{
			image: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=800&h=600&fit=crop',
			title: 'Golden Gate Bridge',
			date: 'Visited on 2025-04-01',
			lat: 37.8199,
			lng: -122.4783
		}
	];

	function selectedDateRange() {
		return state.filtersStartDate && state.filtersEndDate
			? `${format(state.filtersStartDate, 'MMM d, yyyy')} - ${format(state.filtersEndDate, 'MMM d, yyyy')}`
			: 'Date range';
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.date-picker-container')) {
			// Close date picker logic would go here if we had a state for it
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

	onMount(() => {
		let observer: MutationObserver;

		(async () => {
			L = (await import('leaflet')).default;
			if (map) return;

			map = L.map(mapContainer, {
				zoomControl: true,
				attributionControl: false
			}).setView([20, 0], 2);

			L.control.attribution({ prefix: '<a href="https://leafletjs.com" title="A JS library for interactive maps">Leaflet</a>' }).addTo(map);

			function getTileLayerUrl() {
				const isDark = document.documentElement.classList.contains('dark');
				return isDark
					? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
					: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
			}

			currentTileLayer = L.tileLayer(getTileLayerUrl(), {
				attribution: '© OpenStreetMap contributors & CARTO'
			}).addTo(map);

			locations.forEach(loc => {
				L.marker([loc.lat, loc.lng]).addTo(map);
			});

			observer = new MutationObserver(() => {
				if (currentTileLayer) map.removeLayer(currentTileLayer);
				currentTileLayer = L.tileLayer(getTileLayerUrl(), {
					attribution: '© OpenStreetMap contributors & CARTO'
				}).addTo(map);
			});
			observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		})();

		return () => {
			if (observer) {
				observer.disconnect();
			}
		};
	});
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

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
		<div class="flex items-center gap-3">
			<BookOpen class="h-8 w-8 text-gray-500 dark:text-gray-400" />
			<h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">Recent Locations</h1>
		</div>
		<div class="flex items-center gap-4">
			<div class="flex rounded-md border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-1">
				{#each periods as p}
					<button
						class="cursor-pointer rounded px-3 py-1.5 text-sm transition-colors {state.filtersPeriod === p
							? 'bg-[rgb(37,140,244)] text-white dark:bg-blue-700'
							: 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'}"
						onclick={() => setPeriod(p)}
					>
						{p}
					</button>
				{/each}
			</div>
			<div class="relative date-picker-container">
				<button
					class="flex h-[38px] w-full items-center gap-2 rounded-md border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] px-4 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
					onclick={toggleDatePicker}
				>
					<Calendar class="h-4 w-4" />
					{selectedDateRange()}
				</button>
				{#if state.filtersIsDatePickerOpen}
					<div class="absolute right-0 top-full z-10 mt-2 w-72 rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-4 shadow-lg">
						<div class="grid grid-cols-2 gap-4">
							<div>
								<label for="startDate" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">Start Date</label>
								<input type="date" id="startDate" value={state.filtersStartDate?.toISOString().split('T')[0] || ''} onchange={(e) => setStartDate((e.target as HTMLInputElement).value ? new Date((e.target as HTMLInputElement).value) : null)} class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
							</div>
							<div>
								<label for="endDate" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">End Date</label>
								<input type="date" id="endDate" value={state.filtersEndDate?.toISOString().split('T')[0] || ''} onchange={(e) => { setEndDate((e.target as HTMLInputElement).value ? new Date((e.target as HTMLInputElement).value) : null); closeDatePicker(); }} class="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Map -->
	<div
		class="relative h-[400px] overflow-hidden rounded-xl bg-gray-200 dark:bg-gray-800"
		bind:this={mapContainer}
		style="z-index: 10;"
	></div>

	<!-- Location Cards -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
		{#each locations as location}
			<LocationCard {...location} on:mouseenter={handlePlaceHover} on:mouseleave={handlePlaceLeave} />
		{/each}
	</div>
</div>
