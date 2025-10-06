/**
 * Speed pattern analysis utilities for transport mode detection
 * Used to distinguish between transport modes when geographic context is unavailable
 */

export interface SpeedPatternMetrics {
	mean: number;
	stdDev: number;
	coefficientOfVariation: number;
	min: number;
	max: number;
	range: number;
}

/**
 * Calculate speed variance metrics
 * Useful for distinguishing train (low variance) from car (high variance)
 */
export function calculateSpeedVariance(speeds: number[]): SpeedPatternMetrics {
	if (speeds.length === 0) {
		return { mean: 0, stdDev: 0, coefficientOfVariation: 0, min: 0, max: 0, range: 0 };
	}

	const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
	const variance = speeds.reduce((sum, speed) => sum + Math.pow(speed - mean, 2), 0) / speeds.length;
	const stdDev = Math.sqrt(variance);
	const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;

	const min = Math.min(...speeds);
	const max = Math.max(...speeds);
	const range = max - min;

	return {
		mean,
		stdDev,
		coefficientOfVariation,
		min,
		max,
		range
	};
}

/**
 * Determine if speed pattern indicates train travel
 * Trains have very consistent speeds (low variance)
 */
export function hasTrainLikeSpeedPattern(speeds: number[]): boolean {
	if (speeds.length < 5) return false; // Need enough data

	const metrics = calculateSpeedVariance(speeds);

	// Trains typically have CV < 0.15 (very consistent)
	// Cars on highway have CV > 0.3 (variable due to traffic)
	return metrics.coefficientOfVariation < 0.15 && metrics.mean >= 80;
}

/**
 * Determine if speed pattern indicates car travel
 * Cars have higher variance due to traffic, lights, turns
 */
export function hasCarLikeSpeedPattern(speeds: number[]): boolean {
	if (speeds.length < 5) return false;

	const metrics = calculateSpeedVariance(speeds);

	// Cars have higher variance due to traffic, lights, turns
	return metrics.coefficientOfVariation > 0.25;
}

/**
 * Check if speed has been sustained for a minimum duration
 * Trains can maintain steady high speed for extended periods
 */
export function hasSustainedSpeed(
	modeHistory: Array<{ speed: number; timestamp: number }>,
	minSpeed: number,
	minDurationMs: number
): boolean {
	if (modeHistory.length < 2) return false;

	const now = Date.now();
	const cutoff = now - minDurationMs;

	const recentEntries = modeHistory.filter(m => m.timestamp >= cutoff);

	if (recentEntries.length === 0) return false;

	// Check if all recent entries meet minimum speed
	return recentEntries.every(m => m.speed >= minSpeed);
}

/**
 * Calculate bearing (heading) between two points in degrees (0-360)
 */
export function calculateBearing(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number
): number {
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const toDeg = (rad: number) => (rad * 180) / Math.PI;

	const φ1 = toRad(lat1);
	const φ2 = toRad(lat2);
	const Δλ = toRad(lng2 - lng1);

	const y = Math.sin(Δλ) * Math.cos(φ2);
	const x = Math.cos(φ1) * Math.sin(φ2) -
			  Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

	const θ = Math.atan2(y, x);
	const bearing = (toDeg(θ) + 360) % 360; // Normalize to 0-360

	return bearing;
}

/**
 * Calculate bearing variance for a series of points
 * Uses circular statistics since bearings wrap around at 360°
 */
