// /Users/bart/Dev/wayli/fluxbase/jobs/_shared/services/transport-mode/types.ts
// Mirrors web/src/lib/services/transport-mode/types.ts. Update both together.

import type { GeocodeGeoJSONFeature } from '../../utils/geojson-converter.ts';
import type { TransportMode } from './states.ts';

export interface ModeObservation {
	timestamp: number;
	lat: number;
	lng: number;
	speed: number; // km/h
	heading: number | null; // degrees [0,360)
	accuracy: number | null; // meters
	geocode?: GeocodeGeoJSONFeature | null;
}

export interface ModeFeatures {
	speed: number;
	speedCV: number;
	headingTurnRate: number;
	atTrainStation: boolean;
	atAirport: boolean;
	onHighway: boolean;
	atVenue: boolean;
	accuracyWeight: number;
}

export interface PointModeDecision {
	timestamp: number;
	mode: TransportMode;
	reason: string;
	confidence: number;
}
