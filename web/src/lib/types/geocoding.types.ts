/**
 * Types for reverse geocoded GPS coordinates from Nominatim
 */

export interface NominatimAddress {
  railway?: string;
  road?: string;
  suburb?: string;
  city?: string;
  municipality?: string;
  state?: string;
  'ISO3166-2-lvl4'?: string;
  country?: string;
  postcode?: string;
  country_code?: string;
  [key: string]: string | undefined;
}

export interface NominatimResponse {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  class: string;
  type: string;
  place_rank: number;
  importance: number;
  addresstype: string;
  name: string;
  display_name: string;
  address: NominatimAddress;
  boundingbox: [string, string, string, string];
}

export interface GeocodedLocation {
  display_name: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  address: NominatimAddress;
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  class?: string;
  type?: string;
  name?: string;
}

/**
 * Helper function to convert Nominatim response to our GeocodedLocation type
 */
export function fromNominatimResponse(response: Partial<NominatimResponse>): GeocodedLocation {
  return {
    display_name: response.display_name || '',
    coordinates: {
      lat: response.lat ? parseFloat(response.lat) : 0,
      lng: response.lon ? parseFloat(response.lon) : 0
    },
    address: response.address || {},
    place_id: response.place_id,
    osm_type: response.osm_type,
    osm_id: response.osm_id,
    class: response.class,
    type: response.type,
    name: response.name
  };
}

/**
 * Helper function to create a minimal GeocodedLocation from basic data
 */
export function createGeocodedLocation(
  displayName: string,
  lat: number,
  lng: number,
  address?: NominatimAddress
): GeocodedLocation {
  return {
    display_name: displayName,
    coordinates: { lat, lng },
    address: address || {}
  };
}