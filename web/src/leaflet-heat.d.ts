// leaflet.heat ships no types — it's a side-effect import that attaches
// L.heatLayer to the leaflet namespace at runtime. The export below makes this
// file a module, which turns `declare module 'leaflet'` into an augmentation of
// @types/leaflet. In a global script (like vite-env.d.ts) the same declaration
// would shadow @types/leaflet entirely and strip all of Leaflet's real exports.
export {};

declare module 'leaflet' {
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
