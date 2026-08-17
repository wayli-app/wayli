<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { watchMapTheme, TILE_URLS } from '$lib/utils/map-theme';
	import type { Map as LeafletMap } from 'leaflet';

	type Props = {
		points: Array<{ lat: number; lng: number }>;
		markers?: Array<{ lat: number; lng: number; label: string }>;
		highlightPoints?: Array<{ lat: number; lng: number }>;
		class?: string;
	};

	let { points, markers = [], highlightPoints = [], class: className = 'h-80' }: Props = $props();

	let mapContainer: HTMLDivElement;
	let map = $state<LeafletMap | null>(null);
	let L: any = null;
	let mainLayer: any = null;
	let highlightLayer: any = null;
	let cleanupThemeWatcher: (() => void) | null = null;

	onMount(async () => {
		L = await import('leaflet');

		const mapInstance = L.map(mapContainer, { scrollWheelZoom: true });
		map = mapInstance;
		// ponytail: theme-aware tile layer — rebuilds on dark/light toggle
		cleanupThemeWatcher = watchMapTheme(mapInstance, (theme) =>
			L.tileLayer(TILE_URLS[theme].url, {
				attribution: TILE_URLS[theme].attribution,
				maxZoom: 18
			})
		);

		mainLayer = L.layerGroup().addTo(map);
		highlightLayer = L.layerGroup().addTo(map);

		setTimeout(() => map?.invalidateSize(), 200);
	});

	// Single effect: redraws everything when any input changes.
	// Reads all reactive values at the top so Svelte tracks them.
	$effect(() => {
		const m = map;
		const pts = points;
		const mkrs = markers;
		const hp = highlightPoints;
		const lib = L;
		const ml = mainLayer;
		const hl = highlightLayer;

		if (!m || !lib || !ml || !hl) return;

		// --- Main layer ---
		ml.clearLayers();
		let mainPolyline: any = null;

		if (pts.length > 0 || mkrs.length > 0) {
			const sampled =
				pts.length > 1500 ? pts.filter((_, i) => i % Math.ceil(pts.length / 1500) === 0) : pts;

			if (sampled.length > 1) {
				const latlngs = sampled.map((p) => [p.lat, p.lng] as [number, number]);
				mainPolyline = lib.polyline(latlngs, { color: '#3b82f6', weight: 4, opacity: 0.6 });
				mainPolyline.addTo(ml);
			}

			if (sampled.length > 0) {
				lib
					.circleMarker([sampled[0].lat, sampled[0].lng], {
						radius: 5,
						fillColor: '#22c55e',
						color: '#fff',
						weight: 2,
						fillOpacity: 1
					})
					.addTo(ml);
			}
			if (sampled.length > 1) {
				const last = sampled[sampled.length - 1];
				lib
					.circleMarker([last.lat, last.lng], {
						radius: 5,
						fillColor: '#ef4444',
						color: '#fff',
						weight: 2,
						fillOpacity: 1
					})
					.addTo(ml);
			}

			for (const marker of mkrs) {
				lib
					.circleMarker([marker.lat, marker.lng], {
						radius: 6,
						fillColor: '#233869',
						color: '#fff',
						weight: 2,
						fillOpacity: 0.9
					})
					.bindPopup(marker.label)
					.addTo(ml);
			}
		}

		// --- Highlight layer ---
		hl.clearLayers();

		if (hp.length > 0) {
			const hlatlngs = hp.map((p) => [p.lat, p.lng] as [number, number]);
			lib.polyline(hlatlngs, { color: '#233869', weight: 6, opacity: 0.9 }).addTo(hl);

			lib
				.circleMarker(hlatlngs[0], {
					radius: 7,
					fillColor: '#233869',
					color: '#fff',
					weight: 2,
					fillOpacity: 1
				})
				.addTo(hl);
			if (hlatlngs.length > 1) {
				lib
					.circleMarker(hlatlngs[hlatlngs.length - 1], {
						radius: 7,
						fillColor: '#233869',
						color: '#fff',
						weight: 2,
						fillOpacity: 1
					})
					.addTo(hl);
			}

			m.fitBounds(lib.latLngBounds(hlatlngs), { padding: [50, 50], maxZoom: 14 });
		} else if (mainPolyline) {
			const bounds = mainPolyline.getBounds();
			if (bounds.isValid()) {
				m.fitBounds(bounds, { padding: [30, 30] });
			}
		} else if (pts.length > 0) {
			// Single point or markers only: center on first point
			m.setView([pts[0].lat, pts[0].lng], 13);
		} else if (mkrs.length > 0) {
			m.setView([mkrs[0].lat, mkrs[0].lng], 3);
		} else {
			m.setView([0, 0], 2);
		}

		// Recompute the map's pixel size. When this component is reused (e.g.
		// the map div is re-parented inside a newly-expanded trip card without a
		// remount), Leaflet keeps a stale 0×0 size and tiles/layers don't lay out
		// even though they were redrawn above. invalidateSize forces a relayout.
		m.invalidateSize();
	});

	onDestroy(() => {
		cleanupThemeWatcher?.();
		map?.remove();
	});
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<div bind:this={mapContainer} class="relative z-0 rounded-lg {className}"></div>