export function calculateBearingVariance(
	points: Array<{ lat: number; lng: number }>
): number {
	if (points.length < 3) return 0;

	const bearings: number[] = [];

	for (let i = 1; i < points.length; i++) {
		const bearing = calculateBearing(
			points[i - 1].lat,
			points[i - 1].lng,
			points[i].lat,
			points[i].lng
		);
		bearings.push(bearing);
	}

	// Calculate circular variance (bearings wrap around at 360°)
	const radians = bearings.map(b => (b * Math.PI) / 180);
	const sinSum = radians.reduce((sum, r) => sum + Math.sin(r), 0);
	const cosSum = radians.reduce((sum, r) => sum + Math.cos(r), 0);

	const meanSin = sinSum / radians.length;
	const meanCos = cosSum / radians.length;
	const R = Math.sqrt(meanSin * meanSin + meanCos * meanCos);

	// Circular standard deviation in degrees
	const circularStdDev = Math.sqrt(-2 * Math.log(R)) * (180 / Math.PI);

	return circularStdDev;
}

/**
 * Check if trajectory is straight (train-like)
 * Trains run on tracks with very low bearing variance
 */
export function hasStraightTrajectory(
	points: Array<{ lat: number; lng: number }>
): boolean {
	if (points.length < 5) return false;

	const bearingVariance = calculateBearingVariance(points);

	// Trains: Very low bearing variance (< 5° typical for straight tracks)
	// Cars: Higher variance due to turns, lane changes (> 15°)
	return bearingVariance < 10;
}

/**
 * Check if trajectory has frequent turns (car-like)
 * Cars navigate roads with curves and turns
 */
export function hasFrequentTurns(
	points: Array<{ lat: number; lng: number }>
): boolean {
	if (points.length < 5) return false;

	const bearingVariance = calculateBearingVariance(points);

	return bearingVariance > 20;
}

/**
 * Physical constraints per transport mode
 */
export const PHYSICAL_CONSTRAINTS = {
	walking: {
		maxSpeed: 8,          // km/h
		maxAccel: 0.5,        // m/s²
		maxDecel: -1.0        // m/s²
	},
	cycling: {
		maxSpeed: 35,
		maxAccel: 1.0,
		maxDecel: -2.5
	},
	car: {
		maxSpeed: 180,        // Realistic highway max
		maxAccel: 4.0,
		maxDecel: -8.0
	},
	train: {
		maxSpeed: 320,        // High-speed rail
		maxAccel: 1.5,
		maxDecel: -2.0
	},
	airplane: {
		maxSpeed: 1000,
		maxAccel: 3.0,
		maxDecel: -5.0
	},
	stationary: {
		maxSpeed: 3,          // GPS drift
		maxAccel: 0.1,
		maxDecel: -0.1
	}
};

/**
 * Check if speed is physically possible for a mode
 */
export function isPhysicallyPossible(
	mode: string,
	speed: number
): boolean {
	const constraints = PHYSICAL_CONSTRAINTS[mode as keyof typeof PHYSICAL_CONSTRAINTS];
	if (!constraints) return true;

	// Check speed
	return speed <= constraints.maxSpeed;
}

/**
 * Filter out physically impossible modes
 */
export function filterPhysicallyPossibleModes(
	speed: number,
	candidateModes: string[]
): string[] {
	return candidateModes.filter(mode =>
		isPhysicallyPossible(mode, speed)
	);
}

/**
 * GPS sampling frequency analysis
 */
export interface GPSFrequencyAnalysis {
	averageInterval: number;        // milliseconds
	intervalVariance: number;       // coefficient of variation of intervals
	frequencyType: 'active_navigation' | 'background_tracking' | 'mixed';
	likelyMode: 'car' | 'train' | 'unknown';

	// Confidence modifiers for each transport mode (-0.3 to +0.3)
	confidenceModifiers: {
		car: number;
		train: number;
		walking: number;
		cycling: number;
		airplane: number;
		stationary: number;
	};
}

/**
 * Analyze GPS sampling frequency to infer likely mode
 * High frequency (< 10s) typically indicates active car navigation
 * Low frequency (> 30s) typically indicates background tracking (train, walking)
 *
 * Enhanced with confidence modifiers that can boost or reduce confidence for each mode
 */
