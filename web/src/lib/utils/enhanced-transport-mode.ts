// /Users/bart/Dev/wayli/web/src/lib/utils/enhanced-transport-mode.ts

import type { GeocodeGeoJSONFeature } from './geojson-converter';
import type { DetectionContext, PointData } from '../types/transport-detection.types';
import { TransportModeDetector } from '../services/transport-mode-detector.service';

// Import all rules
import { SpeedBracketRule, MultiPointSpeedRule, HighSpeedContinuityRule, SpeedSimilarityRule, PhysicalPossibilityValidationRule, AccelerationValidationRule, FinalSanityCheckRule } from '../rules/speed-rules';
import { HighwayOverrideRule, TrainStationRule, AirportRule, GeographicContextRule } from '../rules/geographic-rules';
import { TrainJourneyContinuationRule, AirplaneJourneyContinuationRule, ModeContinuityRule, GradualTransitionRule, ModeContinuityFallbackRule, DefaultRule, MinimumModeDurationRule } from '../rules/journey-rules';
import { BothStationsDetectedRule, FinalStationOnlyRule, StartingStationOnlyRule, TrainSpeedWithoutStationRule, TrainJourneyEndRule, UnrealisticTrainSegmentRule } from '../rules/train-detection-rules';
import { SpeedPatternTrainDetectionRule, SpeedPatternCarDetectionRule } from '../rules/speed-pattern-rules';

// Import utility functions
import {
	isAtTrainStation,
	getTrainStationName,
	isAtAirport,
	getAirportName,
	isOnHighwayOrMotorway
} from './transport-mode';
import { haversine } from './multi-point-speed';

/**
 * Enhanced transport mode context with all necessary state
 */
export interface EnhancedModeContext {
	// Current mode and speed
	currentMode: string;
	lastSpeed: number;

	// Train tracking
	trainStations: Array<{
		timestamp: number;
		name: string;
		coordinates: { lat: number; lng: number };
	}>;
	lastTrainStation?: {
		timestamp: number;
		name: string;
		coordinates: { lat: number; lng: number };
	};
	isInTrainJourney: boolean;
	trainJourneyStartTime?: number;
	trainJourneyStartStation?: string;

	// Airport tracking
	airports: Array<{
		timestamp: number;
		name: string;
		coordinates: { lat: number; lng: number };
	}>;
	lastAirport?: {
		timestamp: number;
		name: string;
		coordinates: { lat: number; lng: number };
	};
	isInAirplaneJourney: boolean;
	airplaneJourneyStartTime?: number;
	airplaneJourneyStartAirport?: string;

	// Speed and history tracking
	averageSpeed: number;
	speedHistory: number[];
	modeHistory: Array<{
		mode: string;
		timestamp: number;
		speed: number;
		coordinates: { lat: number; lng: number };
		confidence: number;
		reason: string;
	}>;

	// Distance tracking
	totalDistanceTraveled: number;
	lastKnownCoordinates?: { lat: number; lng: number; timestamp: number };

	// Point history for multi-point speed calculation
	pointHistory: PointData[];
}

/**
 * Initialize the enhanced transport mode detector with all rules
 */
