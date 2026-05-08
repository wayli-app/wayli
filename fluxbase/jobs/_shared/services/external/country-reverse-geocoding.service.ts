// Timezone reverse geocoding service for Deno runtime
// Uses custom point-in-polygon algorithm (no @turf dependency)

import type { FeatureCollection, Feature, Polygon, MultiPolygon, Position } from 'geojson';
import timezonesRaw from '../../data/timezones.geojson';

// ============================================================================
// Custom Point-in-Polygon Algorithm (Ray Casting)
// ============================================================================

function pointInRing(lng: number, lat: number, ring: Position[]): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const xi = ring[i][0], yi = ring[i][1];
		const xj = ring[j][0], yj = ring[j][1];

		const intersect = ((yi > lat) !== (yj > lat)) &&
			(lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);

		if (intersect) inside = !inside;
	}
	return inside;
}

function pointInPolygon(lng: number, lat: number, coordinates: Position[][]): boolean {
	if (!pointInRing(lng, lat, coordinates[0])) {
		return false;
	}
	for (let i = 1; i < coordinates.length; i++) {
		if (pointInRing(lng, lat, coordinates[i])) {
			return false;
		}
	}
	return true;
}

function pointInMultiPolygon(lng: number, lat: number, coordinates: Position[][][]): boolean {
	for (const polygon of coordinates) {
		if (pointInPolygon(lng, lat, polygon)) {
			return true;
		}
	}
	return false;
}

function pointInFeature(lng: number, lat: number, feature: Feature<Polygon | MultiPolygon>): boolean {
	const geometry = feature.geometry;
	if (geometry.type === 'Polygon') {
		return pointInPolygon(lng, lat, geometry.coordinates);
	} else if (geometry.type === 'MultiPolygon') {
		return pointInMultiPolygon(lng, lat, geometry.coordinates);
	}
	return false;
}

// ============================================================================
// GeoJSON Data Initialization
// ============================================================================

const timezonesGeoJSON = timezonesRaw as FeatureCollection<Polygon | MultiPolygon>;

// ============================================================================
// Public API
// ============================================================================

export function getTimezoneForPoint(lat: number, lng: number): string | null {
	if (timezonesGeoJSON.features.length === 0) return null;

	for (const feature of timezonesGeoJSON.features) {
		if (pointInFeature(lng, lat, feature)) {
			return feature.properties?.name || null;
		}
	}

	return null;
}

export function getTimezoneDifferenceForPoint(lat: number, lng: number): number | null {
	const timezoneOffset = getTimezoneForPoint(lat, lng);
	if (timezoneOffset) {
		const offsetHours = parseFloat(timezoneOffset);
		if (!isNaN(offsetHours)) {
			return offsetHours;
		}
	}
	return null;
}

export function applyTimezoneCorrection(
	timestamp: Date | number | string,
	timezoneOffset: string
): Date {
	const date = new Date(timestamp);

	const offsetHours = parseFloat(timezoneOffset);
	if (isNaN(offsetHours)) {
		console.log(
			`[TIMEZONE] Invalid timezone offset: ${timezoneOffset}, returning original timestamp`
		);
		return date;
	}

	return date;
}

export function applyTimezoneCorrectionToTimestamp(
	timestamp: Date | number | string,
	latitude: number,
	longitude: number
): string {
	return new Date(timestamp).toISOString();
}
