// /Users/bart/Dev/wayli/web/src/lib/rules/speed-pattern-rules.ts

import type { DetectionContext, DetectionResult, DetectionRule } from '../types/transport-detection.types';
import {
	calculateSpeedVariance,
	hasTrainLikeSpeedPattern,
	hasStraightTrajectory,
	hasCarLikeSpeedPattern,
	hasSustainedSpeed,
	analyzeGPSFrequency,
	analyzeSpeedTransitions,
	isPhysicallyPossible
} from '../utils/speed-pattern-analysis';

/**
 * Speed pattern-based train detection rule
 * Used when no station context is available
 * Analyzes speed variance, trajectory straightness, and sustained speed
 */
export class SpeedPatternTrainDetectionRule implements DetectionRule {
	name = 'Speed Pattern Train Detection';
	priority = 75; // Between journey continuation and speed without station

	canApply(context: DetectionContext): boolean {
		// Apply when:
		// 1. Not at train station (no geographic context)
		// 2. Not on highway
		// 3. Speed is in ambiguous range (80-120 km/h)
		// 4. Have enough history data
		return !context.atTrainStation &&
			   !context.onHighway &&
			   context.currentSpeed >= 80 &&
			   context.currentSpeed <= 120 &&
			   context.speedHistory.length >= 10 &&
			   context.pointHistory.length >= 10;
	}

	detect(context: DetectionContext): DetectionResult | null {
		// Check minimum journey requirements to avoid false positives on short highway segments
		// Require at least 3km OR 5 minutes of travel before considering train mode
		const journeyDuration = this.calculateJourneyDuration(context);
		const journeyDistance = this.calculateJourneyDistance(context);

		// Minimum thresholds: 3km OR 5 minutes to avoid 400m highway false positives
		const MIN_DISTANCE = 3000; // 3 km in meters
		const MIN_DURATION = 5 * 60 * 1000; // 5 minutes in ms

		if (journeyDistance < MIN_DISTANCE && journeyDuration < MIN_DURATION) {
			// Too short - likely a brief highway segment, not a train
			return null;
		}

		// Analyze multiple patterns
		const speedMetrics = calculateSpeedVariance(context.speedHistory);
		const hasTrainSpeed = hasTrainLikeSpeedPattern(context.speedHistory);
		const hasCarSpeed = hasCarLikeSpeedPattern(context.speedHistory);

		const points = context.pointHistory.map(p => ({ lat: p.lat, lng: p.lng }));
		const isStraight = hasStraightTrajectory(points);

		const hasSustained = hasSustainedSpeed(
			context.modeHistory,
			90, // 90 km/h minimum
			10 * 60 * 1000 // 10 minutes
		);

		// NEW: GPS frequency analysis
		const gpsFreq = analyzeGPSFrequency(context.modeHistory);

		// NEW: Speed transition smoothness
		const transitions = analyzeSpeedTransitions(context.speedHistory);

		// Score the patterns
		let trainScore = 0;
		let carScore = 0;

		// Speed variance analysis
		if (speedMetrics.coefficientOfVariation < 0.12) trainScore += 3; // Very train-like
		else if (speedMetrics.coefficientOfVariation < 0.18) trainScore += 2;
		else if (speedMetrics.coefficientOfVariation < 0.25) trainScore += 1;
		else carScore += 2; // High variance = car

		// Trajectory analysis
		if (isStraight) trainScore += 2;
		else carScore += 1;

		// Sustained speed
		if (hasSustained) trainScore += 2;

		// Speed range preference
		if (context.currentSpeed >= 100) trainScore += 1;
		else if (context.currentSpeed < 90) carScore += 1;

		// NEW: GPS sampling frequency
		if (gpsFreq.likelyMode === 'car') carScore += 2;
		else if (gpsFreq.frequencyType === 'background_tracking') trainScore += 1;

		// NEW: Speed transition smoothness
		if (transitions.likelyMode === 'train') trainScore += 2;
		else if (transitions.likelyMode === 'car') carScore += 2;

		// Decide based on scores
		const totalScore = trainScore + carScore;
		const trainConfidence = trainScore / Math.max(totalScore, 1);

		if (trainScore > carScore && trainConfidence >= 0.65) {
			return {
				mode: 'train',
				confidence: Math.min(0.75 + (trainConfidence - 0.65) * 0.5, 0.90),
				reason: `Strong train-like patterns: CV=${speedMetrics.coefficientOfVariation.toFixed(3)}, straight=${isStraight}, smooth=${transitions.smoothness}`,
				metadata: {
					trainScore,
					carScore,
					speedCV: speedMetrics.coefficientOfVariation,
					isStraight,
					hasSustained,
					speedMean: speedMetrics.mean,
					speedStdDev: speedMetrics.stdDev,
					gpsFrequency: gpsFreq.frequencyType,
					transitionSmoothness: transitions.smoothness
				}
			};
		} else if (carScore > trainScore) {
			return {
				mode: 'car',
				confidence: Math.min(0.70 + (carScore - trainScore) * 0.05, 0.85),
				reason: `Car-like patterns: CV=${speedMetrics.coefficientOfVariation.toFixed(3)}, ${transitions.smoothness} transitions`,
				metadata: {
					trainScore,
					carScore,
					speedCV: speedMetrics.coefficientOfVariation,
					gpsFrequency: gpsFreq.frequencyType,
					transitionSmoothness: transitions.smoothness
				}
			};
		}

		return null; // Ambiguous, let other rules decide
	}

