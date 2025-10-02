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
	frequencyType: 'active_navigation' | 'background_tracking' | 'mixed';
	likelyMode: 'car' | 'train' | 'unknown';
}

/**
 * Analyze GPS sampling frequency to infer likely mode
 * High frequency (< 10s) typically indicates active car navigation
 * Low frequency (> 30s) typically indicates background tracking (train, walking)
 */
export function analyzeGPSFrequency(
	modeHistory: Array<{ timestamp: number }>
): GPSFrequencyAnalysis {
	if (modeHistory.length < 3) {
		return {
			averageInterval: 0,
			frequencyType: 'mixed',
			likelyMode: 'unknown'
		};
	}

	const intervals: number[] = [];
	for (let i = 1; i < modeHistory.length; i++) {
		intervals.push(modeHistory[i].timestamp - modeHistory[i - 1].timestamp);
	}

	const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

	let frequencyType: GPSFrequencyAnalysis['frequencyType'];
	let likelyMode: GPSFrequencyAnalysis['likelyMode'];

	if (avgInterval < 10000) { // < 10 seconds
		frequencyType = 'active_navigation';
		likelyMode = 'car'; // Active navigation usually means driving
	} else if (avgInterval > 30000) { // > 30 seconds
		frequencyType = 'background_tracking';
		likelyMode = 'unknown'; // Could be train, walking, etc.
	} else {
		frequencyType = 'mixed';
		likelyMode = 'unknown';
	}

	return {
		averageInterval: avgInterval,
		frequencyType,
		likelyMode
	};
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
