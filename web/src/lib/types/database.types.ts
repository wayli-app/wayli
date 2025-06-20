// Database types for Wayli with PostGIS support

export interface Profile {
	id: string;
	email: string;
	first_name?: string;
	last_name?: string;
	full_name?: string;
	role: 'user' | 'admin';
	avatar_url?: string;
	created_at: string;
	updated_at: string;
}

export interface Trip {
	id: string;
	user_id: string;
	title: string;
	description?: string;
	start_date?: string;
	end_date?: string;
	status: 'planned' | 'active' | 'completed' | 'cancelled';
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
	id: string;
	user_id: string;
	theme: 'light' | 'dark';
	language: string;
	notifications_enabled: boolean;
	created_at: string;
	updated_at: string;
}

export interface TrackerData {
	id: string;
	user_id: string;
	tracker_type: 'owntracks' | 'gpx' | 'fitbit' | 'strava' | 'other';
	device_id?: string;
	timestamp: string;
	location: string; // PostGIS POINT geometry as WKT string
	altitude?: number; // meters
	accuracy?: number; // meters
	speed?: number; // m/s
	heading?: number; // degrees (0-360)
	battery_level?: number; // percentage
	is_charging?: boolean;
	activity_type?: string; // 'walking', 'driving', 'cycling', etc.
	raw_data?: any; // JSONB field for original data
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

export type OwnTracksPayload = OwnTracksLocation | OwnTracksTransition | OwnTracksWaypoint | OwnTracksBeacon;

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

// Database table names
export const TABLES = {
	PROFILES: 'profiles',
	TRIPS: 'trips',
	LOCATIONS: 'locations',
	POINTS_OF_INTEREST: 'points_of_interest',
	USER_PREFERENCES: 'user_preferences',
	TRACKER_DATA: 'tracker_data'
} as const;

// PostGIS helper functions
export const PostGIS = {
	// Convert lat/lon to PostGIS POINT WKT
	pointFromLatLon: (latitude: number, longitude: number): string => {
		return `POINT(${longitude} ${latitude})`;
	},

	// Extract lat/lon from PostGIS POINT WKT
	latLonFromPoint: (point: string): Coordinates | null => {
		const match = point.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
		if (match) {
			return {
				longitude: parseFloat(match[1]),
				latitude: parseFloat(match[2])
			};
		}
		return null;
	},

	// Calculate distance between two points in meters
	distance: (point1: string, point2: string): number => {
		// This would be calculated using PostGIS ST_Distance in SQL
		// For client-side, you'd need a different approach
		return 0;
	}
};