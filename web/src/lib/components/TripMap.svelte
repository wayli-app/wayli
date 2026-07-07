<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Map as LeafletMap } from 'leaflet';

	type Props = {
		points: Array<{ lat: number; lng: number }>;
		markers?: Array<{ lat: number; lng: number; label: string }>;
		class?: string;
	};

	let { points, markers = [], class: className = 'h-80' }: Props = $props();

	let mapContainer: HTMLDivElement;
	let map: LeafletMap | null = null;

	onMount(async () => {
		const L = (await import('leaflet')).default;
		await import('leaflet/dist/leaflet.css');

		map = L.map(mapContainer, { scrollWheelZoom: false });
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap contributors',
			maxZoom: 18
		}).addTo(map);

		// GPS track polyline (downsampled to max 500 points for performance)
		const sampled =
			points.length > 500
				? points.filter((_, i) => i % Math.ceil(points.length / 500) === 0)
				: points;

		if (sampled.length > 1) {
			const latlngs = sampled.map((p) => [p.lat, p.lng] as [number, number]);
			L.polyline(latlngs, { color: '#233869', weight: 3, opacity: 0.7 }).addTo(map);
		}

		// City markers
		for (const m of markers) {
			L.circleMarker([m.lat, m.lng], {
				radius: 6,
				fillColor: '#233869',
				color: '#fff',
				weight: 2,
				fillOpacity: 0.9
			})
				.bindPopup(m.label)
				.addTo(map);
		}

		// Fit bounds to all points + markers
		const all = [...sampled.map((p) => [p.lat, p.lng]), ...markers.map((m) => [m.lat, m.lng])];
		if (all.length > 0) {
			map.fitBounds(L.latLngBounds(all as [number, number][]), { padding: [30, 30] });
		} else {
			map.setView([0, 0], 2); // fallback
		}

		// Fix render issue when container is hidden initially
		setTimeout(() => map?.invalidateSize(), 100);
	});

	onDestroy(() => {
		map?.remove();
	});
</script>

<div bind:this={mapContainer} class="rounded-lg {className}"></div>
