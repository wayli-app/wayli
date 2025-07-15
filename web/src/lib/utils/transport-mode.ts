import { SPEED_BRACKETS } from './transport-mode.config';
// Haversine distance in meters
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (x: number) => x * Math.PI / 180;
  const R = 6371e3;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1), Δλ = toRad(lng2 - lng1);
  const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Speed brackets for transport modes (km/h)
export const MIN_STOP_DURATION = 300; // 5 minutes

// Context object to track transport mode state
export interface EnhancedModeContext {
  currentMode: string;
  modeStartTime: number;
  lastSpeed: number;
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
  averageSpeed: number;
  speedHistory: number[];
  isInTrainJourney: boolean;
  trainJourneyStartTime?: number;
  trainJourneyStartStation?: string;
}

// Get speed bracket for a given speed
export function getSpeedBracket(speedKmh: number): string {
  for (const bracket of SPEED_BRACKETS) {
    if (speedKmh >= bracket.min && speedKmh < bracket.max) {
      return bracket.mode;
    }
  }
  return 'unknown';
}

// Check if a point is at a train station
export function isAtTrainStation(reverseGeocode: unknown): boolean {
  if (!reverseGeocode) return false;

  try {
    const geocode = typeof reverseGeocode === 'string' ? JSON.parse(reverseGeocode) : reverseGeocode;
    // Check top-level and address fields for class/type
    const hasRailwayClass = geocode.class === 'railway' || (geocode.address && geocode.address.class === 'railway');
    const hasPlatformType = geocode.type === 'platform' || (geocode.address && geocode.address.type === 'platform');
    return !!(
      (geocode && geocode.type === 'railway_station') ||
      (geocode && geocode.class === 'railway') ||
      (geocode && geocode.type === 'platform') ||
      (geocode && geocode.addresstype === 'railway') ||
      hasRailwayClass ||
      hasPlatformType
    );
  } catch {
    return false;
  }
}

