import { createClient } from '@supabase/supabase-js';
import type { Database } from '$lib/core/supabase/types';

type PoiVisit = Database['public']['Tables']['poi_visits']['Row'];
type TrackerData = Database['public']['Tables']['tracker_data']['Row'];
type PointOfInterest = Database['public']['Tables']['points_of_interest']['Row'];

interface VisitDetectionConfig {
  minDwellMinutes: number;
  maxDistanceMeters: number;
  minConsecutivePoints: number;
  lookbackDays: number;
}

export class PoiVisitDetectionService {
  private supabase = createClient<Database>(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  /**
   * Detect POI visits for a specific user
   */
  async detectVisitsForUser(
    userId: string,
    config: Partial<VisitDetectionConfig> = {}
  ): Promise<{ visits: PoiVisit[]; totalDetected: number }> {
    const defaultConfig: VisitDetectionConfig = {
      minDwellMinutes: 15,
      maxDistanceMeters: 100,
      minConsecutivePoints: 3,
      lookbackDays: 7
    };

    const finalConfig = { ...defaultConfig, ...config };

    try {
      // Get user's POIs
      const { data: pois, error: poisError } = await this.supabase
        .from('points_of_interest')
        .select('*')
        .eq('user_id', userId);

      if (poisError) throw poisError;
      if (!pois || pois.length === 0) {
        return { visits: [], totalDetected: 0 };
      }

      // Get recent tracker data
      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - finalConfig.lookbackDays);

      const { data: trackerData, error: trackerError } = await this.supabase
        .from('tracker_data')
        .select('*')
        .eq('user_id', userId)
        .gte('recorded_at', lookbackDate.toISOString())
        .order('recorded_at', { ascending: true });

      if (trackerError) throw trackerError;
      if (!trackerData || trackerData.length === 0) {
        return { visits: [], totalDetected: 0 };
      }

      // Detect visits
      const visits = await this.detectVisits(trackerData, pois, finalConfig);

      // Store detected visits
      const storedVisits = await this.storeVisits(visits);

      return {
        visits: storedVisits,
        totalDetected: visits.length
      };

    } catch (error) {
      console.error('Error detecting POI visits:', error);
      throw error;
    }
  }

  /**
   * Detect POI visits for all users
   */
  async detectVisitsForAllUsers(
    config: Partial<VisitDetectionConfig> = {}
  ): Promise<{ userId: string; visits: PoiVisit[]; totalDetected: number }[]> {
    try {
      // Get all users with POIs
      const { data: usersWithPois, error } = await this.supabase
        .from('points_of_interest')
        .select('user_id')
        .not('user_id', 'is', null);

      if (error) throw error;

      const uniqueUserIds = [...new Set(usersWithPois.map(p => p.user_id))];
      const results = [];

      for (const userId of uniqueUserIds) {
        try {
          const result = await this.detectVisitsForUser(userId, config);
          results.push({
            userId,
            visits: result.visits,
            totalDetected: result.totalDetected
          });
        } catch (error) {
          console.error(`Error detecting visits for user ${userId}:`, error);
          results.push({
            userId,
            visits: [],
            totalDetected: 0
          });
        }
      }

      return results;

    } catch (error) {
      console.error('Error detecting POI visits for all users:', error);
      throw error;
    }
  }

  /**
   * Get visit statistics for a user
   */
  async getVisitStatistics(userId: string, days: number = 30): Promise<{
    totalVisits: number;
    uniquePois: number;
    totalDuration: number;
    averageDuration: number;
    mostVisitedPoi: string | null;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data: visits, error } = await this.supabase
        .from('poi_visits')
        .select(`
          *,
          points_of_interest(name)
        `)
        .eq('user_id', userId)
        .gte('visit_start', startDate.toISOString());

      if (error) throw error;

      if (!visits || visits.length === 0) {
        return {
          totalVisits: 0,
          uniquePois: 0,
          totalDuration: 0,
          averageDuration: 0,
          mostVisitedPoi: null
        };
      }

      const uniquePois = new Set(visits.map(v => v.poi_id)).size;
      const totalDuration = visits.reduce((sum, v) => sum + v.duration_minutes, 0);
      const averageDuration = totalDuration / visits.length;

