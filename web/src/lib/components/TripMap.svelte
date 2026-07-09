<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Map as LeafletMap } from 'leaflet';
	import type * as Leaflet from 'leaflet';

	type Props = {
		points: Array<{ lat: number; lng: number }>;
		markers?: Array<{ lat: number; lng: number; label: string }>;
		highlightPoints?: Array<{ lat: number; lng: number }>;
		class?: string;
	};

	let {
		points,
		markers = [],
		highlightPoints = [],
		class: className = 'h-80'
	}: Props = $props();

	let mapContainer: HTMLDivElement;
	let map: LeafletMap | null = null;
	let mainPolyline: Leaflet.Polyline | null = null;
	let highlightLayer: Leaflet.LayerGroup | null = null;

	onMount(async () => {
		const L = (await import('leaflet')).default;
		await import('leaflet/dist/leaflet.css');

		map = L.map(mapContainer, { scrollWheelZoom: false });
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap contributors',
			maxZoom: 18
		}).addTo(map);

		highlightLayer = L.layerGroup().addTo(map);

		// Full GPS track (downsampled)
		const sampled =
			points.length > 500
				? points.filter((_, i) => i % Math.ceil(points.length / 500) === 0)
				: points;

		if (sampled.length > 1) {
			const latlngs = sampled.map((p) => [p.lat, p.lng] as [number, number]);
			mainPolyline = L.polyline(latlngs, { color: '#60a5fa', weight: 3, opacity: 0.4 });
			mainPolyline.addTo(map);
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
			map.setView([0, 0], 2);
		}

		setTimeout(() => map?.invalidateSize(), 100);
	});

	// React to highlight changes
	$effect(() => {
		if (!map) return;
		const L = (window as any).L;
		if (!L || !highlightLayer) return;

		highlightLayer.clearLayers();

		if (highlightPoints.length > 0) {
			// Bright highlight polyline
			const latlngs = highlightPoints.map((p) => [p.lat, p.lng] as [number, number]);
			L.polyline(latlngs, { color: '#233869', weight: 5, opacity: 0.9 }).addTo(highlightLayer);

			// Start/end markers for the highlighted segment
			if (latlngs.length > 0) {
				L.circleMarker(latlngs[0], {
					radius: 7,
					fillColor: '#233869',
					color: '#fff',
					weight: 2,
					fillOpacity: 1
				}).addTo(highlightLayer);
				if (latlngs.length > 1) {
					L.circleMarker(latlngs[latlngs.length - 1], {
						radius: 7,
						fillColor: '#233869',
						color: '#fff',
						weight: 2,
						fillOpacity: 1
					}).addTo(highlightLayer);
				}
			}

			// Pan to the highlighted area
			map.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50], maxZoom: 14 });
		} else if (mainPolyline) {
			// Reset to full route
			const bounds = mainPolyline.getBounds();
			if (bounds.isValid()) {
				map.fitBounds(bounds, { padding: [30, 30] });
			}
		}
	});

	onDestroy(() => {
		map?.remove();
	});
</script>

<div bind:this={mapContainer} class="rounded-lg {className}"></div>
