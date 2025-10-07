// /Users/bart/Dev/wayli/web/src/lib/rules/stop-pattern-rules.ts

import type {
	DetectionContext,
	DetectionResult,
	DetectionRule
} from '../types/transport-detection.types';
import { analyzeStopPattern } from '../utils/speed-pattern-analysis';

/**
 * Stop Pattern Analysis Rule
 * Analyzes stop frequency, duration, and regularity to distinguish transport modes
 *
 * Train: Few stops (<0.5/km), long duration (60-300s), regular
 * Car (city): Many stops (>3/km), irregular
 * Car (highway): Few stops (<1/km), short duration (10-60s)
 * Walking: Many stops (>5/km), variable
 */
export class StopPatternAnalysisRule implements DetectionRule {
	name = 'Stop Pattern Analysis';
	priority = 68; // Between physical validation and pattern analysis

	canApply(context: DetectionContext): boolean {
		// Need sufficient data points and journey distance
		if (context.pointHistory.length < 10) return false;

		// Calculate total distance
		const totalDistance = this.calculateTotalDistance(context.pointHistory);

		// Require at least 2km journey to have meaningful stop pattern analysis
		return totalDistance >= 2000; // 2km in meters
	}

	detect(context: DetectionContext): DetectionResult | null {
		// Analyze stop patterns
		const stopAnalysis = analyzeStopPattern(context.pointHistory);

		// Only return result if confidence is high enough
		if (stopAnalysis.confidence < 0.65) {
			return null;
		}

		// Apply GPS frequency modifier if available
		const gpsModifier =
			context.gpsFrequency.confidenceModifiers[
				stopAnalysis.likelyMode as keyof typeof context.gpsFrequency.confidenceModifiers
			] || 0;

		const finalConfidence = Math.max(0.1, Math.min(0.95, stopAnalysis.confidence + gpsModifier));

		return {
			mode: stopAnalysis.likelyMode,
			confidence: finalConfidence,
			reason: `Stop pattern indicates ${stopAnalysis.pattern}: ${stopAnalysis.stopsPerKm.toFixed(2)} stops/km, avg ${stopAnalysis.avgStopDuration.toFixed(0)}s duration`,
			metadata: {
				pattern: stopAnalysis.pattern,
				stopCount: stopAnalysis.stopCount,
				stopsPerKm: stopAnalysis.stopsPerKm,
				avgStopDuration: stopAnalysis.avgStopDuration,
				stopDurationVariance: stopAnalysis.stopDurationVariance,
				longestMovementDuration: stopAnalysis.longestMovementDuration,
				gpsFrequency: context.gpsFrequency.frequencyType,
				gpsModifier
			}
		};
	}

	private calculateTotalDistance(points: Array<{ lat: number; lng: number }>): number {
		let totalDistance = 0;
		for (let i = 1; i < points.length; i++) {
			totalDistance += this.haversine(
				points[i - 1].lat,
				points[i - 1].lng,
				points[i].lat,
				points[i].lng
			);
		}
		return totalDistance;
	}

	private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
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
}
