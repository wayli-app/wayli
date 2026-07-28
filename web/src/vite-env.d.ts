/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly PUBLIC_FLUXBASE_ANON_KEY: string;
	readonly FLUXBASE_SERVICE_ROLE_KEY: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

// leaflet.heat ships no types. It's a side-effect import that attaches
// L.heatLayer to the leaflet namespace. Declare the module so the dynamic
// import type-checks, and augment Leaflet with the heatLayer signature.
declare module 'leaflet.heat';

declare module 'leaflet' {
	interface Map {
		// leaflet.heat layers are plain L.Layer instances; no extra API needed.
	}
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface LeafletHeatmapOptions {
		minOpacity?: number;
		maxZoom?: number;
		max?: number;
		radius?: number;
		blur?: number;
		gradient?: { [stop: number]: string };
	}
	function heatLayer(
		latlngs: Array<[number, number, number?]>,
		options?: LeafletHeatmapOptions
	): Layer;
}

