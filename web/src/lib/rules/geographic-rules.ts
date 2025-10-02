// /Users/bart/Dev/wayli/web/src/lib/rules/geographic-rules.ts

import type { DetectionContext, DetectionResult, DetectionRule } from '../types/transport-detection.types';

/**
 * Geographic context-based detection rules
 */

/**
 * Highway/motorway override rule - highest priority
 */
export class HighwayOverrideRule implements DetectionRule {
	name = 'Highway Override';
	priority = 100;

	canApply(context: DetectionContext): boolean {
		return context.onHighway && context.currentSpeed >= 30;
	}

	detect(context: DetectionContext): DetectionResult | null {
		return {
			mode: 'car',
			confidence: 0.95,
			reason: 'On highway/motorway at car speed',
			metadata: {
				geographicContext: 'highway',
				speed: context.currentSpeed
			}
		};
	}
}

/**
 * Train station detection rule
 */
export class TrainStationRule implements DetectionRule {
	name = 'Train Station Detection';
	priority = 97; // Higher than FinalSanityCheckRule - geographic context beats physics

	canApply(context: DetectionContext): boolean {
		// Apply when at train station, regardless of speed
		// This allows detection of train mode when boarding/alighting
		return context.atTrainStation;
	}

	detect(context: DetectionContext): DetectionResult | null {
		// If stationary at a train station, assume boarding/starting train journey
		if (context.currentSpeed < 30) {
			return {
				mode: 'train',
				confidence: 0.85,
				reason: `At train station (${context.stationName}) - boarding or alighting`,
				metadata: {
					geographicContext: 'train_station',
					stationName: context.stationName,
					speed: context.currentSpeed,
					state: 'stationary_at_station'
				}
			};
		}

		return {
			mode: 'train',
			confidence: 0.9,
			reason: `At train station (${context.stationName}) with train-like speed`,
			metadata: {
				geographicContext: 'train_station',
				stationName: context.stationName,
				speed: context.currentSpeed
			}
		};
	}
}

/**
 * Airport detection rule
 */
export class AirportRule implements DetectionRule {
	name = 'Airport Detection';
	priority = 96; // Higher than FinalSanityCheckRule - geographic context beats physics

	canApply(context: DetectionContext): boolean {
		return context.atAirport && context.currentSpeed >= 200;
	}

	detect(context: DetectionContext): DetectionResult | null {
		return {
			mode: 'airplane',
			confidence: 0.9,
			reason: `At airport (${context.airportName}) with airplane speed`,
			metadata: {
				geographicContext: 'airport',
				airportName: context.airportName,
				speed: context.currentSpeed
			}
		};
	}
}

/**
 * Geographic context validation rule
 */
export class GeographicContextRule implements DetectionRule {
	name = 'Geographic Context Validation';
	priority = 30;

	canApply(context: DetectionContext): boolean {
		return context.modeHistory.length > 0;
	}

	detect(context: DetectionContext): DetectionResult | null {
		const lastMode = context.modeHistory[context.modeHistory.length - 1].mode;

		// Validate mode against geographic context
		if (lastMode === 'train' && !context.atTrainStation && context.currentSpeed < 30) {
			return {
				mode: 'car', // Likely switched to car
				confidence: 0.7,
				reason: 'No longer at train station, likely switched to car'
			};
		}

		if (lastMode === 'airplane' && !context.atAirport && context.currentSpeed < 200) {
			return {
				mode: 'car', // Likely landed and switched to car
				confidence: 0.7,
				reason: 'No longer at airport, likely switched to car'
			};
		}

		return null;
	}
}
