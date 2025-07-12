import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { point, booleanPointInPolygon } from '@turf/turf';
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load and cache countries.geojson
let countriesGeoJSON: FeatureCollection<Polygon | MultiPolygon> | null = null;
function loadCountriesGeoJSON(): FeatureCollection<Polygon | MultiPolygon> {
	if (!countriesGeoJSON) {
		const filePath = path.resolve(__dirname, '../../data/countries.geojson');
		const data = fs.readFileSync(filePath, 'utf-8');
		const rawGeoJSON = JSON.parse(data) as FeatureCollection<Polygon | MultiPolygon>;
		// Normalize properties
		for (const feature of rawGeoJSON.features) {
			const props = feature.properties || {};
			props.ADMIN = props.ADMIN || props.name || null;
			props.NAME = props.NAME || props.name || null;
			props.ISO_A2 = props.ISO_A2 || props["ISO3166-1-Alpha-2"] || null;
			props.ISO_A3 = props.ISO_A3 || props["ISO3166-1-Alpha-3"] || null;
			feature.properties = props;
		}
		countriesGeoJSON = rawGeoJSON;
	}
	return countriesGeoJSON;
}

/**
 * Returns the country name or code for a given lat/lng, or null if not found.
 */
export function getCountryForPoint(lat: number, lng: number): string | null {
	const geojson = loadCountriesGeoJSON();
	const pt = point([lng, lat]);
	for (const feature of geojson.features) {
		if (booleanPointInPolygon(pt, feature as Feature<Polygon | MultiPolygon>)) {
			return feature.properties?.ISO_A2 || feature.properties?.ADMIN || feature.properties?.NAME || null;
		}
	}
	return null;
}

/**
 * Converts a country name to ISO 3166-1 alpha-2 code, or returns null if not found.
 */
export function getCountryCodeFromName(countryName: string): string | null {
	if (!countryName) return null;

	const geojson = loadCountriesGeoJSON();
	const normalizedName = countryName.toLowerCase().trim();

	for (const feature of geojson.features) {
		const props = feature.properties || {};
		const adminName = props.ADMIN?.toLowerCase();
		const name = props.NAME?.toLowerCase();
		const altName = props.ALTNAME?.toLowerCase();

		if (adminName === normalizedName ||
			name === normalizedName ||
			altName === normalizedName) {
			return props.ISO_A2 || null;
		}
	}

	return null;
}

/**
 * Ensures a country code is valid (2 characters max) and converts country names to codes if needed.
 */
export function normalizeCountryCode(countryCode: string | null): string | null {
	if (!countryCode) return null;

	// If it's already a 2-character code, return it
	if (countryCode.length === 2 && /^[A-Z]{2}$/.test(countryCode.toUpperCase())) {
		return countryCode.toUpperCase();
	}

	// If it's longer than 2 characters, try to convert it from a country name
	if (countryCode.length > 2) {
		return getCountryCodeFromName(countryCode);
	}

	// If it's 1 character or invalid format, return null
	return null;
}