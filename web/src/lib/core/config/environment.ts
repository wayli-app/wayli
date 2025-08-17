// src/lib/core/config/environment.ts
// Only include public, client-safe config!
// This file should ONLY be imported in client-side/browser code (SvelteKit load functions, client-side stores, etc).
// Never import secrets or private env vars here.

/**
 * Get the public Nominatim config for client-side use.
 * @returns {{ endpoint: string; rateLimit: number }}
 */
export function getNominatimConfig() {
	return {
		endpoint: 'https://nominatim.wayli.app',
		rateLimit: 1 // 1 request per second
	};
}
