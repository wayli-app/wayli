import { TransportDetectionReason } from '../types/transport-mode.types';

import { SPEED_BRACKETS } from './transport-mode.config';
// Haversine distance in meters
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const toRad = (x: number) => (x * Math.PI) / 180;
	const R = 6371e3;
	const φ1 = toRad(lat1),
		φ2 = toRad(lat2);
	const Δφ = toRad(lat2 - lat1),
		Δλ = toRad(lng2 - lng1);
	const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

// Speed brackets for transport modes (km/h)
export const MIN_STOP_DURATION = 300; // 5 minutes

// Context object to track transport mode state
export interface EnhancedModeContext {
	currentMode: string;
	lastSpeed: number;
	trainStations: Array<{
		timestamp: number;
		name: string;
		coordinates: { lat: number; lng: number };
	}>;
	lastTrainStation?: {
		timestamp: number;
		name: string;
		coordinates: { lat: number; lng: number };
	};
	averageSpeed: number;
	speedHistory: number[];
	isInTrainJourney: boolean;
	trainJourneyStartTime?: number;
	trainJourneyStartStation?: string;
}

// Get speed bracket for a given speed
export function getSpeedBracket(speedKmh: number): string {
	for (const bracket of SPEED_BRACKETS) {
		if (speedKmh >= bracket.min && speedKmh < bracket.max) {
			return bracket.mode;
		}
	}
	return 'unknown';
}

// Check if a point is at a train station
export function isAtTrainStation(reverseGeocode: unknown): boolean {
	if (!reverseGeocode) return false;

	try {
		const geocode =
			typeof reverseGeocode === 'string' ? JSON.parse(reverseGeocode) : reverseGeocode;
		// Check top-level and address fields for class/type
		const hasRailwayClass =
			geocode.class === 'railway' || (geocode.address && geocode.address.class === 'railway');
		const hasPlatformType =
			geocode.type === 'platform' || (geocode.address && geocode.address.type === 'platform');
		return !!(
			(geocode && geocode.type === 'railway_station') ||
			(geocode && geocode.class === 'railway') ||
			(geocode && geocode.type === 'platform') ||
			(geocode && geocode.addresstype === 'railway') ||
			hasRailwayClass ||
			hasPlatformType
		);
	} catch {
		return false;
	}
}

// Get train station name from reverse geocode
export function getTrainStationName(reverseGeocode: unknown): string | null {
	if (!reverseGeocode) return null;

	try {
		const geocode =
			typeof reverseGeocode === 'string' ? JSON.parse(reverseGeocode) : reverseGeocode;
		if (geocode && geocode.address) {
			const city = geocode.address.city || '';
			const name = geocode.address.name || '';
			return city && name ? `${city} - ${name}` : name || city || null;
		}
	} catch {
		// Ignore parsing errors
	}
	return null;
}

// Check if mode switch is possible
export function isModeSwitchPossible(
	fromMode: string,
	toMode: string,
	atTrainStation: boolean
): boolean {
	// Same mode is always allowed (not a switch)
	if (fromMode === toMode) return true;
	// Impossible switches
	if (fromMode === 'car' && toMode === 'train' && !atTrainStation) return false;
	if (fromMode === 'train' && toMode === 'car' && !atTrainStation) return false;
	if (fromMode === 'cycling' && toMode === 'train') return false; // Can't switch from cycling to train
	if (fromMode === 'train' && toMode === 'cycling') return false; // Can't switch from train to cycling

	// Stationary can switch to anything
	if (fromMode === 'stationary') return true;

	// Walking can switch to anything
	if (fromMode === 'walking') return true;

	// Cycling can switch to anything except train
	if (fromMode === 'cycling') {
		return toMode !== 'train';
	}

	// Car can only switch to train at station, or to walking/cycling/stationary
	if (fromMode === 'car') {
		return ['walking', 'cycling', 'stationary', ...(atTrainStation ? ['train'] : [])].includes(
			toMode
		);
	}

	// Train can only switch to car at station, or to walking/stationary
	if (fromMode === 'train') {
		return ['walking', 'stationary', ...(atTrainStation ? ['car'] : [])].includes(toMode);
	}

	// Airplane can switch to anything (landing)
	if (fromMode === 'airplane') return true;

	return true;
}

