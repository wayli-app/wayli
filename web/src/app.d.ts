// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces

// Pull in the leaflet.markercluster module augmentation (L.markerClusterGroup).
// It's a module-style d.ts, so it's not auto-included via typeRoots — pages
// that dynamically import the plugin rely on this reference for its types.
/// <reference types="leaflet.markercluster" />

declare global {
	namespace App {
		// All authentication is now handled client-side
		// No server-side locals or session handling needed
		interface PageData {
			// Page data will be loaded client-side
			// This interface is intentionally empty as data is loaded client-side
			_clientSide?: boolean;
		}
		// interface Error {}
		// interface Error {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