export function analyzeGPSFrequency(
	modeHistory: Array<{ timestamp: number }>
): GPSFrequencyAnalysis {
	const defaultModifiers = {
		car: 0,
		train: 0,
		walking: 0,
		cycling: 0,
		airplane: 0,
		stationary: 0
	};

	if (modeHistory.length < 3) {
		return {
			averageInterval: 0,
			intervalVariance: 0,
			frequencyType: 'mixed',
			likelyMode: 'unknown',
			confidenceModifiers: defaultModifiers
		};
	}

	const intervals: number[] = [];
	for (let i = 1; i < modeHistory.length; i++) {
		intervals.push(modeHistory[i].timestamp - modeHistory[i - 1].timestamp);
	}

	const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

	// Calculate interval variance (consistency of sampling)
	const intervalMean = avgInterval;
	const intervalVariance = intervals.length > 1
		? Math.sqrt(intervals.reduce((sum, val) => sum + Math.pow(val - intervalMean, 2), 0) / intervals.length) / intervalMean
		: 0;

	let frequencyType: GPSFrequencyAnalysis['frequencyType'];
	let likelyMode: GPSFrequencyAnalysis['likelyMode'];
	let confidenceModifiers = { ...defaultModifiers };

	// Active navigation: < 10 seconds average interval
	if (avgInterval < 10000) {
		frequencyType = 'active_navigation';
		likelyMode = 'car';

		// Strong signal: active navigation is almost always car
		confidenceModifiers.car = 0.20;      // +20% for car
		confidenceModifiers.train = -0.15;    // -15% for train
		confidenceModifiers.walking = -0.10;  // -10% for walking
		confidenceModifiers.cycling = -0.05;  // -5% for cycling
	}
	// Very low frequency: > 60 seconds (strong background tracking)
	else if (avgInterval > 60000) {
		frequencyType = 'background_tracking';
		likelyMode = 'unknown';

		// Strong signal: background tracking, likely train or walking
		confidenceModifiers.car = -0.30;      // -30% for car (very unlikely active nav)
		confidenceModifiers.train = 0.15;     // +15% for train
		confidenceModifiers.walking = 0.10;   // +10% for walking
		confidenceModifiers.cycling = 0.05;   // +5% for cycling
		confidenceModifiers.airplane = 0.05;  // +5% for airplane
	}
	// Medium-low frequency: 30-60 seconds
	else if (avgInterval > 30000) {
		frequencyType = 'background_tracking';
		likelyMode = 'unknown';

		// Moderate signal: background tracking
		confidenceModifiers.car = -0.20;      // -20% for car
		confidenceModifiers.train = 0.10;     // +10% for train
		confidenceModifiers.walking = 0.05;   // +5% for walking
	}
	// Medium frequency: 10-30 seconds (ambiguous)
	else {
		frequencyType = 'mixed';
		likelyMode = 'unknown';

		// Neutral - could be either active or background
		// No significant modifiers
	}

	return {
		averageInterval: avgInterval,
		intervalVariance,
		frequencyType,
		likelyMode,
		confidenceModifiers
	};
}

/**
 * Stop pattern analysis for distinguishing transport modes
 */
export interface StopPatternAnalysis {
	stopCount: number;
	stopsPerKm: number;
	avgStopDuration: number;          // seconds
	stopDurationVariance: number;     // coefficient of variation
	longestMovementDuration: number;  // seconds

	pattern: 'train-like' | 'car-city' | 'car-highway' | 'walking' | 'unknown';
	confidence: number;
	likelyMode: 'train' | 'car' | 'walking' | 'unknown';
}

/**
 * Speed transition smoothness analysis
 */
export interface SpeedTransitionAnalysis {
	averageChange: number;      // km/h
	maxChange: number;          // km/h
	smoothness: 'smooth' | 'moderate' | 'erratic';
	likelyMode: 'train' | 'car' | 'unknown';
}

/**
 * Analyze how smoothly speed transitions between points
 * Trains: Small, gradual changes (smooth)
 * Cars: Larger, more variable changes (erratic)
 */
