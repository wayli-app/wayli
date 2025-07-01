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

// Context object to track cumulative airplane time and train time
export interface ModeContext {
  airplaneTime?: number;
  trainTime?: number;
  isInTrainJourney?: boolean;
  trainVelocityHistory?: number[]; // Track recent train velocities for continuity
  lastTrainVelocity?: number; // Last confirmed train velocity
  trainJourneyStartTime?: number; // When the current train journey started
}

// Enhanced train detection with velocity-based continuity
export function detectTrainMode(
  prevLat: number, prevLng: number, currLat: number, currLng: number,
  dt: number, // seconds
  atTrainLocation: boolean, // Whether current point is at a railway location
  context: ModeContext
): { mode: string; confidence: number } {
  const distance = haversine(prevLat, prevLng, currLat, currLng);
  const speedKmh = (distance / dt) * 3.6;

  // Initialize context properties if not present
  if (!context.trainVelocityHistory) context.trainVelocityHistory = [];
  if (!context.trainJourneyStartTime) context.trainJourneyStartTime = 0;

  // Train velocity range: 30-300 km/h
  const isTrainSpeed = speedKmh >= 30 && speedKmh <= 300;

  // Velocity similarity threshold (within 20% of previous train velocity)
  const velocitySimilarityThreshold = 0.2;
  const isVelocitySimilar = context.lastTrainVelocity
    ? Math.abs(speedKmh - context.lastTrainVelocity) / context.lastTrainVelocity <= velocitySimilarityThreshold
    : false;

  // Check if we should start or continue a train journey
  const shouldStartTrainJourney = atTrainLocation && isTrainSpeed;
  const shouldContinueTrainJourney = context.isInTrainJourney && (
    atTrainLocation ||
    (isTrainSpeed && isVelocitySimilar) ||
    (isTrainSpeed && context.trainVelocityHistory.length > 0)
  );

  if (shouldStartTrainJourney || shouldContinueTrainJourney) {
    // Start new train journey
    if (!context.isInTrainJourney) {
      context.isInTrainJourney = true;
      context.trainJourneyStartTime = Date.now();
      context.trainVelocityHistory = [];
      context.lastTrainVelocity = speedKmh;
    }

    // Add current velocity to history (keep last 10 velocities)
    context.trainVelocityHistory.push(speedKmh);
    if (context.trainVelocityHistory.length > 10) {
      context.trainVelocityHistory.shift();
    }

    // Update last train velocity
    context.lastTrainVelocity = speedKmh;

    // Calculate confidence based on journey duration and velocity consistency
    const journeyDuration = context.trainJourneyStartTime ? (Date.now() - context.trainJourneyStartTime) / 1000 : 0;
    const minJourneyTime = 300; // 5 minutes minimum

    let confidence = 0.5; // Base confidence

    // Increase confidence with journey duration
    if (journeyDuration >= minJourneyTime) {
      confidence += 0.3;
    }
    if (journeyDuration >= 600) { // 10 minutes
      confidence += 0.2;
    }

    // Increase confidence with velocity consistency
    if (context.trainVelocityHistory.length >= 3) {
      const avgVelocity = context.trainVelocityHistory.reduce((a, b) => a + b, 0) / context.trainVelocityHistory.length;
      const velocityVariance = context.trainVelocityHistory.reduce((sum, v) => sum + Math.pow(v - avgVelocity, 2), 0) / context.trainVelocityHistory.length;
      const velocityStdDev = Math.sqrt(velocityVariance);

      // Lower standard deviation = higher confidence
      if (velocityStdDev < 10) confidence += 0.2;
      else if (velocityStdDev < 20) confidence += 0.1;
    }

    // Increase confidence if at train location
    if (atTrainLocation) {
      confidence += 0.1;
    }

    return { mode: 'train', confidence: Math.min(confidence, 1.0) };
  } else {
    // End train journey if conditions are not met
    if (context.isInTrainJourney) {
      context.isInTrainJourney = false;
      context.trainVelocityHistory = [];
      context.lastTrainVelocity = undefined;
      context.trainJourneyStartTime = undefined;
    }

    return { mode: 'unknown', confidence: 0 };
  }
}

export function detectMode(
  prevLat: number, prevLng: number, currLat: number, currLng: number,
  dt: number, // seconds
  context?: ModeContext
): string {
  const distance = haversine(prevLat, prevLng, currLat, currLng);
  const speedKmh = (distance / dt) * 3.6;

  if (speedKmh < 7) return 'walking';
  if (speedKmh < 18) return 'cycling';

  // Track airplane time in context
  if (speedKmh > 300) {
    if (context) {
      context.airplaneTime = (context.airplaneTime || 0) + dt;
      if (context.airplaneTime >= 3600) {
        return 'airplane';
      } else {
        return 'unknown';
      }
    } else {
      // No context provided, fallback to unknown
      return 'unknown';
    }
  }

  // Remove speed-based train detection. Only backend can set 'train'.
  // if (speedKmh > 30 && speedKmh < 300) return 'train';

  if (speedKmh > 20 && speedKmh < 120) return 'car';

  return 'unknown';
}