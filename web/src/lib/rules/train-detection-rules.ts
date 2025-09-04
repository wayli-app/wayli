// /Users/bart/Dev/wayli/web/src/lib/rules/train-detection-rules.ts

import type { DetectionContext, DetectionResult, DetectionRule } from '../types/transport-detection.types';

/**
 * Specific train detection rules based on your constraints
 */

/**
 * Both train stations detected rule - highest confidence
 */
export class BothStationsDetectedRule implements DetectionRule {
	name = 'Both Train Stations Detected';
	priority = 95;

	canApply(context: DetectionContext): boolean {
		return context.currentJourney?.type === 'train' &&
			   Boolean(context.currentJourney?.startStation) &&
			   Boolean(context.currentJourney?.endStation) &&
			   context.currentSpeed >= 30;
	}

	detect(context: DetectionContext): DetectionResult | null {
		const journey = context.currentJourney!;
		return {
			mode: 'train',
			confidence: 0.95,
			reason: `Both start (${journey.startStation}) and end (${journey.endStation}) train stations detected`,
			metadata: {
				startStation: journey.startStation,
				endStation: journey.endStation,
				journeyType: 'train_complete'
			}
		};
	}
}

/**
 * Final station only rule - assume train travel before that point
 */
export class FinalStationOnlyRule implements DetectionRule {
	name = 'Final Station Only';
	priority = 85;

	canApply(context: DetectionContext): boolean {
		return context.atTrainStation &&
			   context.currentJourney?.type !== 'train' &&
			   context.currentSpeed >= 80; // Train-like speed
	}

	detect(context: DetectionContext): DetectionResult | null {
		return {
			mode: 'train',
			confidence: 0.85,
			reason: `Final train station (${context.stationName}) detected with train-like speed - assuming train travel before this point`,
			metadata: {
				stationName: context.stationName,
				detectionType: 'final_station_only',
				speed: context.currentSpeed
			}
		};
	}
}

/**
 * Starting station only rule - continue until significant slowdown
 */
export class StartingStationOnlyRule implements DetectionRule {
	name = 'Starting Station Only';
	priority = 80;

	canApply(context: DetectionContext): boolean {
		return context.currentJourney?.type === 'train' &&
			   Boolean(context.currentJourney?.startStation) &&
			   !context.currentJourney?.endStation &&
			   context.currentSpeed >= 30;
	}

	detect(context: DetectionContext): DetectionResult | null {
		const journey = context.currentJourney!;
		const timeSinceStart = Date.now() - journey.startTime;

		// Continue train journey until significant slowdown (5+ minutes at low speed)
		const hasSignificantSlowdown = this.checkForSignificantSlowdown(context);

		if (hasSignificantSlowdown) {
			return {
				mode: 'car', // Likely switched to car after train
				confidence: 0.8,
				reason: `Significant slowdown detected after train journey from ${journey.startStation}`,
				metadata: {
					startStation: journey.startStation,
					timeSinceStart: timeSinceStart,
					detectionType: 'slowdown_after_train'
				}
			};
		}

		return {
			mode: 'train',
			confidence: 0.8,
			reason: `Continuing train journey from ${journey.startStation}`,
			metadata: {
				startStation: journey.startStation,
				timeSinceStart: timeSinceStart,
				detectionType: 'continuing_from_start'
			}
		};
	}

	private checkForSignificantSlowdown(context: DetectionContext): boolean {
		// Check if speed has been consistently low for 5+ minutes
		const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
		const recentModes = context.modeHistory.filter(m => m.timestamp > fiveMinutesAgo);

		// If we have recent low-speed data, check for consistent low speed
		if (recentModes.length >= 3) {
			const recentSpeeds = recentModes.map(m => m.speed);
			const avgRecentSpeed = recentSpeeds.reduce((a, b) => a + b, 0) / recentSpeeds.length;
			return avgRecentSpeed < 20; // Consistently below 20 km/h
		}

		return false;
	}
}

/**
 * Train speed without station context rule
 */
export class TrainSpeedWithoutStationRule implements DetectionRule {
	name = 'Train Speed Without Station';
	priority = 60;

	canApply(context: DetectionContext): boolean {
		return !context.atTrainStation &&
			   !context.onHighway &&
			   context.currentSpeed >= 80 &&
			   context.currentSpeed <= 200 &&
			   context.modeHistory.length > 0;
	}

	detect(context: DetectionContext): DetectionResult | null {
		const lastMode = context.modeHistory[context.modeHistory.length - 1].mode;

		// If we were recently at a train station or in train mode, likely still train
		const recentlyAtStation = this.wasRecentlyAtTrainStation(context);
		const wasInTrainMode = lastMode === 'train';

		if (recentlyAtStation || wasInTrainMode) {
			return {
				mode: 'train',
				confidence: 0.7,
				reason: `Train-like speed without station context, but recently in train context`,
				metadata: {
					recentlyAtStation,
					wasInTrainMode,
					speed: context.currentSpeed
				}
			};
		}

		return null;
	}

	private wasRecentlyAtTrainStation(context: DetectionContext): boolean {
		const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
		return context.modeHistory.some(m =>
			m.timestamp > thirtyMinutesAgo &&
			m.mode === 'train'
		);
	}
}

/**
 * Train journey end rule - detect when train journey should end
 */
export class TrainJourneyEndRule implements DetectionRule {
	name = 'Train Journey End';
	priority = 65;

	canApply(context: DetectionContext): boolean {
		return context.currentJourney?.type === 'train' &&
			   context.currentSpeed < 30;
	}

	detect(context: DetectionContext): DetectionResult | null {
		const journey = context.currentJourney!;
		const timeSinceStart = Date.now() - journey.startTime;

		// End train journey if at station or significant slowdown
		if (context.atTrainStation || timeSinceStart > (2 * 60 * 60 * 1000)) { // 2 hours max
			return {
				mode: 'stationary', // Likely at destination
				confidence: 0.8,
				reason: `Train journey ended at ${context.atTrainStation ? 'train station' : 'destination'}`,
				metadata: {
					journeyEnd: true,
					timeSinceStart: timeSinceStart,
					atStation: context.atTrainStation
				}
			};
		}

		return null;
	}
}
