// /Users/bart/Dev/wayli/web/src/lib/services/transport-mode/types.ts
//
// Shared types for the HMM transport-mode detector. Kept dependency-free
// (no Svelte, no DOM) so the Deno background job and the browser import the
// exact same module.

import type { GeocodeGeoJSONFeature } from '../../utils/geojson-converter';
import type { TransportMode } from './states';

/**
 * A single observation used as input to the HMM. `geocode` is optional because
 * the Deno job reads it as a raw JSON blob; feature extraction tolerates null.
 *
 * Speed is in km/h (matching the tracker_data.speed column convention).
 * Heading is in degrees [0, 360). Accuracy is the GPS HDOP radius in meters.
 */
export interface ModeObservation {
	/** ISO timestamp or epoch ms — used only for gap segmentation + ordering. */
	timestamp: number;
	lat: number;
	lng: number;
	/** km/h. Computed server-side by trigger_calculate_distance for tracker_data. */
	speed: number;
	/** Degrees [0, 360). null when the device didn't report a heading. */
	heading: number | null;
	/** GPS accuracy radius in meters; lower is better. null when unknown. */
	accuracy: number | null;
	/** Pelias reverse-geocode result. Carries OSM railway/highway/aeroway tags. */
	geocode?: GeocodeGeoJSONFeature | null;
}

/**
 * Pre-computed features per observation. Emission probabilities are derived
 * from these so the HMM core stays pure math (no I/O, no geocode parsing).
 */
export interface ModeFeatures {
	speed: number; // km/h, clamped >= 0
	speedCV: number; // coefficient of variation over a rolling window
	headingTurnRate: number; // deg/s of bearing change (0 = straight, low for trains)
	atTrainStation: boolean;
	atAirport: boolean;
	onHighway: boolean;
	atVenue: boolean; // any POI venue (boosts stationary)
	accuracyWeight: number; // 0..1, down-weights noisy fixes in emission calc
}

export interface SegmentDetection {
	mode: TransportMode;
	reason: string;
	confidence: number; // 0..1
}

/** Result of decoding one gap-bounded segment. */
export interface SegmentResult {
	/** One mode per input observation, aligned by index. */
	modes: TransportMode[];
	/** Human-readable reason per observation, aligned by index. */
	reasons: string[];
	/** Viterbi posterior confidence per observation, aligned by index. */
	confidences: number[];
}

/**
 * Extracted transport-mode decision for a single point, ready to persist to
 * tracker_data.transport_mode / detection_reason / transport_mode_confidence.
 */
export interface PointModeDecision {
	timestamp: number;
	mode: TransportMode;
	reason: string;
	confidence: number;
}