function initializeDetector(): TransportModeDetector {
	const detector = new TransportModeDetector();

	// Add all rules in priority order (highest to lowest)
	// GEOGRAPHIC CONTEXT LAYER (96-100) - Highest priority
	detector.addRule(new HighwayOverrideRule());                    // 100
	detector.addRule(new TrainStationRule());                       // 97 - Geographic context beats physics
	detector.addRule(new AirportRule());                            // 96 - Geographic context beats physics

	// PHYSICS ENFORCEMENT LAYER (95)
	detector.addRule(new FinalSanityCheckRule());                   // 95 - Safety net for impossible modes (now with geographic awareness)
	detector.addRule(new BothStationsDetectedRule());               // 95

	// TRAIN JOURNEY MANAGEMENT (80-85)
	detector.addRule(new FinalStationOnlyRule());                   // 85
	detector.addRule(new StartingStationOnlyRule());                // 80

	// JOURNEY CONTINUATION LAYER (70-75)
	detector.addRule(new AirplaneJourneyContinuationRule());        // 75
	detector.addRule(new SpeedPatternTrainDetectionRule());         // 75
	detector.addRule(new SpeedPatternCarDetectionRule());           // 74
	detector.addRule(new AccelerationValidationRule());             // 71 NEW - Detects impossible accelerations
	detector.addRule(new TrainJourneyContinuationRule());           // 70
	detector.addRule(new HighSpeedContinuityRule());                // 70

	// PHYSICAL VALIDATION LAYER (68-69)
	detector.addRule(new PhysicalPossibilityValidationRule());      // 69 UPDATED - Validates physical limits (moved up)
	detector.addRule(new MinimumModeDurationRule());                // 68 UPDATED - Now checks physics before enforcing continuity

	// SIMILARITY & PATTERN LAYER (60-66)
	detector.addRule(new UnrealisticTrainSegmentRule());            // 66 NEW - Filters unrealistic short train segments
	detector.addRule(new TrainJourneyEndRule());                    // 65
	detector.addRule(new SpeedSimilarityRule());                    // 65
	detector.addRule(new TrainSpeedWithoutStationRule());           // 60

	// SPEED ANALYSIS LAYER (50-55)
	detector.addRule(new MultiPointSpeedRule());                    // 55
	detector.addRule(new SpeedBracketRule());                       // 50

	// FALLBACK LAYER (10-30)
	detector.addRule(new GeographicContextRule());                  // 30
	detector.addRule(new ModeContinuityRule());                     // 30
	detector.addRule(new GradualTransitionRule());                  // 25
	detector.addRule(new ModeContinuityFallbackRule());             // 15
	detector.addRule(new DefaultRule());                            // 10

	return detector;
}

// Global detector instance
let globalDetector: TransportModeDetector | null = null;

/**
 * Get or create the global detector instance
 */
function getDetector(): TransportModeDetector {
	if (!globalDetector) {
		globalDetector = initializeDetector();
	}
	return globalDetector;
}

/**
 * Enhanced transport mode detection using the new rule-based system
 */
