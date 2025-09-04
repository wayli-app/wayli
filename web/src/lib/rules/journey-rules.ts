// /Users/bart/Dev/wayli/web/src/lib/rules/journey-rules.ts

import type { DetectionContext, DetectionResult, DetectionRule } from '../types/transport-detection.types';

/**
 * Journey continuation and context-based detection rules
 */

/**
 * Train journey continuation rule
 */
export class TrainJourneyContinuationRule implements DetectionRule {
	name = 'Train Journey Continuation';
	priority = 70;

	canApply(context: DetectionContext): boolean {
		return context.currentJourney?.type === 'train' &&
			   context.currentSpeed >= 30 &&
			   context.currentSpeed <= 200;
	}

	detect(context: DetectionContext): DetectionResult {
		const journey = context.currentJourney!;
		const timeSinceStart = Date.now() - journey.startTime;

		return {
			mode: 'train',
			confidence: 0.8,
			reason: `Continuing train journey from ${journey.startStation || 'unknown station'}`,
			metadata: {
				journeyType: 'train',
				startStation: journey.startStation,
				timeSinceStart: timeSinceStart,
				speed: context.currentSpeed
			}
		};
	}
}

/**
 * Airplane journey continuation rule
 */
export class AirplaneJourneyContinuationRule implements DetectionRule {
	name = 'Airplane Journey Continuation';
	priority = 75;

	canApply(context: DetectionContext): boolean {
		return context.currentJourney?.type === 'airplane' &&
			   context.currentSpeed >= 200;
	}

	detect(context: DetectionContext): DetectionResult {
		const journey = context.currentJourney!;
		const timeSinceStart = Date.now() - journey.startTime;

		return {
			mode: 'airplane',
			confidence: 0.85,
			reason: `Continuing airplane journey from ${journey.startAirport || 'unknown airport'}`,
			metadata: {
				journeyType: 'airplane',
				startAirport: journey.startAirport,
				timeSinceStart: timeSinceStart,
				speed: context.currentSpeed
			}
		};
	}
}

/**
 * Mode continuity rule for low speeds
 */
export class ModeContinuityRule implements DetectionRule {
	name = 'Mode Continuity';
	priority = 30;

	canApply(context: DetectionContext): boolean {
		return context.modeHistory.length > 0 &&
			   context.currentSpeed < 20; // Only for slow speeds
	}

	detect(context: DetectionContext): DetectionResult | null {
		const lastMode = context.modeHistory[context.modeHistory.length - 1].mode;

		// Don't maintain high-speed modes at low speeds
		if (['airplane', 'train'].includes(lastMode)) {
			return null;
		}

		return {
			mode: lastMode,
			confidence: 0.7,
			reason: `Maintaining previous mode (${lastMode}) at low speed`
		};
	}
}

/**
 * Gradual transition rule - prevents sudden mode changes
 */
export class GradualTransitionRule implements DetectionRule {
	name = 'Gradual Transition';
	priority = 25;

	canApply(context: DetectionContext): boolean {
		return context.modeHistory.length >= 2;
	}

	detect(context: DetectionContext): DetectionResult | null {
		const lastMode = context.modeHistory[context.modeHistory.length - 1].mode;
		const secondLastMode = context.modeHistory[context.modeHistory.length - 2].mode;

		// Prevent impossible transitions
		const impossibleTransitions = [
			['walking', 'airplane'],
			['cycling', 'airplane'],
			['airplane', 'cycling'],
			['train', 'cycling'],
			['cycling', 'train']
		];

		for (const [from, to] of impossibleTransitions) {
			if (secondLastMode === from && lastMode === to) {
				return {
					mode: from, // Revert to previous mode
					confidence: 0.8,
					reason: `Impossible transition from ${from} to ${to}, maintaining ${from}`
				};
			}
		}

		return null;
	}
}

/**
 * Mode continuity fallback rule - maintains previous mode when no other rules apply
 */
export class ModeContinuityFallbackRule implements DetectionRule {
	name = 'Mode Continuity Fallback';
	priority = 15;

	canApply(context: DetectionContext): boolean {
		return context.modeHistory.length > 0;
	}

	detect(context: DetectionContext): DetectionResult {
		const lastMode = context.modeHistory[context.modeHistory.length - 1].mode;

		return {
			mode: lastMode,
			confidence: 0.5,
			reason: `Maintaining previous mode (${lastMode}) when no specific detection rules apply`,
			metadata: {
				fallbackType: 'mode_continuity',
				previousMode: lastMode,
				currentSpeed: context.currentSpeed
			}
		};
	}
}

/**
 * Default fallback rule
 */
export class DefaultRule implements DetectionRule {
	name = 'Default Fallback';
	priority = 10;

	canApply(context: DetectionContext): boolean {
		return true; // Always applicable as final fallback
	}

	detect(context: DetectionContext): DetectionResult {
		// First try to use the previous mode if available
		if (context.modeHistory.length > 0) {
			const lastMode = context.modeHistory[context.modeHistory.length - 1].mode;
			return {
				mode: lastMode,
				confidence: 0.4,
				reason: `Using previous mode (${lastMode}) as fallback when detection fails`
			};
		}

		// Speed-based fallback when no previous mode is available
		let mode = 'unknown';
		if (context.currentSpeed < 2) mode = 'stationary';
		else if (context.currentSpeed < 8) mode = 'walking';
		else if (context.currentSpeed < 25) mode = 'cycling';
		else if (context.currentSpeed < 80) mode = 'car';
		else if (context.currentSpeed < 200) mode = 'train';
		else mode = 'airplane';

		return {
			mode,
			confidence: 0.3,
			reason: `Default speed-based detection: ${context.currentSpeed.toFixed(1)} km/h`
		};
	}
}
