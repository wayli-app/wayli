// /Users/bart/Dev/wayli/fluxbase/jobs/_shared/services/transport-mode/geocode-features.ts
//
// Vendored, dependency-light copy of the geocode-parsing helpers used by the
// transport-mode detector. This mirrors web/src/lib/utils/transport-mode.ts
// (isAtTrainStation / isAtAirport / isOnHighwayOrMotorway / getVenueType) so the
// Deno job parses OSM tags identically to the browser. Kept self-contained (no
// imports from web/) because the job runtime cannot reach the web app source.
//
// If the web-side parsing logic changes, update this file to match.

import type { GeocodeGeoJSONFeature } from '../../utils/geojson-converter.ts';

function getOsmDataFromAddendum(
	reverseGeocode: GeocodeGeoJSONFeature | null | undefined
): Record<string, unknown> | null {
	if (!reverseGeocode?.properties?.addendum) return null;
	const addendum = reverseGeocode.properties.addendum as Record<string, unknown>;
	const osm = addendum.osm;
	if (!osm || typeof osm !== 'object') return null;
	return osm as Record<string, unknown>;
}

export function getVenueTypeFromAddendum(
	reverseGeocode: GeocodeGeoJSONFeature | null | undefined
): string | null {
	const osm = getOsmDataFromAddendum(reverseGeocode);
	if (!osm) return null;
	return (
		(osm.leisure as string) ||
		(osm.amenity as string) ||
		(osm.tourism as string) ||
		(osm.shop as string) ||
		(osm.sport as string) ||
		null
	);
}

export function isAtTrainStation(
	reverseGeocode: GeocodeGeoJSONFeature | null | undefined
): boolean {
	if (!reverseGeocode || !reverseGeocode.properties) return false;
	const props = reverseGeocode.properties;

	const category = props.category as string[] | undefined;
	if (category && Array.isArray(category)) {
		if (
			category.some(
				(c) =>
					c === 'transport:station' ||
					c === 'transport:rail' ||
					c.startsWith('transport:rail:')
			)
		) {
			return true;
		}
	}

	const osm = getOsmDataFromAddendum(reverseGeocode);
	if (osm) {
		const railway = osm.railway as string | undefined;
		const publicTransport = osm.public_transport as string | undefined;
		const building = osm.building as string | undefined;

		const railwayStationTypes = ['station', 'halt', 'platform', 'stop', 'subway_entrance', 'tram_stop'];
		if (railway && railwayStationTypes.includes(railway)) return true;

		const publicTransportTypes = ['station', 'platform', 'stop_position', 'stop_area'];
		if (publicTransport && publicTransportTypes.includes(publicTransport)) return true;

		if (building === 'train_station' || building === 'transportation') return true;
	}
	return false;
}

export function isAtAirport(reverseGeocode: GeocodeGeoJSONFeature | null | undefined): boolean {
	if (!reverseGeocode || !reverseGeocode.properties) return false;
	const props = reverseGeocode.properties;

	const category = props.category as string[] | undefined;
	if (category && Array.isArray(category)) {
		if (category.some((c) => c.startsWith('aviation:') || c === 'aviation:aerodrome')) {
			return true;
		}
	}

	const osm = getOsmDataFromAddendum(reverseGeocode);
	if (osm) {
		const aeroway = osm.aeroway as string | undefined;
		if (aeroway && ['aerodrome', 'helipad', 'terminal', 'gate', 'apron'].includes(aeroway)) {
			return true;
		}
		const building = osm.building as string | undefined;
		if (building === 'aerodrome' || aeroway) return true;
	}
	return false;
}

export function isOnHighwayOrMotorway(
	reverseGeocode: GeocodeGeoJSONFeature | null | undefined
): boolean {
	if (!reverseGeocode || !reverseGeocode.properties) return false;

	const osm = getOsmDataFromAddendum(reverseGeocode);
	if (osm) {
		const highway = osm.highway as string | undefined;
		if (highway && ['motorway', 'trunk', 'motorway_link', 'trunk_link'].includes(highway)) {
			return true;
		}
	}

	const category = reverseGeocode.properties.category as string[] | undefined;
	if (category && Array.isArray(category)) {
		if (category.some((c) => c.includes('motorway') || c.includes('highway:motorway'))) {
			return true;
		}
	}
	return false;
}
