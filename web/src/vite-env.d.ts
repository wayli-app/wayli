/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly PUBLIC_FLUXBASE_ANON_KEY: string;
	readonly FLUXBASE_SERVICE_ROLE_KEY: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

// leaflet.heat ships no types. It's a side-effect import that attaches
// L.heatLayer to the leaflet namespace; declare the module so the dynamic
// import type-checks. The heatLayer signature itself is declared as a proper
// module augmentation in src/leaflet-heat.d.ts.
declare module 'leaflet.heat';