// Get train station name from reverse geocode
export function getTrainStationName(reverseGeocode: unknown): string | null {
  if (!reverseGeocode) return null;

  try {
    const geocode = typeof reverseGeocode === 'string' ? JSON.parse(reverseGeocode) : reverseGeocode;
    if (geocode && geocode.address) {
      const city = geocode.address.city || '';
      const name = geocode.address.name || '';
      return city && name ? `${city} - ${name}` : (name || city || null);
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
}

// Check if mode switch is possible
export function isModeSwitchPossible(fromMode: string, toMode: string, atTrainStation: boolean): boolean {
  // Impossible switches
  if (fromMode === 'car' && toMode === 'train' && !atTrainStation) return false;
  if (fromMode === 'train' && toMode === 'car' && !atTrainStation) return false;

  // Stationary can switch to anything
  if (fromMode === 'stationary') return true;

  // Walking can switch to anything
  if (fromMode === 'walking') return true;

  // Cycling can switch to anything
  if (fromMode === 'cycling') return true;

  // Car can only switch to train at station, or to walking/cycling/stationary
  if (fromMode === 'car') {
    return ['walking', 'cycling', 'stationary', ...(atTrainStation ? ['train'] : [])].includes(toMode);
  }

  // Train can only switch to car at station, or to walking/stationary
  if (fromMode === 'train') {
    return ['walking', 'stationary', ...(atTrainStation ? ['car'] : [])].includes(toMode);
  }

  // Airplane can switch to anything (landing)
  if (fromMode === 'airplane') return true;

  return true;
}

// Enhanced transport mode detection with all constraints
export function detectEnhancedMode(
  prevLat: number, prevLng: number, currLat: number, currLng: number,
  dt: number, // seconds
  reverseGeocode: unknown,
  context: EnhancedModeContext
): { mode: string; confidence: number; reason: string } {
  const distance = haversine(prevLat, prevLng, currLat, currLng);
  const speedKmh = (distance / dt) * 3.6;

  // Update context
  context.lastSpeed = speedKmh;
  context.speedHistory.push(speedKmh);
  if (context.speedHistory.length > 10) {
    context.speedHistory.shift();
  }

  // Calculate average speed
  context.averageSpeed = context.speedHistory.reduce((a, b) => a + b, 0) / context.speedHistory.length;

  // Check if at train station
  const atTrainStation = isAtTrainStation(reverseGeocode);
  const stationName = atTrainStation ? getTrainStationName(reverseGeocode) : null;

  // Record train station visit
  if (atTrainStation && stationName) {
    const stationInfo = {
      timestamp: Date.now(),
      name: stationName,
      coordinates: { lat: currLat, lng: currLng }
    };
    context.trainStations.push(stationInfo);
    context.lastTrainStation = stationInfo;
  }

  // Get speed bracket for current speed
  let speedBracket = getSpeedBracket(speedKmh);

  // --- Fallback: Always assign a mode based on speed if no context is available ---
  // If speedBracket is 'unknown' but speed is a valid number, assign 'car' as a default fallback
  if ((speedBracket === 'unknown' || !speedBracket) && typeof speedKmh === 'number' && speedKmh >= 0) {
    speedBracket = 'car';
  }

  // Special handling for train detection
  let detectedMode = speedBracket;
  let confidence = 0.5;
  let reason = `Speed bracket: ${speedBracket}`;

  // Train detection logic
  if (speedBracket === 'train' || (context.isInTrainJourney && speedKmh >= 30)) {
    // Check if we should start a train journey
    if (!context.isInTrainJourney && atTrainStation) {
      context.isInTrainJourney = true;
      context.trainJourneyStartTime = Date.now();
      context.trainJourneyStartStation = stationName || 'Unknown';
      detectedMode = 'train';
      confidence = 0.8;
      reason = 'Started train journey at station';
    }
    // Continue train journey if already in one
    else if (context.isInTrainJourney) {
      detectedMode = 'train';
      confidence = 0.7;
      reason = 'Continuing train journey';

      // End train journey if we reach another station
      if (atTrainStation && context.trainJourneyStartStation !== stationName) {
        context.isInTrainJourney = false;
        context.trainJourneyStartTime = undefined;
        context.trainJourneyStartStation = undefined;
        reason = 'Ended train journey at destination station';
      }
    }
    // Infer train journey if we have a recent train station and high speed
    else if (context.lastTrainStation &&
             (Date.now() - context.lastTrainStation.timestamp) < 3600000 && // Within 1 hour
             speedKmh >= 50) { // High speed
      context.isInTrainJourney = true;
      context.trainJourneyStartTime = context.lastTrainStation.timestamp;
      context.trainJourneyStartStation = context.lastTrainStation.name;
      detectedMode = 'train';
      confidence = 0.6;
      reason = 'Inferred train journey from recent station visit';
    }
  }

  // End train journey if speed drops significantly
  if (context.isInTrainJourney && speedKmh < 20) {
    context.isInTrainJourney = false;
    context.trainJourneyStartTime = undefined;
    context.trainJourneyStartStation = undefined;
    detectedMode = speedBracket;
    reason = 'Ended train journey due to low speed';
  }

  // Mode continuity: if speed is in same bracket and no significant stop, maintain mode
  if (context.currentMode &&
      context.currentMode !== 'stationary' &&
      context.currentMode !== 'unknown' &&
      context.lastSpeed > 0 &&
      speedBracket === getSpeedBracket(context.lastSpeed) &&
      dt < MIN_STOP_DURATION) {

    // Check if mode switch is possible
    if (isModeSwitchPossible(context.currentMode, detectedMode, atTrainStation)) {
      detectedMode = context.currentMode;
      confidence = 0.9;
      reason = 'Mode continuity maintained';
    }
  }

  // Update context
  context.currentMode = detectedMode;
  context.modeStartTime = Date.now();

  return { mode: detectedMode, confidence, reason };
}

// Legacy functions for backward compatibility
export interface ModeContext {
  airplaneTime?: number;
  trainTime?: number;
  isInTrainJourney?: boolean;
  trainVelocityHistory?: number[];
  lastTrainVelocity?: number;
  trainJourneyStartTime?: number;
}

export function detectTrainMode(
  prevLat: number, prevLng: number, currLat: number, currLng: number,
  dt: number,
  atTrainLocation: boolean,
  context: ModeContext
): { mode: string; confidence: number } {
  // Create enhanced context
  const enhancedContext: EnhancedModeContext = {
    currentMode: context.isInTrainJourney ? 'train' : 'unknown',
    modeStartTime: Date.now(),
    lastSpeed: 0,
    trainStations: [],
    averageSpeed: 0,
    speedHistory: [],
    isInTrainJourney: context.isInTrainJourney || false,
    trainJourneyStartTime: context.trainJourneyStartTime
  };

  // Create mock geocode data for train station if atTrainLocation is true
  const mockGeocode = atTrainLocation ? {
    type: 'railway_station',
    address: { name: 'Test Station', city: 'Test City' }
  } : null;

  const result = detectEnhancedMode(prevLat, prevLng, currLat, currLng, dt, mockGeocode, enhancedContext);

  // Update legacy context
  context.isInTrainJourney = enhancedContext.isInTrainJourney;
  context.trainJourneyStartTime = enhancedContext.trainJourneyStartTime;
  context.trainVelocityHistory = enhancedContext.speedHistory;
  context.lastTrainVelocity = enhancedContext.lastSpeed;

  return { mode: result.mode, confidence: result.confidence };
}

export function detectMode(
  prevLat: number, prevLng: number, currLat: number, currLng: number,
  dt: number
): string {
  const enhancedContext: EnhancedModeContext = {
    currentMode: 'unknown',
    modeStartTime: Date.now(),
    lastSpeed: 0,
    trainStations: [],
    averageSpeed: 0,
    speedHistory: [],
    isInTrainJourney: false
  };

  const result = detectEnhancedMode(prevLat, prevLng, currLat, currLng, dt, null, enhancedContext);
  return result.mode;
}