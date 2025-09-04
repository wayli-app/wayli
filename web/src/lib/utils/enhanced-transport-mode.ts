// /Users/bart/Dev/wayli/web/src/lib/utils/enhanced-transport-mode.ts

import type { GeocodeGeoJSONFeature } from './geojson-converter';
import type { DetectionContext, PointData } from '../types/transport-detection.types';
import { TransportModeDetector } from '../services/transport-mode-detector.service';

// Import all rules
import { SpeedBracketRule, MultiPointSpeedRule, HighSpeedContinuityRule, SpeedSimilarityRule } from '../rules/speed-rules';
import { HighwayOverrideRule, TrainStationRule, AirportRule, GeographicContextRule } from '../rules/geographic-rules';
import { TrainJourneyContinuationRule, AirplaneJourneyContinuationRule, ModeContinuityRule, GradualTransitionRule, ModeContinuityFallbackRule, DefaultRule } from '../rules/journey-rules';
import { BothStationsDetectedRule, FinalStationOnlyRule, StartingStationOnlyRule, TrainSpeedWithoutStationRule, TrainJourneyEndRule } from '../rules/train-detection-rules';

// Import utility functions
import {
	isAtTrainStation,
	getTrainStationName,
	isAtAirport,
	getAirportName,
	isOnHighwayOrMotorway
} from './transport-mode';

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

	// Add all rules in priority order
	detector.addRule(new HighwayOverrideRule());
	detector.addRule(new BothStationsDetectedRule());
	detector.addRule(new TrainStationRule());
	detector.addRule(new AirportRule());
	detector.addRule(new FinalStationOnlyRule());
	detector.addRule(new StartingStationOnlyRule());
	detector.addRule(new TrainJourneyContinuationRule());
	detector.addRule(new AirplaneJourneyContinuationRule());
	detector.addRule(new TrainSpeedWithoutStationRule());
	detector.addRule(new TrainJourneyEndRule());
	detector.addRule(new MultiPointSpeedRule());
	detector.addRule(new SpeedBracketRule());
	detector.addRule(new HighSpeedContinuityRule());
	detector.addRule(new SpeedSimilarityRule());
	detector.addRule(new GeographicContextRule());
	detector.addRule(new ModeContinuityRule());
	detector.addRule(new GradualTransitionRule());
	detector.addRule(new ModeContinuityFallbackRule());
	detector.addRule(new DefaultRule());

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

	// Update distance tracking
	if (context.lastKnownCoordinates) {
		const distance = Math.sqrt(
			Math.pow(currLat - context.lastKnownCoordinates.lat, 2) +
			Math.pow(currLng - context.lastKnownCoordinates.lng, 2)
		) * 111000; // Rough conversion to meters
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