export function detectEnhancedMode(
	prevLat: number,
	prevLng: number,
	currLat: number,
	currLng: number,
	dt: number, // seconds
	reverseGeocode: GeocodeGeoJSONFeature | null | undefined,
	context: EnhancedModeContext,
	speedMps?: number
): { mode: string; reason: string } {

	const detector = getDetector();

	// Create current and previous point data
	const current: PointData = {
		lat: currLat,
		lng: currLng,
		timestamp: Date.now(),
		geocode: reverseGeocode,
		speed: speedMps ? speedMps * 3.6 : undefined
	};

	const previous: PointData = {
		lat: prevLat,
		lng: prevLng,
		timestamp: Date.now() - (dt * 1000),
		geocode: null,
		speed: context.lastSpeed
	};

	// Update point history
	// If point history is empty or doesn't contain a point matching previous coordinates,
	// add the previous point first to enable 2-point speed calculation
	if (context.pointHistory.length === 0 ||
		Math.abs(context.pointHistory[context.pointHistory.length - 1].lat - prevLat) > 0.0001 ||
		Math.abs(context.pointHistory[context.pointHistory.length - 1].lng - prevLng) > 0.0001) {
		context.pointHistory.push(previous);
	}

	context.pointHistory.push(current);
	while (context.pointHistory.length > 20) { // Keep last 20 points
		context.pointHistory.shift();
	}

	// Check geographic context
	const atTrainStation = isAtTrainStation(reverseGeocode);
	const stationName = atTrainStation ? getTrainStationName(reverseGeocode) : undefined;

	const atAirport = isAtAirport(reverseGeocode);
	const airportName = atAirport ? getAirportName(reverseGeocode) : undefined;

	const onHighway = isOnHighwayOrMotorway(reverseGeocode);

	// Update train station tracking
	if (atTrainStation && stationName) {
		const stationInfo = {
			timestamp: Date.now(),
			name: stationName,
			coordinates: { lat: currLat, lng: currLng }
		};
		context.trainStations.push(stationInfo);
		context.lastTrainStation = stationInfo;
	}

	// Update airport tracking
	if (atAirport && airportName) {
		const airportInfo = {
			timestamp: Date.now(),
			name: airportName,
			coordinates: { lat: currLat, lng: currLng }
		};
		context.airports.push(airportInfo);
		context.lastAirport = airportInfo;
	}

	// Create journey context
	const currentJourney = context.isInTrainJourney ? {
		type: 'train' as const,
		startTime: context.trainJourneyStartTime || Date.now(),
		startStation: context.trainJourneyStartStation,
		endStation: atTrainStation ? stationName : undefined,
		totalDistance: context.totalDistanceTraveled,
		averageSpeed: context.averageSpeed
	} : context.isInAirplaneJourney ? {
		type: 'airplane' as const,
		startTime: context.airplaneJourneyStartTime || Date.now(),
		startAirport: context.airplaneJourneyStartAirport,
		endAirport: atAirport ? airportName : undefined,
		totalDistance: context.totalDistanceTraveled,
		averageSpeed: context.averageSpeed
	} : undefined;

	// Create detection context
	const detectionContext = detector.createDetectionContext(
		current,
		previous,
		context.pointHistory,
		context.modeHistory,
		{
			atTrainStation,
			atAirport,
			onHighway,
			stationName,
			airportName
		},
		currentJourney
	);

	// Detect mode using rule engine
	const result = detector.detect(detectionContext);

	// Update context based on result
	context.currentMode = result.mode;
	context.lastSpeed = detectionContext.currentSpeed;

	// Update journey state
	if (result.mode === 'train' && !context.isInTrainJourney) {
		context.isInTrainJourney = true;
		context.trainJourneyStartTime = Date.now();
		context.trainJourneyStartStation = stationName || 'Unknown';
	} else if (result.mode !== 'train' && context.isInTrainJourney) {
		context.isInTrainJourney = false;
		context.trainJourneyStartTime = undefined;
		context.trainJourneyStartStation = undefined;
	}

	if (result.mode === 'airplane' && !context.isInAirplaneJourney) {
		context.isInAirplaneJourney = true;
		context.airplaneJourneyStartTime = Date.now();
		context.airplaneJourneyStartAirport = airportName || 'Unknown';
	} else if (result.mode !== 'airplane' && context.isInAirplaneJourney) {
		context.isInAirplaneJourney = false;
		context.airplaneJourneyStartTime = undefined;
		context.airplaneJourneyStartAirport = undefined;
	}

	// Update mode history
	context.modeHistory.push({
		mode: result.mode,
		timestamp: Date.now(),
		speed: detectionContext.currentSpeed,
		coordinates: { lat: currLat, lng: currLng },
		confidence: result.confidence,
		reason: result.reason
	});

	// Keep only last 20 mode history entries
	while (context.modeHistory.length > 20) {
		context.modeHistory.shift();
	}

	// Update speed history
	context.speedHistory.push(detectionContext.currentSpeed);
	while (context.speedHistory.length > 20) {
		context.speedHistory.shift();
	}

	// Update average speed
	context.averageSpeed = context.speedHistory.reduce((a, b) => a + b, 0) / context.speedHistory.length;

	// Update distance tracking using Haversine for accuracy
	if (context.lastKnownCoordinates) {
		const distance = haversine(
			context.lastKnownCoordinates.lat,
			context.lastKnownCoordinates.lng,
			currLat,
			currLng
		);
		context.totalDistanceTraveled += distance;
	}
	context.lastKnownCoordinates = { lat: currLat, lng: currLng, timestamp: Date.now() };

	return {
		mode: result.mode,
		reason: result.reason
	};
}

/**
 * Create a new enhanced mode context
 */
export function createEnhancedModeContext(): EnhancedModeContext {
	return {
		currentMode: 'unknown',
		lastSpeed: 0,
		trainStations: [],
		airports: [],
		isInTrainJourney: false,
		isInAirplaneJourney: false,
		averageSpeed: 0,
		speedHistory: [],
		modeHistory: [],
		totalDistanceTraveled: 0,
		pointHistory: []
	};
}
