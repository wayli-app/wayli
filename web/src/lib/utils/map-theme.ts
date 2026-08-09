/**
 * Watch the documentElement's class list for dark/light theme changes and
 * swap a Leaflet map's tile layer accordingly.
 *
 * Usage:
 *   const cleanup = watchMapTheme(map, () => L.tileLayer(...).addTo(map));
 *   // later, on unmount:
 *   cleanup();
 *
 * The factory is called once on mount and again whenever the theme flips.
 * Returns a cleanup function that disconnects the MutationObserver.
 *
 * ponytail: this is the smallest reliable cross-component pattern — one
 * MutationObserver per map, no shared state, no Svelte stores. Each map
 * owns its tileLayer; we just notify it when the theme changes.
 */

import L from 'leaflet';

export function isDarkMode(): boolean {
	if (typeof document === 'undefined') return false;
	return document.documentElement.classList.contains('dark');
}

export type TileTheme = 'light' | 'dark';

/**
 * Standard CartoDB tile URLs + attributions used across the app.
 * Centralised here so attribution text stays consistent.
 */
export const TILE_URLS: Record<TileTheme, { url: string; attribution: string }> = {
	light: {
		url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
		attribution: '&copy; OpenStreetMap &copy; CARTO'
	},
	dark: {
		url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
		attribution: '&copy; OpenStreetMap &copy; CARTO'
	}
};

/**
 * No-labels tile variants — same CartoDB basemap style but without labels/text
 * and without the cartographic graticule (latitude/longitude rules) that `_all`
 * tiles bake into the raster at low zooms. Used by the world/overview map,
 * whose country borders come from a GeoJSON overlay, so the tile's own borders
 * + graticule would render as unwanted thin horizontal lines across the map.
 */
export const TILE_URLS_NOLABELS: Record<TileTheme, { url: string; attribution: string }> = {
	light: {
		url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
		attribution: '&copy; OpenStreetMap &copy; CARTO'
	},
	dark: {
		url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
		attribution: '&copy; OpenStreetMap &copy; CARTO'
	}
};

/**
 * Watch theme changes and rebuild the tile layer on the given map.
 *
 * @param map The Leaflet map instance.
 * @param buildTile Called with the current theme; must return a new
 *   `L.TileLayer` (not yet added to the map — we add it). Called once
 *   immediately for the initial theme, then again on every theme flip.
 * @returns Cleanup function — call on component destroy to detach the
 *   observer.
 */
export function watchMapTheme(
	map: L.Map,
	buildTile: (theme: TileTheme) => L.TileLayer
): () => void {
	let currentLayer: L.TileLayer | null = null;
	// Captured so the returned cleanup can cancel it. The dashboard layout
	// destroys the page DOM on navigation ({#key page.url.pathname}); an armed
	// invalidateSize() firing against a detached map triggers Leaflet's
	// unguarded parentNode loops → "can't access property parentNode".
	let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
	let disposed = false;

	const apply = () => {
		// Guard: a theme-mutation (e.g. a Svelte transition toggling classes on
		// <html>) can fire after the owning page has torn the map down. Bail
		// before touching a detached container. `_loaded === false` is set by
		// map.remove(); checking it covers the gap before cleanup runs.
		if (disposed || !map || (map as any)._loaded === false) return;
		const theme: TileTheme = isDarkMode() ? 'dark' : 'light';
		const next = buildTile(theme);
		// Only swap if the URL actually changed — prevents unnecessary
		// tile reloads when the MutationObserver fires for unrelated
		// class changes (e.g., Svelte adding/removing transition classes).
		if (currentLayer && (currentLayer as any)._url === (next as any)._url) {
			return;
		}
		if (currentLayer) {
			map.removeLayer(currentLayer);
		}
		currentLayer = next;
		currentLayer.addTo(map);
		currentLayer.bringToBack();
		// Invalidate size after swap so Leaflet recalculates the visible
		// tile range. Without this, tiles sometimes don't render on maps
		// inside {#key} blocks or collapsed sections.
		if (invalidateTimer) clearTimeout(invalidateTimer);
		invalidateTimer = setTimeout(() => {
			invalidateTimer = null;
			try {
				map.invalidateSize();
			} catch {
				// map may have been removed
			}
		}, 100);
	};

	apply();

	const observer = new MutationObserver(apply);
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['class']
	});

	return () => {
		disposed = true;
		observer.disconnect();
		if (invalidateTimer) {
			clearTimeout(invalidateTimer);
			invalidateTimer = null;
		}
		if (currentLayer) {
			map.removeLayer(currentLayer);
			currentLayer = null;
		}
	};
}
