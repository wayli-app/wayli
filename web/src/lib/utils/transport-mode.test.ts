import { describe, it, expect } from 'vitest';
import { detectMode, detectTrainMode, haversine } from './transport-mode';
import type { ModeContext } from './transport-mode';

describe('Transport Mode Detection', () => {
  describe('Debug Tests', () => {
    it('should debug train detection', () => {
      const context: ModeContext = {};
      const distance = haversine(0, 0, 0.01, 0.01);
      const speedKmh = (distance / 60) * 3.6;
      console.log('Distance:', distance, 'Speed:', speedKmh);

      const result = detectTrainMode(0, 0, 0.01, 0.01, 60, true, context);
      console.log('Result:', result);
      console.log('Context:', context);
    });
  });

  describe('detectMode', () => {
    it('should detect walking for slow speeds', () => {
      // Very slow movement: ~5 km/h
      const result = detectMode(0, 0, 0.0001, 0.0001, 60);
      expect(result).toBe('walking');
    });

    it('should detect cycling for moderate speeds', () => {
      // Moderate speed: ~15 km/h
      const result = detectMode(0, 0, 0.0004, 0.0004, 60);
      expect(result).toBe('cycling');
    });

    it('should detect car for higher speeds', () => {
      // Higher speed: ~60 km/h
      const result = detectMode(0, 0, 0.002, 0.002, 60);
      expect(result).toBe('car');
    });

    it('should detect airplane after 1 hour of high speed', () => {
      const context: ModeContext = {};

      // Simulate 30 minutes of high speed
      for (let i = 0; i < 30; i++) {
        detectMode(0, 0, 0.5, 0.5, 120, context); // ~900 km/h
      }
      expect(context.airplaneTime).toBe(3600);

      const result = detectMode(0, 0, 0.5, 0.5, 120, context);
      expect(result).toBe('airplane');
    });

    it('should return unknown for airplane speeds without context', () => {
      const result = detectMode(0, 0, 0.5, 0.5, 120); // High speed without context
      expect(result).toBe('unknown');
    });
  });

  describe('detectTrainMode', () => {
    it('should start train journey when at railway location with train speed', () => {
      const context: ModeContext = {};
      // ~60 km/h at railway location
      const result = detectTrainMode(0, 0, 0.01, 0.01, 60, true, context);

      expect(result.mode).toBe('train');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(context.isInTrainJourney).toBe(true);
      expect(context.lastTrainVelocity).toBeGreaterThan(30);
    });

    it('should continue train journey with similar velocity', () => {
      const context: ModeContext = {};

      // Start train journey
      detectTrainMode(0, 0, 0.01, 0.01, 60, true, context); // ~60 km/h at railway

      // Continue with similar velocity (within 20% - 48-72 km/h)
      const result = detectTrainMode(0.01, 0.01, 0.02, 0.02, 60, false, context); // ~60 km/h, not at railway

      expect(result.mode).toBe('train');
      expect(context.isInTrainJourney).toBe(true);
    });

    it('should end train journey when velocity changes significantly', () => {
      const context: ModeContext = {};

      // Start train journey
      detectTrainMode(0, 0, 0.01, 0.01, 60, true, context); // ~60 km/h at railway

      // Continue with very different velocity (outside 20% threshold)
      const result = detectTrainMode(0.01, 0.01, 0.04, 0.04, 60, false, context); // ~240 km/h, not at railway

      expect(result.mode).toBe('unknown');
      expect(context.isInTrainJourney).toBe(false);
    });

    it('should increase confidence with journey duration', () => {
      const context: ModeContext = {};

      // Start train journey
      const startResult = detectTrainMode(0, 0, 0.01, 0.01, 60, true, context);
      expect(startResult.confidence).toBeGreaterThan(0.5); // Base + railway location

      // Continue for 5 minutes with consistent velocity
      for (let i = 0; i < 5; i++) {
        const prevLat = 0.01 + i * 0.01;
        const prevLng = 0.01 + i * 0.01;
        const currLat = 0.01 + (i + 1) * 0.01;
        const currLng = 0.01 + (i + 1) * 0.01;
        detectTrainMode(prevLat, prevLng, currLat, currLng, 60, false, context);
      }

      const longResult = detectTrainMode(0.06, 0.06, 0.07, 0.07, 60, false, context);
      expect(longResult.confidence).toBeGreaterThan(startResult.confidence);
    });

    it('should increase confidence with velocity consistency', () => {
      const context: ModeContext = {};

      // Start train journey
      detectTrainMode(0, 0, 0.01, 0.01, 60, true, context);

      // Continue with very consistent velocity
      for (let i = 0; i < 5; i++) {
        const prevLat = 0.01 + i * 0.01;
        const prevLng = 0.01 + i * 0.01;
        const currLat = 0.01 + (i + 1) * 0.01;
        const currLng = 0.01 + (i + 1) * 0.01;
        detectTrainMode(prevLat, prevLng, currLat, currLng, 60, false, context);
      }

      const result = detectTrainMode(0.06, 0.06, 0.07, 0.07, 60, false, context);
      expect(result.confidence).toBeGreaterThan(0.6); // Should have good confidence due to consistency
    });

    it('should not start train journey without railway location', () => {
      const context: ModeContext = {};
      const result = detectTrainMode(0, 0, 0.01, 0.01, 60, false, context); // ~60 km/h, not at railway

      expect(result.mode).toBe('unknown');
      expect(context.isInTrainJourney).toBe(false);
    });

    it('should not start train journey with non-train speed', () => {
      const context: ModeContext = {};
      const result = detectTrainMode(0, 0, 0.0001, 0.0001, 60, true, context); // ~6 km/h at railway

      expect(result.mode).toBe('unknown');
      expect(context.isInTrainJourney).toBe(false);
    });

    it('should handle velocity history correctly', () => {
      const context: ModeContext = {};

      // Add more than 10 velocity readings
      for (let i = 0; i < 15; i++) {
        detectTrainMode(0, 0, 0.01, 0.01, 60, true, context);
      }

      // Should only keep last 10 velocities
      expect(context.trainVelocityHistory?.length).toBe(10);
    });
  });

  describe('haversine', () => {
    it('should calculate distance correctly', () => {
      const distance = haversine(0, 0, 0, 1);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeCloseTo(111194.9, 0); // ~111 km at equator
    });

    it('should return 0 for same coordinates', () => {
      const distance = haversine(0, 0, 0, 0);
      expect(distance).toBe(0);
    });
  });
});