export function analyzeSpeedTransitions(
	speedHistory: number[]
): SpeedTransitionAnalysis {
	if (speedHistory.length < 3) {
		return {
			averageChange: 0,
			maxChange: 0,
			smoothness: 'moderate',
			likelyMode: 'unknown'
		};
	}

	const changes: number[] = [];
	for (let i = 1; i < speedHistory.length; i++) {
		changes.push(Math.abs(speedHistory[i] - speedHistory[i - 1]));
	}

	const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
	const maxChange = Math.max(...changes);

	let smoothness: SpeedTransitionAnalysis['smoothness'];
	let likelyMode: SpeedTransitionAnalysis['likelyMode'];

	if (avgChange < 10 && maxChange < 20) {
		// Small average and max changes = smooth (train-like)
		smoothness = 'smooth';
		likelyMode = 'train';
	} else if (avgChange > 20 || maxChange > 40) {
		// Large changes = erratic (car-like)
		smoothness = 'erratic';
		likelyMode = 'car';
	} else {
		smoothness = 'moderate';
		likelyMode = 'unknown';
	}

	return {
		averageChange: avgChange,
		maxChange,
		smoothness,
		likelyMode
	};
}

/**
 * Analyze stop patterns to distinguish between transport modes
 * Trains: Few stops, long duration, regular intervals
 * Cars (city): Many stops, irregular (traffic lights)
 * Cars (highway): Few stops, short duration
 * Walking: Many stops, variable duration
 */