      // Find most visited POI
      const poiCounts = visits.reduce((acc, visit) => {
        const poiName = (visit.points_of_interest as any)?.name || 'Unknown';
        acc[poiName] = (acc[poiName] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const mostVisitedPoi = Object.entries(poiCounts)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || null;

      return {
        totalVisits: visits.length,
        uniquePois,
        totalDuration,
        averageDuration,
        mostVisitedPoi
      };

    } catch (error) {
      console.error('Error getting visit statistics:', error);
      throw error;
    }
  }

  /**
   * Core visit detection algorithm
   */
  private async detectVisits(
    trackerData: TrackerData[],
    pois: PointOfInterest[],
    config: VisitDetectionConfig
  ): Promise<Omit<PoiVisit, 'id' | 'created_at' | 'updated_at'>[]> {
    const visits: Omit<PoiVisit, 'id' | 'created_at' | 'updated_at'>[] = [];

    for (const poi of pois) {
      if (!poi.location) continue;

      const poiVisits = this.findDwellPeriods(trackerData, poi, config);
      visits.push(...poiVisits);
    }

    return visits;
  }

  /**
   * Find dwell periods for a specific POI
   */
  private findDwellPeriods(
    trackerData: TrackerData[],
    poi: PointOfInterest,
    config: VisitDetectionConfig
  ): Omit<PoiVisit, 'id' | 'created_at' | 'updated_at'>[] {
    const visits: Omit<PoiVisit, 'id' | 'created_at' | 'updated_at'>[] = [];
    const poiLocation = poi.location as any;

    if (!poiLocation) return visits;

    let currentDwellStart: TrackerData | null = null;
    let consecutivePoints = 0;

    for (const point of trackerData) {
      if (!point.location) continue;

      const distance = this.calculateDistance(point.location as any, poiLocation);
      const isNearPoi = distance <= config.maxDistanceMeters;

      if (isNearPoi) {
        consecutivePoints++;
        if (!currentDwellStart) {
          currentDwellStart = point;
        }
      } else {
        // Check if we had a valid dwell period
        if (currentDwellStart && consecutivePoints >= config.minConsecutivePoints) {
          const dwellDuration = this.calculateDurationMinutes(currentDwellStart.recorded_at, point.recorded_at);

          if (dwellDuration >= config.minDwellMinutes) {
            visits.push({
              user_id: point.user_id,
              poi_id: poi.id,
              visit_start: currentDwellStart.recorded_at,
              visit_end: point.recorded_at,
              duration_minutes: dwellDuration,
              location: poiLocation,
              address: poi.address,
              confidence_score: this.calculateConfidenceScore(consecutivePoints, dwellDuration),
              visit_type: 'detected',
              notes: `Detected automatically with ${consecutivePoints} consecutive points`
            });
          }
        }

        // Reset dwell tracking
        currentDwellStart = null;
        consecutivePoints = 0;
      }
    }

    // Handle case where dwell period extends to the end of the data
    if (currentDwellStart && consecutivePoints >= config.minConsecutivePoints) {
      const lastPoint = trackerData[trackerData.length - 1];
      const dwellDuration = this.calculateDurationMinutes(currentDwellStart.recorded_at, lastPoint.recorded_at);

      if (dwellDuration >= config.minDwellMinutes) {
        visits.push({
          user_id: lastPoint.user_id,
          poi_id: poi.id,
          visit_start: currentDwellStart.recorded_at,
          visit_end: lastPoint.recorded_at,
          duration_minutes: dwellDuration,
          location: poiLocation,
          address: poi.address,
          confidence_score: this.calculateConfidenceScore(consecutivePoints, dwellDuration),
          visit_type: 'detected',
          notes: `Detected automatically with ${consecutivePoints} consecutive points`
        });
      }
    }

    return visits;
  }

  /**
   * Store detected visits in the database
   */
  private async storeVisits(
    visits: Omit<PoiVisit, 'id' | 'created_at' | 'updated_at'>[]
  ): Promise<PoiVisit[]> {
    if (visits.length === 0) return [];

    try {
      const { data, error } = await this.supabase
        .from('poi_visits')
        .insert(visits)
        .select()
        .onConflict('user_id,poi_id,visit_start')
        .ignore();

      if (error) throw error;
      return data || [];

    } catch (error) {
      console.error('Error storing visits:', error);
      throw error;
    }
  }

  /**
   * Calculate distance between two points in meters
   */
  private calculateDistance(point1: any, point2: any): number {
    if (!point1 || !point2) return Infinity;

    const lat1 = point1.coordinates?.lat || point1.lat;
    const lng1 = point1.coordinates?.lng || point1.lng;
    const lat2 = point2.coordinates?.lat || point2.lat;
    const lng2 = point2.coordinates?.lng || point2.lng;

    if (!lat1 || !lng1 || !lat2 || !lng2) return Infinity;

    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Calculate duration between two timestamps in minutes
   */
  private calculateDurationMinutes(startTime: string, endTime: string): number {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
  }

  /**
   * Calculate confidence score based on consecutive points and duration
   */
  private calculateConfidenceScore(consecutivePoints: number, durationMinutes: number): number {
    // Base confidence on consecutive points (0.3-0.7) and duration (0.2-0.3)
    const pointsScore = Math.min(consecutivePoints / 10, 0.7) + 0.3;
    const durationScore = Math.min(durationMinutes / 60, 0.3) + 0.2;

    return Math.min(pointsScore + durationScore, 1.0);
  }
}