import { getNominatimConfig } from '$lib/core/config/environment';

const config = getNominatimConfig();
const MIN_INTERVAL = 1000 / config.rateLimit;

let lastRequestTime = 0;

export interface NominatimResponse {
	display_name: string;
	address?: Record<string, string>;
	[key: string]: unknown;
}

export interface NominatimSearchResponse {
	display_name: string;
	lat: string;
	lon: string;
	address?: Record<string, string>;
	[key: string]: unknown;
}

export async function reverseGeocode(lat: number, lon: number): Promise<NominatimResponse> {
	// Rate limiting
	const now = Date.now();
	const wait = Math.max(0, lastRequestTime + MIN_INTERVAL - now);
	if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
	lastRequestTime = Date.now();

	// Validate coordinates before making request
	if (
		typeof lat !== 'number' ||
		typeof lon !== 'number' ||
		isNaN(lat) ||
		isNaN(lon) ||
		lat < -90 ||
		lat > 90 ||
		lon < -180 ||
		lon > 180
	) {
		throw new Error(`Invalid coordinates: lat=${lat}, lon=${lon}`);
	}

	// Try the configured endpoint first, then fallback to public Nominatim
	const endpoints = [config.endpoint, 'https://nominatim.int.hazen.nu'];

	for (const endpoint of endpoints) {
		try {
			const url = `${endpoint}/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;

			const response = await fetch(url, {
				headers: {
					'User-Agent': 'WayliApp/1.0 (your@email.com)',
					Accept: 'application/json'
				}
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`❌ Nominatim HTTP error ${response.status} from ${endpoint}: ${errorText}`);

				// If this is the first endpoint and it failed, try the next one
				if (endpoint === config.endpoint && endpoints.length > 1) {
					continue;
				}

				throw new Error(`Nominatim error: ${response.status} - ${errorText}`);
			}

			const data = await response.json();

			// Check if Nominatim returned an error
			if (data.error) {
				console.error(`❌ Nominatim API error from ${endpoint}: ${data.error}`);

				// If this is the first endpoint and it failed, try the next one
				if (endpoint === config.endpoint && endpoints.length > 1) {
					continue;
				}

				throw new Error(`Nominatim API error: ${data.error}`);
			}

			return data as NominatimResponse;
		} catch (error) {
			// If this is the first endpoint and it failed, try the next one
			if (endpoint === config.endpoint && endpoints.length > 1) {
				continue;
			}

			// If we've tried all endpoints or this is the last one, throw the error
			throw error;
		}
	}

	throw new Error('All Nominatim endpoints failed');
}

export async function forwardGeocode(query: string): Promise<NominatimSearchResponse | null> {
	// Rate limiting
	const now = Date.now();
	const wait = Math.max(0, lastRequestTime + MIN_INTERVAL - now);
	if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
	lastRequestTime = Date.now();

	// Validate query
	if (!query || typeof query !== 'string' || query.trim().length === 0) {
		throw new Error('Invalid address query');
	}

	// Try the configured endpoint first, then fallback to public Nominatim
	const endpoints = [config.endpoint, 'https://nominatim.int.hazen.nu'];

	for (const endpoint of endpoints) {
		try {
			const url = `${endpoint}/search?format=json&q=${encodeURIComponent(query.trim())}&limit=1&addressdetails=1`;

			const response = await fetch(url, {
				headers: {
					'User-Agent': 'WayliApp/1.0 (your@email.com)',
					Accept: 'application/json'
				}
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`❌ Nominatim HTTP error ${response.status} from ${endpoint}: ${errorText}`);

				// If this is the first endpoint and it failed, try the next one
				if (endpoint === config.endpoint && endpoints.length > 1) {
					continue;
				}

				throw new Error(`Nominatim error: ${response.status} - ${errorText}`);
			}

			const data = await response.json();

			// Check if Nominatim returned an error
			if (data.error) {
				console.error(`❌ Nominatim API error from ${endpoint}: ${data.error}`);

				// If this is the first endpoint and it failed, try the next one
				if (endpoint === config.endpoint && endpoints.length > 1) {
					continue;
				}

				throw new Error(`Nominatim API error: ${data.error}`);
			}

			// Return the first result if available
			if (Array.isArray(data) && data.length > 0) {
				return data[0] as NominatimSearchResponse;
			}

			return null;
		} catch (error) {
			// If this is the first endpoint and it failed, try the next one
			if (endpoint === config.endpoint && endpoints.length > 1) {
				continue;
			}

			// If we've tried all endpoints or this is the last one, throw the error
			throw error;
		}
	}

	throw new Error('All Nominatim endpoints failed');
}
