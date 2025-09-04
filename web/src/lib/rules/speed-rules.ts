// /Users/bart/Dev/wayli/web/src/lib/rules/speed-rules.ts

import type { DetectionContext, DetectionResult, DetectionRule } from '../types/transport-detection.types';
import { SPEED_BRACKETS } from '../utils/transport-mode.config';

/**
 * Speed-based detection rules
 */

/**
 * Get speed bracket for a given speed
 */
function getSpeedBracket(speedKmh: number): string {
	for (const bracket of SPEED_BRACKETS) {
		if (speedKmh >= bracket.min && speedKmh < bracket.max) {
			return bracket.mode;
		}
	}
	return 'unknown';
}

/**
 * Speed bracket detection rule - fallback rule
 */
export class SpeedBracketRule implements DetectionRule {
	name = 'Speed Bracket Detection';
	priority = 50;

	canApply(context: DetectionContext): boolean {
		return true; // Always applicable as fallback
	}

	detect(context: DetectionContext): DetectionResult {
		const bracket = getSpeedBracket(context.currentSpeed);
		return {
			mode: bracket,
			confidence: 0.6,
			reason: `Speed ${context.currentSpeed.toFixed(1)} km/h matches ${bracket} bracket`
		};
	}
}

/**
 * Multi-point speed stability rule - uses rolling average for better decisions
 */
export class MultiPointSpeedRule implements DetectionRule {
	name = 'Multi-Point Speed Stability';
	priority = 55;

	canApply(context: DetectionContext): boolean {
		return context.pointHistory.length >= 3;
	}

	detect(context: DetectionContext): DetectionResult {
		const stableSpeed = context.rollingAverageSpeed;
		const bracket = getSpeedBracket(stableSpeed);

		// Higher confidence for stable speeds
		const confidence = context.speedHistory.length >= 3 ? 0.8 : 0.6;

		return {
			mode: bracket,
			confidence,
			reason: `Stable speed ${stableSpeed.toFixed(1)} km/h (rolling average) matches ${bracket} bracket`,
			metadata: {
				stableSpeed,
				rawSpeed: context.currentSpeed,
				pointCount: context.pointHistory.length
			}
		};
	}
}

/**
 * High speed continuity rule - maintains mode at high speeds
 */
export class HighSpeedContinuityRule implements DetectionRule {
	name = 'High Speed Continuity';
	priority = 40;

	canApply(context: DetectionContext): boolean {
		return context.currentSpeed >= 80 &&
			   context.modeHistory.length > 0 &&
			   context.modeHistory[context.modeHistory.length - 1].mode !== 'stationary';
	}

	detect(context: DetectionContext): DetectionResult | null {
		const lastMode = context.modeHistory[context.modeHistory.length - 1].mode;

		// Only maintain high-speed modes
		if (['car', 'train', 'airplane'].includes(lastMode)) {
			return {
				mode: lastMode,
				confidence: 0.85,
				reason: `Maintaining ${lastMode} mode at high speed (${context.currentSpeed.toFixed(1)} km/h)`
			};
		}

		return null;
	}
}

/**
 * Speed similarity rule - maintains mode for similar speeds
 */
export class SpeedSimilarityRule implements DetectionRule {
	name = 'Speed Similarity';
	priority = 35;

	canApply(context: DetectionContext): boolean {
		return context.modeHistory.length > 0 &&
			   context.speedHistory.length > 0;
	}

	detect(context: DetectionContext): DetectionResult | null {
		const lastMode = context.modeHistory[context.modeHistory.length - 1].mode;
		const lastSpeed = context.speedHistory[context.speedHistory.length - 1];
		const speedDiff = Math.abs(context.currentSpeed - lastSpeed);

		// If speed change is less than 20 km/h, likely same mode
		if (speedDiff < 20 && lastMode !== 'stationary') {
			return {
				mode: lastMode,
				confidence: 0.7,
				reason: `Speed change ${speedDiff.toFixed(1)} km/h suggests continuing ${lastMode}`
			};
		}

		return null;
	}
}