// Enhanced transport mode detection with all constraints
export function detectEnhancedMode(
	prevLat: number,
	prevLng: number,
	currLat: number,
	currLng: number,
	dt: number, // seconds
	reverseGeocode: unknown,
	context: EnhancedModeContext,
	speedMps?: number
): { mode: string; reason: string } {
	const speedKmh =
		typeof speedMps === 'number'
			? speedMps * 3.6
			: dt > 0
				? (haversine(prevLat, prevLng, currLat, currLng) / dt) * 3.6
				: 0;
	// Note: previous speed is derived from context.lastSpeed when needed in callers

	// Update context (defer lastSpeed assignment until after logic that needs previous)
	context.speedHistory.push(speedKmh);
	while (context.speedHistory.length > 10) {
		context.speedHistory.shift();
	}

	// Calculate average speed
	context.averageSpeed =
		context.speedHistory.reduce((a, b) => a + b, 0) / context.speedHistory.length;

	// Check if at train station
	const atTrainStation = isAtTrainStation(reverseGeocode);
	const stationName = atTrainStation ? getTrainStationName(reverseGeocode) : null;

	// Record train station visit
	if (atTrainStation && stationName) {
		const stationInfo = {
			timestamp: Date.now(),
			name: stationName,
			coordinates: { lat: currLat, lng: currLng }
		};
		context.trainStations.push(stationInfo);
		context.lastTrainStation = stationInfo;
	}

	// Get speed bracket for current speed
	let speedBracket = getSpeedBracket(speedKmh);

	// --- Fallback: Always assign a mode based on speed if no context is available ---
	if (
		(speedBracket === 'unknown' || !speedBracket) &&
		typeof speedKmh === 'number' &&
		speedKmh >= 0
	) {
		speedBracket = 'car';
	}

	// Special handling for train detection
	let detectedMode = speedBracket;
	let reason = TransportDetectionReason.DEFAULT;

	// Proactively start a train journey when at a station and moving at >= 30 km/h
	if (!context.isInTrainJourney && atTrainStation && speedKmh >= 15) {
		context.isInTrainJourney = true;
		context.trainJourneyStartTime = Date.now();
		context.trainJourneyStartStation = stationName || 'Unknown';
		detectedMode = 'train';
		reason = TransportDetectionReason.TRAIN_STATION_AND_SPEED;
	}

	if (speedBracket === 'train' || (context.isInTrainJourney && speedKmh >= 15)) {
		if (!context.isInTrainJourney && atTrainStation) {
			context.isInTrainJourney = true;
			context.trainJourneyStartTime = Date.now();
			context.trainJourneyStartStation = stationName || 'Unknown';
			detectedMode = 'train';
			reason = TransportDetectionReason.TRAIN_STATION_AND_SPEED;
		} else if (context.isInTrainJourney) {
			detectedMode = 'train';
			reason = TransportDetectionReason.TRAIN_SPEED_ONLY;
			if (atTrainStation && context.trainJourneyStartStation !== stationName) {
				context.isInTrainJourney = false;
				context.trainJourneyStartTime = undefined;
				context.trainJourneyStartStation = undefined;
				reason = TransportDetectionReason.TRAIN_STATION_AND_SPEED;
			}
		} else if (
			context.lastTrainStation &&
			Date.now() - context.lastTrainStation.timestamp < 3600000 &&
			speedKmh >= 25
		) {
			context.isInTrainJourney = true;
			context.trainJourneyStartTime = context.lastTrainStation.timestamp;
			context.trainJourneyStartStation = context.lastTrainStation.name;
			detectedMode = 'train';
			reason = TransportDetectionReason.TRAIN_STATION_AND_SPEED;
		}
	}

	if (context.isInTrainJourney && speedKmh < 20) {
		context.isInTrainJourney = false;
		context.trainJourneyStartTime = undefined;
		context.trainJourneyStartStation = undefined;
		detectedMode = speedBracket;
		reason = TransportDetectionReason.MIN_DURATION_NOT_MET;
	}

	// --- CONTINUITY LOGIC ---
	if (
		context.currentMode &&
		context.currentMode !== 'stationary' &&
		context.currentMode !== 'unknown' &&
		dt < MIN_STOP_DURATION
	) {
		// Prevent direct car->plane switch
		if (context.currentMode === 'car' && detectedMode === 'airplane') {
			detectedMode = 'car';
			reason = TransportDetectionReason.KEEP_CONTINUITY;
		} else if (detectedMode !== 'airplane') {
			if (isModeSwitchPossible(context.currentMode, detectedMode, atTrainStation)) {
				detectedMode = context.currentMode;
				reason = TransportDetectionReason.KEEP_CONTINUITY;
			}
		}
	}

	context.currentMode = detectedMode;
	context.lastSpeed = speedKmh;

	return { mode: detectedMode, reason };
}

// Legacy functions for backward compatibility

// Legacy detectMode removed; use detectEnhancedMode instead
