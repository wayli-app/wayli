// web/src/lib/utils/geojson-converter.ts

import type { Feature, Point } from 'geojson';
import type { NominatimResponse } from '../services/external/nominatim.service';

/**
 * GeoJSON Feature type for geocoded data
 */
export interface GeocodeGeoJSONFeature extends Feature<Point> {
	properties: {
		// Nominatim response fields
		display_name?: string;
		address?: Record<string, string>;
		place_id?: string;
		osm_type?: string;
		osm_id?: string;
		// Extracted location fields for direct access
		city?: string | null;
		country?: string | null;
		// Metadata fields
		geocoded_at: string;
		geocoding_provider: string;
		// Error fields (for failed geocoding)
		geocode_error?: string; // Store geocoding errors here
		geocoding_error?: string; // Legacy field for backward compatibility
		geocoding_status?: 'success' | 'failed';
		retryable?: boolean;
		permanent?: boolean;
		// Allow additional properties
		[key: string]: unknown;
	};
}

/**
 * Converts a Nominatim response to a proper GeoJSON Feature
 * This ensures consistent geocode data storage across the application
 */
export function convertNominatimToGeoJSON(
	lat: number,
	lon: number,
	nominatimResponse: NominatimResponse
): GeocodeGeoJSONFeature {
	// Extract city and country from address for direct access
	let extractedCity: string | null = null;
	let extractedCountry: string | null = null;

	if (nominatimResponse.address && typeof nominatimResponse.address === 'object') {
		const address = nominatimResponse.address as Record<string, string>;
		// Try different possible city fields
		extractedCity =
			address.city ||
			address.town ||
			address.village ||
			address.municipality ||
			address.suburb ||
			null;
		// Try different possible country fields
		extractedCountry = address.country || address.country_name || null;
	}

	return {
		type: 'Feature',
		geometry: {
			type: 'Point',
			coordinates: [lon, lat] // GeoJSON uses [longitude, latitude] order
		},
		properties: {
			// Include all Nominatim response data as properties
			...nominatimResponse,
			// Add extracted city and country directly to properties
			city: extractedCity,
			country: extractedCountry,
			// Add metadata for tracking
			geocoded_at: new Date().toISOString(),
			geocoding_provider: 'nominatim'
		}
	} as GeocodeGeoJSONFeature;
}

/**
 * Creates an error GeoJSON feature for failed geocoding attempts
 */
export function createGeocodeErrorGeoJSON(
	lat: number,
	lon: number,
	error: string
): GeocodeGeoJSONFeature {
	return {
		type: 'Feature',
		geometry: {
			type: 'Point',
			coordinates: [lon, lat]
		},
		properties: {
			geocode_error: error,
			geocoding_error: error, // Legacy field for backward compatibility
			geocoded_at: new Date().toISOString(),
			geocoding_provider: 'nominatim',
			geocoding_status: 'failed'
		}
	} as GeocodeGeoJSONFeature;
}

/**
 * Checks if a geocode object is in the new GeoJSON format
 */
export function isGeoJSONGeocode(geocode: unknown): geocode is GeocodeGeoJSONFeature {
	if (!geocode || typeof geocode !== 'object') {
		return false;
	}

	const geo = geocode as Record<string, unknown>;
	const geometry = geo.geometry as Record<string, unknown> | undefined;

	return (
		geo.type === 'Feature' &&
		!!geometry &&
		typeof geometry === 'object' &&
		geometry.type === 'Point' &&
		Array.isArray(geometry.coordinates)
	);
}

/**
 * Extracts the display name from a GeoJSON geocode feature
 */
export function getDisplayNameFromGeoJSON(geocode: unknown): string | null {
	if (!isGeoJSONGeocode(geocode)) {
		return null;
	}

	return geocode.properties.display_name || null;
}

/**
 * Extracts the address object from a GeoJSON geocode feature
 */
export function getAddressFromGeoJSON(geocode: unknown): Record<string, string> | null {
	if (!isGeoJSONGeocode(geocode)) {
		return null;
	}

	return geocode.properties.address || null;
}

/**
 * Merges new geocoding data with existing geocode properties
 * This prevents overwriting existing import data when adding geocoding information
 */
export function mergeGeocodingWithExisting(
	existingGeocode: unknown,
	lat: number,
	lon: number,
	nominatimResponse: NominatimResponse
): GeocodeGeoJSONFeature {
	// Start with the new geocoding data
	const newGeocodeGeoJSON = convertNominatimToGeoJSON(lat, lon, nominatimResponse);

	// Extract city and country from address for direct access
	let extractedCity: string | null = null;
	let extractedCountry: string | null = null;

	if (nominatimResponse.address && typeof nominatimResponse.address === 'object') {
		const address = nominatimResponse.address as Record<string, string>;
		// Try different possible city fields
		extractedCity =
			address.city ||
			address.town ||
			address.village ||
			address.municipality ||
			address.suburb ||
			null;
		// Try different possible country fields
		extractedCountry = address.country || address.country_name || null;
	}

	// If there's no existing geocode data, return the new data with extracted fields
	if (!existingGeocode || typeof existingGeocode !== 'object') {
		const properties = {
			...newGeocodeGeoJSON.properties,
			// Add extracted city and country directly to properties
			city: extractedCity,
			country: extractedCountry
		};

		return {
			...newGeocodeGeoJSON,
			properties
		} as GeocodeGeoJSONFeature;
	}

	const existing = existingGeocode as Record<string, unknown>;

	// If existing data is not a GeoJSON Feature, return the new data with extracted fields
	if (existing.type !== 'Feature' || !existing.properties) {
		const properties = {
			...newGeocodeGeoJSON.properties,
			// Add extracted city and country directly to properties
			city: extractedCity,
			country: extractedCountry
		};

		return {
			...newGeocodeGeoJSON,
			properties
		} as GeocodeGeoJSONFeature;
	}

	const existingProperties = existing.properties as Record<string, unknown>;

	// Merge properties: existing properties take precedence, but add new geocoding data
	const mergedProperties = {
		// Start with existing properties (from import)
		...existingProperties,
		// Add/update geocoding-specific properties
		...newGeocodeGeoJSON.properties,
		// Add extracted city and country directly to properties
		city: extractedCity,
		country: extractedCountry,
		// Ensure we keep the original import metadata
		imported_at: existingProperties.imported_at,
		import_source: existingProperties.import_source,
		// Add geocoding metadata
		geocoded_at: newGeocodeGeoJSON.properties.geocoded_at,
		geocoding_provider: newGeocodeGeoJSON.properties.geocoding_provider
	};

	return {
		type: 'Feature',
		geometry: {
			type: 'Point',
			coordinates: [lon, lat]
		},
		properties: mergedProperties
	} as GeocodeGeoJSONFeature;
}
