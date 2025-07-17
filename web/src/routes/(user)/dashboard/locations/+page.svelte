<script lang="ts">
	import { MapPin, Calendar } from 'lucide-svelte';
	import LocationCard from '$lib/components/LocationCard.svelte';
	import { onMount } from 'svelte';
	import type { Map } from 'leaflet';
	import 'leaflet/dist/leaflet.css';

	let startDate: Date | null = null;
	let endDate: Date | null = null;
	let isDatePickerOpen = false;

	const locations = [
		{
			title: 'Eiffel Tower, Paris',
			date: '2025-06-14',
			image:
				'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?auto=format&fit=crop&w=600&q=80',
			lat: 48.8584,
			lng: 2.2945
		},
		{
			title: 'Colosseum, Rome',
			date: '2025-06-10',
			image:
				'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=600&q=80',
			lat: 41.8902,
			lng: 12.4922
		},
		{
			title: 'Statue of Liberty, NYC',
			date: '2025-05-28',
			image:
				'https://images.unsplash.com/photo-1534430480872-3498386e7856?auto=format&fit=crop&w=600&q=80',
			lat: 40.6892,
			lng: -74.0445
		},
		{
			title: 'Tokyo Tower, Tokyo',
			date: '2025-05-15',
			image:
				'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?auto=format&fit=crop&w=600&q=80',
			lat: 35.6586,
			lng: 139.7454
		},
		{
			title: 'Sydney Opera House',
			date: '2025-04-20',
			image:
				'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=600&q=80',
			lat: -33.8568,
			lng: 151.2153
		},
		{
			title: 'Golden Gate Bridge',
			date: '2025-04-01',
			image:
				'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=600&q=80',
			lat: 37.8199,
			lng: -122.4783
		}
	];

	let map: Map;
	let L: typeof import('leaflet');
	let mapContainer: HTMLDivElement;
	let currentTileLayer: any;

	onMount(async () => {
		L = (await import('leaflet')).default;
		if (map) return;
		map = L.map(mapContainer, {
			center: [20, 0],
			zoom: 2,
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
		locations.forEach((loc) => {
			L.marker([loc.lat, loc.lng]).addTo(map);
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

	function handleLocationHover(event: CustomEvent<{ lat: number; lng: number }>) {
		if (!map) return;
		const { lat, lng } = event.detail;
		map.setView([lat, lng], 15);
	}

	function handleLocationLeave() {
		if (!map) return;
		const bounds = L.latLngBounds(locations.map((loc) => [loc.lat, loc.lng]));
		map.fitBounds(bounds, { padding: [50, 50] });
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

<!-- Header -->
<div class="mb-6 flex items-center justify-between">
	<div class="flex items-center gap-3">
		<MapPin class="h-8 w-8 text-blue-600 dark:text-gray-400" />
		<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Locations</h1>
	</div>
	<div class="flex items-center gap-4">
		<button
			class="flex h-[38px] cursor-pointer items-center gap-2 rounded-md border border-[rgb(218,218,221)] bg-white px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-[#23232a] dark:bg-[#23232a] dark:text-gray-200 dark:hover:bg-[#23232a]"
			on:click={() => (isDatePickerOpen = !isDatePickerOpen)}
		>
			<Calendar class="h-4 w-4" />
			Date range
		</button>
	</div>
</div>

{#if isDatePickerOpen}
	<div
		class="mt-3 mb-6 rounded-xl border border-[rgb(218,218,221)] bg-white p-4 dark:border-[#23232a] dark:bg-[#23232a]"
	>
		<div class="grid gap-4 md:grid-cols-2">
			<div>
				<label
					for="startDate"
					class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100"
					>Start Date</label
				>
				<input
					type="date"
					id="startDate"
					bind:value={startDate}
					class="w-full rounded-md border border-[rgb(218,218,221)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:bg-[#23232a] dark:text-gray-100 dark:placeholder:text-gray-400"
				/>
			</div>
			<div>
				<label
					for="endDate"
					class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">End Date</label
				>
				<input
					type="date"
					id="endDate"
					bind:value={endDate}
					class="w-full rounded-md border border-[rgb(218,218,221)] bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[rgb(37,140,244)] focus:ring-1 focus:ring-[rgb(37,140,244)] focus:outline-none dark:bg-[#23232a] dark:text-gray-100 dark:placeholder:text-gray-400"
				/>
			</div>
		</div>
	</div>
{/if}

<!-- Map -->
<div class="mb-8 overflow-hidden rounded-xl">
	<div bind:this={mapContainer} class="relative h-[400px] w-full" style="z-index: 10;"></div>
</div>

<!-- Cards -->
<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
	{#each locations as loc}
		<LocationCard
			image={loc.image}
			title={loc.title}
			date={loc.date}
			lat={loc.lat}
			lng={loc.lng}
			on:mouseenter={handleLocationHover}
			on:mouseleave={handleLocationLeave}
		/>
	{/each}
</div>
