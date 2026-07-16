<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { feature } from 'topojson-client';
	import type { Topology } from 'topojson-specification';

	type Props = {
		visitedCountries: string[]; // ISO2 codes: ['NL', 'JP', 'TH', ...]
		countryStats?: Record<string, { trips: number; cities: number }>;
		class?: string;
	};

	let { visitedCountries, countryStats = {}, class: className = 'h-80' }: Props = $props();

	let mapContainer: HTMLDivElement;
	let map: any = null;
	let L: any = null;

	const visitedSet = new Set(visitedCountries.map((c) => c.toUpperCase()));

	onMount(async () => {
		L = (await import('leaflet')).default;

		map = L.map(mapContainer, { scrollWheelZoom: false, zoomControl: true });
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap',
			maxZoom: 5
		}).addTo(map);

		// Fetch world country boundaries (110m resolution = small file)
		try {
			const resp = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
			const topoData: Topology = await resp.json();

			// Convert TopoJSON to GeoJSON
			const geojson = feature(topoData, topoData.objects.countries as any);

			L.geoJSON(geojson as any, {
				style: (feature: any) => {
					const iso2 = feature.properties?.iso_a2 || feature.id || '';
					const isVisited = visitedSet.has(iso2.toUpperCase());

					return {
						fillColor: isVisited ? '#3b82f6' : '#e5e7eb',
						weight: isVisited ? 1 : 0.5,
						opacity: 1,
						color: isVisited ? '#1d4ed8' : '#d1d5db',
						fillOpacity: isVisited ? 0.6 : 0.3
					};
				},
				onEachFeature: (feature: any, layer: any) => {
					const name = feature.properties?.name || 'Unknown';
					const iso2 = (feature.properties?.iso_a2 || feature.id || '').toUpperCase();
					const stats = countryStats[iso2];

					let tooltip = name;
					if (stats) {
						tooltip += `<br><span style="font-size:11px;color:#666">${stats.trips} ${stats.trips === 1 ? 'trip' : 'trips'}, ${stats.cities} ${stats.cities === 1 ? 'city' : 'cities'}</span>`;
					} else if (visitedSet.has(iso2)) {
						tooltip += '<br><span style="font-size:11px;color:#666">Visited</span>';
					}

					layer.bindTooltip(tooltip, { sticky: true });
				}
			}).addTo(map);
		} catch (err) {
			console.error('Failed to load world map data:', err);
		}

		map.setView([20, 0], 2);
		setTimeout(() => map?.invalidateSize(), 200);
	});

	onDestroy(() => {
		map?.remove();
	});
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<div bind:this={mapContainer} class="rounded-lg {className}"></div>
