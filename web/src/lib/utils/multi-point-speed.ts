// /Users/bart/Dev/wayli/web/src/lib/utils/multi-point-speed.ts

import type {
	PointData,
	SpeedCalculationConfig,
	SpeedSegment
} from '../types/transport-detection.types';

/**
 * Multi-point speed calculation for noise reduction and stability
 */

export const SPEED_CALCULATION_CONFIG: SpeedCalculationConfig = {
	DEFAULT_WINDOW_SIZE: 5, // Number of points to use
	MIN_WINDOW_SIZE: 3, // Minimum points required
	MAX_WINDOW_SIZE: 10, // Maximum points to prevent lag
	OUTLIER_THRESHOLD: 2.0, // Standard deviations for outlier detection
	WEIGHT_DECAY: 0.8, // Weight decay factor for older points
	MIN_DISTANCE_THRESHOLD: 10, // Minimum distance in meters to consider
	MAX_SPEED_THRESHOLD: 500 // Maximum realistic speed in km/h
};

/**
 * Haversine distance calculation in meters
 */
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

/**
 * Calculate speed using multiple points for noise reduction
 */
export function calculateMultiPointSpeed(
	points: PointData[],
	windowSize: number = SPEED_CALCULATION_CONFIG.DEFAULT_WINDOW_SIZE
): number {
	// Check if points have pre-calculated speeds (from database)
	const pointsWithSpeed = points.filter(
		(p) => p.speed !== undefined && p.speed !== null && p.speed > 0
	);

	// If we have enough points with pre-calculated speeds, use those instead of calculating from coordinates
	if (pointsWithSpeed.length >= Math.min(3, points.length)) {
		const recentSpeeds = pointsWithSpeed.slice(-windowSize).map((p) => p.speed!);

		// Filter outliers
		const speeds = recentSpeeds.filter(
			(s) => s > 0 && s < SPEED_CALCULATION_CONFIG.MAX_SPEED_THRESHOLD
		);
		if (speeds.length === 0) return 0;

		// Calculate weighted average (more weight on recent speeds)
		let weightedSum = 0;
		let totalWeight = 0;
		speeds.forEach((speed, index) => {
			const weight = Math.pow(SPEED_CALCULATION_CONFIG.WEIGHT_DECAY, speeds.length - 1 - index);
			weightedSum += speed * weight;
			totalWeight += weight;
		});

		return totalWeight > 0
			? Math.min(weightedSum / totalWeight, SPEED_CALCULATION_CONFIG.MAX_SPEED_THRESHOLD)
			: 0;
	}

	// Fallback: Calculate from coordinates and timestamps
	// Handle case with only 2 points (simple speed calculation)
	if (points.length === 2) {
		const [prev, curr] = points;
		const distance = haversine(prev.lat, prev.lng, curr.lat, curr.lng);
		const timeDiff = (curr.timestamp - prev.timestamp) / 1000; // seconds
		if (timeDiff > 0 && distance > SPEED_CALCULATION_CONFIG.MIN_DISTANCE_THRESHOLD) {
			const speedMs = distance / timeDiff;
			const speedKmh = speedMs * 3.6;
			return Math.min(speedKmh, SPEED_CALCULATION_CONFIG.MAX_SPEED_THRESHOLD);
		}
		return 0;
	}

	if (points.length < SPEED_CALCULATION_CONFIG.MIN_WINDOW_SIZE) {
		return 0;
	}

	// Use the most recent points
	const recentPoints = points.slice(-windowSize);

	// Calculate distances and times between consecutive points
	const segments: SpeedSegment[] = [];
	for (let i = 1; i < recentPoints.length; i++) {
		const prev = recentPoints[i - 1];
		const curr = recentPoints[i];

		const distance = haversine(prev.lat, prev.lng, curr.lat, curr.lng);
		const timeDiff = (curr.timestamp - prev.timestamp) / 1000; // seconds

		if (timeDiff > 0 && distance > SPEED_CALCULATION_CONFIG.MIN_DISTANCE_THRESHOLD) {
			segments.push({
				distance,
				time: timeDiff,
				speed: (distance / timeDiff) * 3.6 // km/h
			});
		}
	}

	if (segments.length === 0) return 0;

	// Filter out outliers
	const filteredSegments = filterOutliers(segments);

	// Calculate weighted average speed
	const weightedSpeed = calculateWeightedAverageSpeed(filteredSegments);

	return Math.min(weightedSpeed, SPEED_CALCULATION_CONFIG.MAX_SPEED_THRESHOLD);
}

/**
 * Filter out GPS outliers using statistical methods
 */
function filterOutliers(segments: SpeedSegment[]): SpeedSegment[] {
	if (segments.length < 3) return segments;

	const speeds = segments.map((s) => s.speed);
	const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
	const variance =
		speeds.reduce((sum, speed) => sum + Math.pow(speed - mean, 2), 0) / speeds.length;
	const stdDev = Math.sqrt(variance);

	const threshold = mean + SPEED_CALCULATION_CONFIG.OUTLIER_THRESHOLD * stdDev;

	return segments.filter((segment) => segment.speed <= threshold && segment.speed >= 0);
}

/**
 * Calculate weighted average with more weight for recent points
 */
function calculateWeightedAverageSpeed(segments: SpeedSegment[]): number {
	if (segments.length === 0) return 0;

	let weightedSum = 0;
	let totalWeight = 0;

	segments.forEach((segment, index) => {
		const weight = Math.pow(SPEED_CALCULATION_CONFIG.WEIGHT_DECAY, segments.length - 1 - index);
		weightedSum += segment.speed * weight;
		totalWeight += weight;
	});

	return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Get adaptive window size based on GPS data quality
 */
export function getAdaptiveWindowSize(pointHistory: PointData[]): number {
	if (pointHistory.length < 3) return SPEED_CALCULATION_CONFIG.MIN_WINDOW_SIZE;

	// Calculate GPS accuracy indicators
	const distances: number[] = [];
	for (let i = 1; i < pointHistory.length; i++) {
		const dist = haversine(
			pointHistory[i - 1].lat,
			pointHistory[i - 1].lng,
			pointHistory[i].lat,
			pointHistory[i].lng
		);
		distances.push(dist);
	}

	const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;

	// Use larger window for noisy GPS data
	if (avgDistance > 100) return 7; // Noisy GPS
	if (avgDistance > 50) return 5; // Moderate noise
	return 3; // Clean GPS
}

/**
 * Set speed calculation window size with bounds checking
 */
export function setSpeedCalculationWindow(windowSize: number): number {
	return Math.max(
		SPEED_CALCULATION_CONFIG.MIN_WINDOW_SIZE,
		Math.min(windowSize, SPEED_CALCULATION_CONFIG.MAX_WINDOW_SIZE)
	);
}
