// Database types for Wayli with PostGIS support

export interface Trip {
	id: string;
	user_id: string;
	title: string;
	description?: string;
	start_date?: string;
	end_date?: string;
	status: 'planned' | 'active' | 'completed' | 'cancelled' | 'approved' | 'rejected';
	image_url?: string; // Supabase Storage image URL for trip image
	labels?: string[]; // Array of string labels for trip categorization
	metadata?: {
		distance_traveled?: number; // Distance traveled in kilometers
		visited_places_count?: number; // Number of unique places visited
		[key: string]: unknown; // Allow additional metadata
	};
	created_at: string;
	updated_at: string;
}

export interface Location {
	id: string;
	user_id: string;
	trip_id?: string;
	name: string;
	description?: string;
	location: string; // PostGIS POINT geometry as WKT string
	address?: string;
	created_at: string;
	updated_at: string;
}

export interface PointOfInterest {
	id: string;
	user_id: string;
	name: string;
	description?: string;
	category?: string;
	location: string; // PostGIS POINT geometry as WKT string
	address?: string;
	rating?: number; // 1-5
	created_at: string;
	updated_at: string;
}

export interface UserPreferences {
	id: string; // References auth.users(id)
	theme: 'light' | 'dark';
	language: string;
	notifications_enabled: boolean;
	created_at: string;
	updated_at: string;
}

export interface TrackerData {
	// Composite primary key: (user_id, location, recorded_at)
	user_id: string;
	tracker_type: 'owntracks' | 'gpx' | 'fitbit' | 'strava' | 'other';
	device_id?: string;
	recorded_at: string;
	location: string; // PostGIS POINT geometry as WKT string
	altitude?: number; // meters
	accuracy?: number; // meters
	speed?: number; // m/s
	heading?: number; // degrees (0-360)
	battery_level?: number; // percentage
	is_charging?: boolean;
	activity_type?: string; // 'walking', 'driving', 'cycling', etc.
	raw_data?: unknown; // JSONB field for original data
	created_at: string;
	updated_at: string;
}

// OwnTracks specific types
export interface OwnTracksLocation {
	_type: 'location';
	lat: number;
	lon: number;
	tst: number; // timestamp
	acc?: number; // accuracy in meters
	alt?: number; // altitude in meters
	vel?: number; // velocity in m/s
	cog?: number; // course over ground (heading)
	batt?: number; // battery level
	bs?: number; // battery status (0=unknown, 1=charging, 2=not charging)
	vac?: number; // vertical accuracy
	t?: string; // trigger
	tid?: string; // tracker ID
	inregions?: string[]; // regions
}

export interface OwnTracksTransition {
	_type: 'transition';
	event: 'enter' | 'leave';
	desc: string; // region description
	tst: number; // timestamp
	lat?: number;
	lon?: number;
	acc?: number;
}

export interface OwnTracksWaypoint {
	_type: 'waypoint';
	lat: number;
	lon: number;
	desc: string;
	tst: number;
}

export interface OwnTracksBeacon {
	_type: 'beacon';
	lat: number;
	lon: number;
	desc: string;
	tst: number;
	uuid: string;
	major: number;
	minor: number;
	proximity: 'immediate' | 'near' | 'far' | 'unknown';
}

export type OwnTracksPayload =
	| OwnTracksLocation
	| OwnTracksTransition
	| OwnTracksWaypoint
	| OwnTracksBeacon;

// Helper types for coordinate handling
export interface Coordinates {
	latitude: number;
	longitude: number;
}

export interface LocationWithCoordinates extends Omit<Location, 'location'> {
	latitude: number;
	longitude: number;
}

export interface PointOfInterestWithCoordinates extends Omit<PointOfInterest, 'location'> {
	latitude: number;
	longitude: number;
}

export interface TrackerDataWithCoordinates extends Omit<TrackerData, 'location'> {
	latitude: number;
	longitude: number;
}

import type { GeocodedLocation } from './geocoding.types';

export interface TripExclusion {
	id: string;
	name: string; // User-friendly name for the exclusion
	value: string; // The actual value to exclude (city name, address, etc.)
	exclusion_type: 'city' | 'address' | 'region';
	location?: GeocodedLocation; // Reverse geocoded location data from Nominatim
	created_at: string;
	updated_at: string;
}

// Database table names
export const TABLES = {
	TRIPS: 'trips',
	LOCATIONS: 'locations',
	USER_PREFERENCES: 'user_preferences',
	TRACKER_DATA: 'tracker_data'
} as const;

// PostGIS helper functions
export const PostGIS = {
	// Convert lat/lon to PostGIS POINT WKT
	pointFromLatLon: (latitude: number, longitude: number): string => {
		return `POINT(${longitude} ${latitude})`;
	},

	// Extract lat/lon from PostGIS POINT WKT or GeoJSON
	latLonFromPoint: (point: unknown): Coordinates | null => {
		if (!point) return null;
		function hasCoordinates(obj: unknown): obj is { coordinates: [number, number] } {
			return (
				typeof obj === 'object' &&
				obj !== null &&
				'coordinates' in obj &&
				Array.isArray((obj as { coordinates: unknown }).coordinates)
			);
		}
		if (hasCoordinates(point)) {
			const coords = point.coordinates;
			return {
				longitude: coords[0],
				latitude: coords[1]
			};
		}
		if (typeof point !== 'string') {
			point = String(point);
		}
		const match = (point as string).match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
		if (match) {
			return {
				longitude: parseFloat(match[1]),
				latitude: parseFloat(match[2])
			};
		}
		return null;
	},

	// Calculate distance between two points in meters using Haversine formula
	distance: (point1: string, point2: string): number => {
		const coords1 = PostGIS.latLonFromPoint(point1);
		const coords2 = PostGIS.latLonFromPoint(point2);

		if (!coords1 || !coords2) {
			return 0;
		}

		return PostGIS.haversineDistance(coords1, coords2);
	},

	// Calculate distance between two coordinate pairs using Haversine formula
	haversineDistance: (coord1: Coordinates, coord2: Coordinates): number => {
		const R = 6371000; // Earth's radius in meters
		const dLat = PostGIS.toRadians(coord2.latitude - coord1.latitude);
		const dLon = PostGIS.toRadians(coord2.longitude - coord1.longitude);

		const a =
			Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos(PostGIS.toRadians(coord1.latitude)) *
				Math.cos(PostGIS.toRadians(coord2.latitude)) *
				Math.sin(dLon / 2) *
				Math.sin(dLon / 2);

		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return R * c; // Distance in meters
	},

	// Convert degrees to radians
	toRadians: (degrees: number): number => {
		return degrees * (Math.PI / 180);
	},

	// Calculate distance between two lat/lon coordinates directly
	distanceBetweenCoordinates: (lat1: number, lon1: number, lat2: number, lon2: number): number => {
		const coord1: Coordinates = { latitude: lat1, longitude: lon1 };
		const coord2: Coordinates = { latitude: lat2, longitude: lon2 };
		return PostGIS.haversineDistance(coord1, coord2);
	},

	// Format distance for display (meters to km if > 1000m)
	formatDistance: (distanceInMeters: number): string => {
		if (distanceInMeters < 1000) {
			return `${Math.round(distanceInMeters)} m`;
		} else {
			return `${(distanceInMeters / 1000).toFixed(2)} km`;
		}
	}
};
