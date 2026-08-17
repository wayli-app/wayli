// Minimal typing for the leaflet.markercluster plugin (dynamically imported by
// the want-to-visit map). The official @types/leaflet.markercluster augmentation
// can't be used here: that package bundles a nested @types/leaflet copy, so its
// `declare module 'leaflet'` augments the nested instance instead of the hoisted
// one app code resolves to. The export makes this file a module so the
// declaration below augments the leaflet instance we actually use.
export {};

declare module 'leaflet' {
	interface MarkerClusterGroupOptions {
		chunkedLoading?: boolean;
		spiderfyOnMaxZoom?: boolean;
		showCoverageOnHover?: boolean;
		zoomToBoundsOnClick?: boolean;
		disableClusteringAtZoom?: number;
		maxClusterRadius?: number | ((zoom: number) => number);
		iconCreateFunction?: (cluster: { getChildCount(): number }) => DivIcon;
	}

	interface MarkerClusterGroup extends Layer {
		addLayer(layer: Layer): this;
		clearLayers(): this;
	}

	function markerClusterGroup(options?: MarkerClusterGroupOptions): MarkerClusterGroup;
}