export function analyzeStopPattern(
	pointHistory: Array<{ timestamp: number; speed?: number; lat: number; lng: number }>
): StopPatternAnalysis {
	if (pointHistory.length < 5) {
		return {
			stopCount: 0,
			stopsPerKm: 0,
			avgStopDuration: 0,
			stopDurationVariance: 0,
			longestMovementDuration: 0,
			pattern: 'unknown',
			confidence: 0,
			likelyMode: 'unknown'
		};
	}

	// Extract speeds from point history
	const speeds = pointHistory
		.map(p => p.speed !== undefined ? p.speed : 0)
		.filter(s => s !== null);

	if (speeds.length === 0) {
		return {
			stopCount: 0,
			stopsPerKm: 0,
			avgStopDuration: 0,
			stopDurationVariance: 0,
			longestMovementDuration: 0,
			pattern: 'unknown',
			confidence: 0,
			likelyMode: 'unknown'
		};
	}

	// Define a stop: speed < 5 km/h for > 20 seconds
	const STOP_SPEED_THRESHOLD = 5; // km/h
	const MIN_STOP_DURATION = 20; // seconds

	interface Stop {
		startIdx: number;
		endIdx: number;
		duration: number; // seconds
	}

	const stops: Stop[] = [];
	let inStop = false;
	let stopStart = 0;

	for (let i = 0; i < speeds.length; i++) {
		const speed = speeds[i];

		if (speed < STOP_SPEED_THRESHOLD && !inStop) {
			// Entering a stop
			inStop = true;
			stopStart = i;
		} else if (speed >= STOP_SPEED_THRESHOLD && inStop) {
			// Exiting a stop
			const duration = (pointHistory[i].timestamp - pointHistory[stopStart].timestamp) / 1000; // seconds
			if (duration >= MIN_STOP_DURATION) {
				stops.push({ startIdx: stopStart, endIdx: i, duration });
			}
			inStop = false;
		}
	}

	// Handle stop at the end of the journey
	if (inStop && stops.length > 0) {
		const duration = (pointHistory[speeds.length - 1].timestamp - pointHistory[stopStart].timestamp) / 1000;
		if (duration >= MIN_STOP_DURATION) {
			stops.push({ startIdx: stopStart, endIdx: speeds.length - 1, duration });
		}
	}

	// Calculate total distance traveled
	let totalDistance = 0; // meters
	for (let i = 1; i < pointHistory.length; i++) {
		const prev = pointHistory[i - 1];
		const curr = pointHistory[i];
		totalDistance += haversine(prev.lat, prev.lng, curr.lat, curr.lng);
	}

	const totalDistanceKm = totalDistance / 1000;

	// Calculate metrics
	const stopCount = stops.length;
	const stopsPerKm = totalDistanceKm > 0 ? stopCount / totalDistanceKm : 0;
	const avgDuration = stops.length > 0
		? stops.reduce((sum, s) => sum + s.duration, 0) / stops.length
		: 0;

	// Calculate duration variance (coefficient of variation)
	const durations = stops.map(s => s.duration);
	const durationCV = durations.length > 1
		? (Math.sqrt(durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length) / avgDuration)
		: 0;

	// Calculate longest movement duration (time without stopping)
	let longestMovement = 0;
	let currentMovementStart = pointHistory[0].timestamp;

	for (const stop of stops) {
		const movementDuration = (pointHistory[stop.startIdx].timestamp - currentMovementStart) / 1000;
		if (movementDuration > longestMovement) {
			longestMovement = movementDuration;
		}
		currentMovementStart = pointHistory[stop.endIdx].timestamp;
	}

	// Check final movement segment
	if (stops.length > 0) {
		const lastStop = stops[stops.length - 1];
		const finalMovement = (pointHistory[pointHistory.length - 1].timestamp - pointHistory[lastStop.endIdx].timestamp) / 1000;
		if (finalMovement > longestMovement) {
			longestMovement = finalMovement;
		}
	} else {
		// No stops - entire journey is one movement
		longestMovement = (pointHistory[pointHistory.length - 1].timestamp - pointHistory[0].timestamp) / 1000;
	}

	// Determine pattern and confidence
	let pattern: StopPatternAnalysis['pattern'] = 'unknown';
	let confidence = 0;
	let likelyMode: StopPatternAnalysis['likelyMode'] = 'unknown';

	// Train pattern: Few stops (<0.5 per km), long duration (60-300s), regular (low variance)
	if (stopsPerKm < 0.5 && avgDuration > 60 && avgDuration < 300 && durationCV < 0.4) {
		pattern = 'train-like';
		confidence = 0.80;
		likelyMode = 'train';
	}
	// Car city pattern: Many stops (>3 per km), irregular (high variance)
	else if (stopsPerKm > 3 && durationCV > 0.5) {
		pattern = 'car-city';
		confidence = 0.85;
		likelyMode = 'car';
	}
	// Car highway pattern: Few stops (<1 per km), short duration (10-60s)
	else if (stopsPerKm < 1 && avgDuration >= 10 && avgDuration < 60) {
		pattern = 'car-highway';
		confidence = 0.75;
		likelyMode = 'car';
	}
	// Walking pattern: Many stops (>5 per km), variable duration
	else if (stopsPerKm > 5) {
		pattern = 'walking';
		confidence = 0.70;
		likelyMode = 'walking';
	}
	// Moderate car pattern: 1-3 stops per km
	else if (stopsPerKm >= 1 && stopsPerKm <= 3) {
		pattern = 'car-city';
		confidence = 0.65;
		likelyMode = 'car';
	}

	return {
		stopCount,
		stopsPerKm,
		avgStopDuration: avgDuration,
		stopDurationVariance: durationCV,
		longestMovementDuration: longestMovement,
		pattern,
		confidence,
		likelyMode
	};
}

/**
 * Haversine distance calculation (same as multi-point-speed.ts)
 */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const toRad = (x: number) => (x * Math.PI) / 180;
	const R = 6371e3; // Earth radius in meters
	const φ1 = toRad(lat1);
	const φ2 = toRad(lat2);
	const Δφ = toRad(lat2 - lat1);
	const Δλ = toRad(lng2 - lng1);
	const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}