// Mock data for testing train detection scenarios
export const createMockTrackerData = (scenarios: Array<{
  atTrainType: boolean;
  speedKmh: number;
  duration: number; // seconds
  timestamp: string;
}>) => {
  return scenarios.map((scenario, index) => ({
    location: {
      coordinates: [0 + index * 0.001, 0 + index * 0.001]
    },
    recorded_at: scenario.timestamp,
    reverse_geocode: scenario.atTrainType ? JSON.stringify({
      type: 'railway_station',
      class: 'railway'
    }) : null
  }));
};

describe('Train Detection Scenarios', () => {
  it('should handle continuous train journey with velocity similarity', () => {
    const context: ModeContext = {};

    // Start at railway station
    let result = detectTrainMode(0, 0, 0.01, 0.01, 60, true, context);
    expect(result.mode).toBe('train');

    // Continue journey with similar velocity (not at railway locations)
    for (let i = 1; i < 10; i++) {
      const prevLat = 0.01 + (i - 1) * 0.01;
      const prevLng = 0.01 + (i - 1) * 0.01;
      const currLat = 0.01 + i * 0.01;
      const currLng = 0.01 + i * 0.01;

      result = detectTrainMode(prevLat, prevLng, currLat, currLng, 60, false, context);
      expect(result.mode).toBe('train');
    }

    expect(context.isInTrainJourney).toBe(true);
    expect(context.trainVelocityHistory?.length).toBeGreaterThan(0);
  });

  it('should handle train journey with velocity variations', () => {
    const context: ModeContext = {};

    // Start at railway station
    detectTrainMode(0, 0, 0.01, 0.01, 60, true, context);

    // Continue with varying but similar velocities (all within 20% of 60 km/h)
    const coordinates = [
      [0.01, 0.01], [0.02, 0.02], [0.03, 0.03], [0.04, 0.04], [0.05, 0.05],
      [0.06, 0.06], [0.07, 0.07], [0.08, 0.08], [0.09, 0.09], [0.10, 0.10]
    ];

    for (let i = 0; i < coordinates.length - 1; i++) {
      const [prevLat, prevLng] = coordinates[i];
      const [currLat, currLng] = coordinates[i + 1];

      const result = detectTrainMode(prevLat, prevLng, currLat, currLng, 60, false, context);
      expect(result.mode).toBe('train'); // Should continue as train due to velocity similarity
    }
  });

  it('should end train journey when velocity changes dramatically', () => {
    const context: ModeContext = {};

    // Start train journey
    detectTrainMode(0, 0, 0.01, 0.01, 60, true, context);

    // Continue with similar velocity
    detectTrainMode(0.01, 0.01, 0.02, 0.02, 60, false, context);

    // Sudden velocity change (much faster)
    const result = detectTrainMode(0.02, 0.02, 0.06, 0.06, 60, false, context);
    expect(result.mode).toBe('unknown');
    expect(context.isInTrainJourney).toBe(false);
  });

  it('should handle car crossing railway bridge scenario', () => {
    const context: ModeContext = {};

    // Before bridge (car speed, not at railway)
    for (let i = 0; i < 4; i++) {
      const result = detectTrainMode(0, 0, 0.01, 0.01, 60, false, context);
      expect(result.mode).toBe('unknown'); // Not train
    }

    // On bridge (train-like speed at railway location)
    const result = detectTrainMode(0.04, 0.04, 0.05, 0.05, 60, true, context);
    expect(result.mode).toBe('train'); // Should be detected as train

    // After bridge (car speed again, not at railway)
    const afterResult = detectTrainMode(0.05, 0.05, 0.06, 0.06, 60, false, context);
    expect(afterResult.mode).toBe('unknown'); // Should end train journey
  });
});