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

// Context object to track cumulative airplane time
export interface ModeContext {
  airplaneTime?: number;
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