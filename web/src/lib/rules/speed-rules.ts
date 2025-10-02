// /Users/bart/Dev/wayli/web/src/lib/rules/speed-rules.ts

import type { DetectionContext, DetectionResult, DetectionRule } from '../types/transport-detection.types';
import { SPEED_BRACKETS, MODE_PHYSICAL_LIMITS, ACCELERATION_LIMITS, MODE_CONTINUITY_LIMITS } from '../utils/transport-mode.config';

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
 * Final sanity check rule - safety net to catch any physically impossible detections
 * HIGHEST PRIORITY - Absolute last-resort override
 */
export class FinalSanityCheckRule implements DetectionRule {
	name = 'Final Sanity Check';
	priority = 95; // Very high priority - acts as safety net

	canApply(context: DetectionContext): boolean {
		return context.modeHistory.length > 0;
	}

	detect(context: DetectionContext): DetectionResult | null {
		// Get what mode would be detected by other rules
		const lastDetectedMode = context.modeHistory[context.modeHistory.length - 1].mode;

		// Final check: is this mode physically possible at current speed?
		const limits = MODE_PHYSICAL_LIMITS[lastDetectedMode as keyof typeof MODE_PHYSICAL_LIMITS];

		if (!limits) return null;

		// If speed is completely outside physical limits, force correction
		if (context.currentSpeed > limits.max || (context.currentSpeed < limits.min && context.currentSpeed > 0)) {
			// DEFENSE IN DEPTH: Check geographic context before defaulting to speed bracket
			// Geographic context should ALWAYS override physics-based guessing
			let correctMode: string;
			let contextReason: string;

			if (context.atTrainStation) {
				// At train station/platform → must be train
				correctMode = 'train';
				contextReason = 'at train station/platform';
			} else if (context.onHighway) {
				// On highway → must be car
				correctMode = 'car';
				contextReason = 'on highway/motorway';
			} else if (context.atAirport) {
				// At airport → likely airplane
				correctMode = 'airplane';
				contextReason = 'at airport';
			} else {
				// No geographic context - use speed bracket as fallback
				correctMode = getSpeedBracket(context.currentSpeed);
				contextReason = `speed bracket (${context.currentSpeed.toFixed(1)} km/h)`;
			}

			console.warn(`⚠️ SANITY CHECK TRIGGERED: ${lastDetectedMode} at ${context.currentSpeed} km/h is impossible (limits: ${limits.min}-${limits.max})`);

			return {
				mode: correctMode,
				confidence: 1.0, // Maximum confidence - this is a critical override
				reason: `SANITY CHECK: ${lastDetectedMode} at ${context.currentSpeed.toFixed(1)} km/h is physically impossible (limits: ${limits.min}-${limits.max} km/h), forcing ${correctMode} (${contextReason})`,
				metadata: {
					detectedMode: lastDetectedMode,
					physicalLimits: limits,
					currentSpeed: context.currentSpeed,
					validationType: 'sanity_check_override',
					criticalOverride: true,
					geographicContext: context.atTrainStation ? 'train_station' : context.onHighway ? 'highway' : context.atAirport ? 'airport' : 'none'
				}
			};
		}

		return null;
	}
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
	priority = 70; // Higher than speed bracket rules to maintain mode

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
 * Acceleration validation rule - detects physically impossible accelerations
 * VERY HIGH PRIORITY - Catches impossible speed changes
 */
export class AccelerationValidationRule implements DetectionRule {
	name = 'Acceleration Validation';
	priority = 71; // Higher than PhysicalPossibility to catch acceleration issues first

	canApply(context: DetectionContext): boolean {
		return context.modeHistory.length > 0 && context.speedHistory.length > 0;
	}

	detect(context: DetectionContext): DetectionResult | null {
		const lastMode = context.modeHistory[context.modeHistory.length - 1].mode;
		const lastSpeed = context.speedHistory[context.speedHistory.length - 1];
		const speedChange = Math.abs(context.currentSpeed - lastSpeed);

		// Check mode-specific speed difference limits
		const continuityLimit = MODE_CONTINUITY_LIMITS[lastMode as keyof typeof MODE_CONTINUITY_LIMITS];

		if (continuityLimit && speedChange > continuityLimit.maxSpeedDiff) {
			// Speed change exceeds what's possible for this mode
			const appropriateMode = getSpeedBracket(context.currentSpeed);

			return {
				mode: appropriateMode,
				confidence: 0.9,
				reason: `Speed change of ${speedChange.toFixed(1)} km/h (from ${lastSpeed.toFixed(1)} to ${context.currentSpeed.toFixed(1)}) exceeds ${lastMode} limit (max: ${continuityLimit.maxSpeedDiff} km/h), switching to ${appropriateMode}`,
				metadata: {
					previousMode: lastMode,
					previousSpeed: lastSpeed,
					currentSpeed: context.currentSpeed,
					speedChange,
					maxAllowedChange: continuityLimit.maxSpeedDiff,
					validationType: 'speed_change_limit'
				}
			};
		}

		// Check physical acceleration limits (if we have timestamp info)
		const currentPoint = context.pointHistory[context.pointHistory.length - 1];
		const previousPoint = context.pointHistory[context.pointHistory.length - 2];

		if (currentPoint && previousPoint && currentPoint.timestamp && previousPoint.timestamp) {
			const timeDiffSeconds = (currentPoint.timestamp - previousPoint.timestamp) / 1000;

			if (timeDiffSeconds > 0 && timeDiffSeconds < 60) { // Only check for points within 1 minute
				const accelerationKmhPerSec = speedChange / timeDiffSeconds;
				const accelLimit = ACCELERATION_LIMITS[lastMode as keyof typeof ACCELERATION_LIMITS];

				if (accelLimit && accelerationKmhPerSec > accelLimit) {
					// Impossible acceleration detected
					const appropriateMode = getSpeedBracket(context.currentSpeed);

					return {
						mode: appropriateMode,
						confidence: 0.95,
						reason: `Impossible acceleration: ${accelerationKmhPerSec.toFixed(1)} km/h/s exceeds ${lastMode} limit (${accelLimit} km/h/s), switching to ${appropriateMode}`,
						metadata: {
							previousMode: lastMode,
							previousSpeed: lastSpeed,
							currentSpeed: context.currentSpeed,
							acceleration: accelerationKmhPerSec,
							maxAcceleration: accelLimit,
							timeDiff: timeDiffSeconds,
							validationType: 'acceleration_limit'
						}
					};
				}
			}
		}

		return null;
	}
}

/**
 * Physical possibility validation rule - prevents physically impossible modes
 * HIGH PRIORITY - Enforces physics before any continuity rules
 */
export class PhysicalPossibilityValidationRule implements DetectionRule {
	name = 'Physical Possibility Validation';
	priority = 69; // MOVED UP - Higher than MinimumModeDurationRule to enforce physics first