	private calculateJourneyDuration(context: DetectionContext): number {
		// Calculate duration from earliest to latest point in mode history
		if (context.modeHistory.length < 2) return 0;

		const oldest = context.modeHistory[0].timestamp;
		const newest = context.modeHistory[context.modeHistory.length - 1].timestamp;
		return newest - oldest;
	}

	private calculateJourneyDistance(context: DetectionContext): number {
		// Calculate total distance from point history using Haversine
		if (context.pointHistory.length < 2) return 0;

		let totalDistance = 0;
		for (let i = 1; i < context.pointHistory.length; i++) {
			const prev = context.pointHistory[i - 1];
			const curr = context.pointHistory[i];
			totalDistance += this.haversine(prev.lat, prev.lng, curr.lat, curr.lng);
		}
		return totalDistance;
	}

	private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
		const R = 6371e3; // Earth radius in meters
		const φ1 = (lat1 * Math.PI) / 180;
		const φ2 = (lat2 * Math.PI) / 180;
		const Δφ = ((lat2 - lat1) * Math.PI) / 180;
		const Δλ = ((lng2 - lng1) * Math.PI) / 180;

		const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
				  Math.cos(φ1) * Math.cos(φ2) *
				  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

		return R * c; // Distance in meters
	}
}

/**
 * Car-specific pattern detection rule
 * Detects cars based on high speed variability
 */
export class SpeedPatternCarDetectionRule implements DetectionRule {
	name = 'Speed Pattern Car Detection';
	priority = 74;

	canApply(context: DetectionContext): boolean {
		return !context.atTrainStation &&
			   context.currentSpeed >= 60 &&
			   context.currentSpeed <= 130 &&
			   context.speedHistory.length >= 10;
	}

	detect(context: DetectionContext): DetectionResult | null {
		const speedMetrics = calculateSpeedVariance(context.speedHistory);

		// Strong car signal: High variance + frequent speed changes
		if (speedMetrics.coefficientOfVariation > 0.35) {
			return {
				mode: 'car',
				confidence: 0.85,
				reason: `High speed variability indicates car travel (CV=${speedMetrics.coefficientOfVariation.toFixed(3)})`,
				metadata: {
					speedCV: speedMetrics.coefficientOfVariation,
					speedRange: speedMetrics.range
				}
			};
		}

		return null;
	}
}
