<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Map as LeafletMap } from 'leaflet';
	import type * as LeafletNS from 'leaflet';

	type Props = {
		points: Array<{ lat: number; lng: number }>;
		markers?: Array<{ lat: number; lng: number; label: string }>;
		highlightPoints?: Array<{ lat: number; lng: number }>;
		class?: string;
	};

	let { points, markers = [], highlightPoints = [], class: className = 'h-80' }: Props = $props();

	let mapContainer: HTMLDivElement;
	let map = $state<LeafletMap | null>(null);
	// ponytail: L loaded dynamically, typed as any to avoid leaflet types quirk
	let L: any = null;
	let mainPolyline: LeafletNS.Polyline | null = null;
	let mainLayer: LeafletNS.LayerGroup | null = null;
	let highlightLayer: LeafletNS.LayerGroup | null = null;

	onMount(async () => {
		L = (await import('leaflet')).default;

		map = L.map(mapContainer, { scrollWheelZoom: false });
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap contributors',
			maxZoom: 18
		}).addTo(map);

		mainLayer = L.layerGroup().addTo(map);
		highlightLayer = L.layerGroup().addTo(map);

		// Effects will handle initial draw once `map` is set.
		setTimeout(() => map?.invalidateSize(), 200);
	});

	function redrawMain() {
		if (!map || !L || !mainLayer) return;
		mainLayer.clearLayers();
		if (mainPolyline) {
			mainPolyline = null;
		}

		if (points.length === 0 && markers.length === 0) {
			map.setView([0, 0], 2);
			return;
		}

		// Downsample for polyline (keep enough for a smooth line)
		const sampled =
			points.length > 1500
				? points.filter((_, i) => i % Math.ceil(points.length / 1500) === 0)
				: points;

		if (sampled.length > 1) {
			const latlngs = sampled.map((p) => [p.lat, p.lng] as [number, number]);
			mainPolyline = L.polyline(latlngs, { color: '#3b82f6', weight: 4, opacity: 0.6 });
			mainPolyline!.addTo(mainLayer);
		}

		// Start marker
		if (sampled.length > 0) {
			L.circleMarker([sampled[0].lat, sampled[0].lng], {
				radius: 5,
				fillColor: '#22c55e',
				color: '#fff',
				weight: 2,
				fillOpacity: 1
			}).addTo(mainLayer);
		}
		// End marker
		if (sampled.length > 1) {
			const last = sampled[sampled.length - 1];
			L.circleMarker([last.lat, last.lng], {
				radius: 5,
				fillColor: '#ef4444',
				color: '#fff',
				weight: 2,
				fillOpacity: 1
			}).addTo(mainLayer);
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
				.addTo(mainLayer);
		}

		// Fit bounds to everything
		const all = [...sampled.map((p) => [p.lat, p.lng]), ...markers.map((m) => [m.lat, m.lng])];
		if (all.length > 0) {
			map.fitBounds(L.latLngBounds(all as [number, number][]), { padding: [30, 30] });
		}
	}

	function redrawHighlight() {
		if (!map || !L || !highlightLayer) return;
		highlightLayer.clearLayers();

		if (highlightPoints.length > 0) {
			const latlngs = highlightPoints.map((p) => [p.lat, p.lng] as [number, number]);
			L.polyline(latlngs, { color: '#233869', weight: 6, opacity: 0.9 }).addTo(highlightLayer);

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

			map.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50], maxZoom: 14 });
		} else if (mainPolyline) {
			const bounds = mainPolyline.getBounds();
			if (bounds.isValid()) {
				map.fitBounds(bounds, { padding: [30, 30] });
			}
		}
	}

	// React to points/markers/map changes
	$effect(() => {
		void points;
		void markers;
		void map; // re-run when map is ready
		redrawMain();
	});

	// React to highlight/map changes
	$effect(() => {
		void highlightPoints;
		void map; // re-run when map is ready
		redrawHighlight();
	});

	onDestroy(() => {
		map?.remove();
	});
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<div bind:this={mapContainer} class="rounded-lg {className}"></div>