	canApply(context: DetectionContext): boolean {
		return context.modeHistory.length > 0;
	}

	detect(context: DetectionContext): DetectionResult | null {
		const lastMode = context.modeHistory[context.modeHistory.length - 1].mode;
		const limits = MODE_PHYSICAL_LIMITS[lastMode as keyof typeof MODE_PHYSICAL_LIMITS];

		// If no limits defined for mode, skip validation
		if (!limits) return null;

		// Check if current speed exceeds physical maximum for this mode
		if (context.currentSpeed > limits.max) {
			// Find appropriate mode for this speed
			const appropriateMode = getSpeedBracket(context.currentSpeed);

			// Calculate severity of violation
			const percentOver = ((context.currentSpeed - limits.max) / limits.max) * 100;
			const isSevereViolation = percentOver > 50; // More than 50% over limit

			// Severe violations (e.g., walking at 31 km/h = 158% over limit)
			// get very high confidence to force immediate correction
			const confidence = isSevereViolation ? 0.95 : 0.8;

			return {
				mode: appropriateMode,
				confidence,
				reason: `Speed ${context.currentSpeed.toFixed(1)} km/h exceeds physical limit for ${lastMode} (max: ${limits.max} km/h${isSevereViolation ? ' - SEVERE VIOLATION' : ''}), switching to ${appropriateMode}`,
				metadata: {
					previousMode: lastMode,
					physicalLimit: limits.max,
					currentSpeed: context.currentSpeed,
					percentOver,
					severityLevel: isSevereViolation ? 'severe' : 'moderate',
					validationType: 'physical_maximum'
				}
			};
		}

		// Check if current speed is below physical minimum
		if (context.currentSpeed < limits.min && context.currentSpeed > 0) {
			const appropriateMode = getSpeedBracket(context.currentSpeed);

			return {
				mode: appropriateMode,
				confidence: 0.75,
				reason: `Speed ${context.currentSpeed.toFixed(1)} km/h below physical minimum for ${lastMode} (min: ${limits.min} km/h), switching to ${appropriateMode}`,
				metadata: {
					previousMode: lastMode,
					physicalLimit: limits.min,
					currentSpeed: context.currentSpeed,
					validationType: 'physical_minimum'
				}
			};
		}

		// Speed is within physical limits for this mode
		return null;
	}
}

/**
 * Speed similarity rule - maintains mode for similar speeds
 * NOW WITH PHYSICAL VALIDATION
 */
export class SpeedSimilarityRule implements DetectionRule {
	name = 'Speed Similarity';
	priority = 65; // Higher than speed bracket rules to maintain mode

	canApply(context: DetectionContext): boolean {
		return context.modeHistory.length > 0 &&
			   context.speedHistory.length > 0;
	}

	detect(context: DetectionContext): DetectionResult | null {
		const lastMode = context.modeHistory[context.modeHistory.length - 1].mode;
		const lastSpeed = context.speedHistory[context.speedHistory.length - 1];
		const speedDiff = Math.abs(context.currentSpeed - lastSpeed);

		// Check if speed is physically possible for this mode
		const limits = MODE_PHYSICAL_LIMITS[lastMode as keyof typeof MODE_PHYSICAL_LIMITS];
		if (limits) {
			// If current speed exceeds physical limits, don't maintain mode
			if (context.currentSpeed > limits.max || context.currentSpeed < limits.min) {
				return null; // Let other rules (like PhysicalPossibilityValidationRule) handle it
			}
		}

		// If speed change is less than 20 km/h, likely same mode
		if (speedDiff < 20 && lastMode !== 'stationary') {
			return {
				mode: lastMode,
				confidence: 0.7,
				reason: `Speed change ${speedDiff.toFixed(1)} km/h suggests continuing ${lastMode}`,
				metadata: {
					speedDiff,
					previousSpeed: lastSpeed,
					currentSpeed: context.currentSpeed,
					withinPhysicalLimits: true
				}
			};
		}

		return null;
	}
}
