import { createClient } from '@supabase/supabase-js';

interface LocationData {
  type: string;
  coordinates: number[];
}

interface DiscoveredPOI {
  name: string;
  type: string;
  category: string;
  location: LocationData;
  address: string;
  country_code: string;
  visit_count: number;
  first_visit: string;
  last_visit: string;
}

interface VisitDetectionConfig {
  minDwellMinutes: number;
  maxDistanceMeters: number;
  minConsecutivePoints: number;
  lookbackDays: number;
  minVisitDuration: number;
  poiDiscoveryRadius: number;
}

interface TrackerDataPoint {
  user_id: string;
  location: { type: string; coordinates: number[] };
  reverse_geocode: string | GeocodeData | null;
  recorded_at: string;
  country_code?: string;
}

interface GeocodeData {
  type?: string;
  class?: string;
  cuisine?: string;
  shop?: string;
  tourism?: string;
  leisure?: string;
  name?: string;
  address: AddressData;
}

interface AddressData {
  house_number?: string;
  road?: string;
  suburb?: string;
  city?: string;
  state?: string;
  country?: string;
  name?: string;
  station?: string;
}


export class EnhancedPoiDetectionService {
  private supabase = createClient(
    'http://127.0.0.1:54321',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  );

  /**
   * Discover POIs and update their statistics for a user
   */
  async detectVisitsForUser(
    userId: string,
    config: Partial<VisitDetectionConfig> = {}
  ): Promise<{
    visits: Array<{
      startTime: string;
      endTime: string;
      poi: DiscoveredPOI;
    }>;
    pois: DiscoveredPOI[];
    totalDetected: number
  }> {
    const defaultConfig: VisitDetectionConfig = {
      minDwellMinutes: 15,
      maxDistanceMeters: 100,
      minConsecutivePoints: 3,
      lookbackDays: 7,
      minVisitDuration: 10,
      poiDiscoveryRadius: 50
    };

    const finalConfig = { ...defaultConfig, ...config };

    try {
      // Get recent tracker data with reverse geocoding
      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - finalConfig.lookbackDays);

      const { data: trackerData, error: trackerError } = await this.supabase
        .from('tracker_data')
        .select('*')
        .eq('user_id', userId)
        .not('reverse_geocode', 'is', null)
        .gte('recorded_at', lookbackDate.toISOString())
        .order('recorded_at', { ascending: true });

      if (trackerError) throw trackerError;
      if (!trackerData || trackerData.length === 0) {
        return { visits: [], pois: [], totalDetected: 0 };
      }

      // Discover POIs from the data
      const pois = await this.discoverPOIsFromTrackerData(trackerData, finalConfig);

      if (pois.length === 0) {
        return { visits: [], pois: [], totalDetected: 0 };
      }

      // Create or update POIs in the database with visit statistics
      const updatedPois = await this.createOrUpdatePOIsWithStats(pois, userId, trackerData, finalConfig);

      return {
        visits: [], // You can implement visit detection logic here if needed
        pois: updatedPois,
        totalDetected: pois.length
      };

    } catch (error) {
      console.error('Error detecting POI visits:', error);
      throw error;
    }
  }

  /**
   * Discover POIs from tracker data
   */
  private async discoverPOIsFromTrackerData(
    trackerData: TrackerDataPoint[],
    config: VisitDetectionConfig
  ): Promise<DiscoveredPOI[]> {
    const poiGroups = new Map<string, DiscoveredPOI>();

    for (const point of trackerData) {
      if (!point.reverse_geocode || !point.location) continue;

      try {
        const geocode = typeof point.reverse_geocode === 'string'
          ? JSON.parse(point.reverse_geocode)
          : point.reverse_geocode;

        if (!geocode || !geocode.address) continue;

        // Extract POI information
        const poiInfo = this.extractPOIInfo(geocode, point);
        if (!poiInfo) continue;

        // Create a unique key for this POI
        const poiKey = this.createPOIKey(poiInfo, point.country_code || '');

        // Check if we already have this POI or a nearby one
        const existingPOI = this.findNearbyPOI(poiGroups, poiInfo, config.poiDiscoveryRadius);

        if (existingPOI) {
          // Update existing POI
          const existing = poiGroups.get(existingPOI)!;
          existing.visit_count++;
          existing.last_visit = point.recorded_at;

          // Update location to average position
          existing.location = this.averageLocation(existing.location, poiInfo.location);
        } else {
          // Create new POI
          poiGroups.set(poiKey, {
            ...poiInfo,
            visit_count: 1,
            first_visit: point.recorded_at,
            last_visit: point.recorded_at,
            country_code: point.country_code || ''
          });
        }

      } catch {
        // Ignore parsing errors
        continue;
      }
    }

    // Filter POIs based on visit frequency and convert to array
    const pois = Array.from(poiGroups.values())
      .filter(poi => poi.visit_count >= 2) // Only POIs visited at least twice
      .sort((a, b) => b.visit_count - a.visit_count);

    return pois;
  }

  /**
   * Extract POI information from geocoded data
   */
  private extractPOIInfo(geocode: GeocodeData, point: TrackerDataPoint): DiscoveredPOI | null {
    // Determine POI type and category
    let type = 'unknown';
    let category = 'other';
    let name = '';

    // Check for specific POI types
    if (geocode.type === 'railway_station' || geocode.class === 'railway') {
      type = 'transport';
      category = 'train_station';
      name = geocode.address.name || geocode.address.station || 'Train Station';
    } else if (geocode.type === 'restaurant' || geocode.cuisine) {
      type = 'food';
      category = 'restaurant';
      name = geocode.address.name || geocode.name || 'Restaurant';
    } else if (geocode.type === 'cafe') {
      type = 'food';
      category = 'cafe';
      name = geocode.address.name || geocode.name || 'Cafe';
    } else if (geocode.type === 'shop' || geocode.shop) {
      type = 'shopping';
      category = 'shop';
      name = geocode.address.name || geocode.name || 'Shop';
    } else if (geocode.type === 'hotel' || geocode.tourism === 'hotel') {
      type = 'accommodation';
      category = 'hotel';
      name = geocode.address.name || geocode.name || 'Hotel';
    } else if (geocode.type === 'museum' || geocode.tourism === 'museum') {
      type = 'culture';
      category = 'museum';
      name = geocode.address.name || geocode.name || 'Museum';
    } else if (geocode.type === 'park' || geocode.leisure === 'park') {
      type = 'recreation';
      category = 'park';
      name = geocode.address.name || geocode.name || 'Park';
    } else if (geocode.name && geocode.name !== geocode.address.city) {
      // Generic named place
      type = 'place';
      category = 'landmark';
      name = geocode.name;
    } else {
      // Skip generic locations without specific names
      return null;
    }

    // Extract location coordinates
    const location = point.location;
    if (!location || !location.coordinates) {
      return null;
    }

    // Create address string
    const address = this.createAddressString(geocode.address);

    return {
      name,
      type,
      category,
      location,
      address,
      country_code: point.country_code || '',
      visit_count: 0,
      first_visit: '',
      last_visit: ''
    };
  }

  /**
   * Create or update POIs in the database with visit statistics
   */
  private async createOrUpdatePOIsWithStats(
    pois: DiscoveredPOI[],
    userId: string,
    trackerData: TrackerDataPoint[],
    config: VisitDetectionConfig
  ): Promise<DiscoveredPOI[]> {
    const updatedPois: DiscoveredPOI[] = [];

    for (const poi of pois) {
      // Calculate visit statistics for this POI
      const visitStats = this.calculateVisitStats(trackerData, poi, config);

      // Check if POI already exists in tracker_data
      const { data: existingPoi } = await this.supabase
        .from('tracker_data')
        .select('*')
        .eq('user_id', userId)
        .eq('tracker_type', 'import')
        .eq('raw_data->>name', poi.name)
        .eq('raw_data->>category', poi.category)
        .eq('raw_data->>data_type', 'poi')
        .single();

      if (existingPoi) {
        // Update existing POI with new statistics in raw_data
        const existingRawData = existingPoi.raw_data as Record<string, unknown> || {};
        const updatedRawData = {
          ...existingRawData,
          visit_count: (existingRawData.visit_count as number || 0) + visitStats.visit_count,
          first_visit: existingRawData.first_visit || visitStats.first_visit,
          last_visit: visitStats.last_visit || existingRawData.last_visit,
          total_visit_duration_minutes: (existingRawData.total_visit_duration_minutes as number || 0) + visitStats.total_duration_minutes,
          average_visit_duration_minutes: this.calculateAverageDuration(
            (existingRawData.total_visit_duration_minutes as number || 0) + visitStats.total_duration_minutes,
            (existingRawData.visit_count as number || 0) + visitStats.visit_count
          )
        };

        const { error } = await this.supabase
          .from('tracker_data')
          .update({
            raw_data: updatedRawData,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingPoi.id);

        if (error) {
          console.error('Error updating POI:', error);
        } else {
          updatedPois.push({
            ...poi,
            visit_count: (existingRawData.visit_count as number || 0) + visitStats.visit_count,
            first_visit: existingRawData.first_visit as string || visitStats.first_visit,
            last_visit: visitStats.last_visit || existingRawData.last_visit as string
          });
        }
      } else {
        // Create new POI with initial statistics in tracker_data
        const { error } = await this.supabase
          .from('tracker_data')
          .insert({
            user_id: userId,
            tracker_type: 'import',
            location: `POINT(${poi.location.coordinates[0]} ${poi.location.coordinates[1]})`,
            recorded_at: visitStats.first_visit || new Date().toISOString(),
            country_code: poi.country_code,
            raw_data: {
              name: poi.name,
              category: poi.category,
              address: poi.address,
              data_type: 'poi',
              poi_type: 'detected',
              discovery_source: 'reverse_geocode',
              confidence_score: 0.8,
              visit_count: visitStats.visit_count,
              first_visit: visitStats.first_visit,
              last_visit: visitStats.last_visit,
              total_visit_duration_minutes: visitStats.total_duration_minutes,
              average_visit_duration_minutes: visitStats.average_duration_minutes
            },
            created_at: new Date().toISOString()
          })
          .select('*')
          .single();

        if (error) {
          console.error('Error creating POI:', error);
        } else {
          updatedPois.push({
            ...poi,
            visit_count: visitStats.visit_count,
            first_visit: visitStats.first_visit,
            last_visit: visitStats.last_visit
          });
        }
      }
    }

    return updatedPois;
  }

  /**
   * Calculate visit statistics for a POI
   */
  private calculateVisitStats(
    trackerData: TrackerDataPoint[],
    poi: DiscoveredPOI,
    config: VisitDetectionConfig
  ): {
    visit_count: number;
    first_visit: string;
    last_visit: string;
    total_duration_minutes: number;
    average_duration_minutes: number;
  } {
    const visits = this.findDwellPeriods(trackerData, poi, config);

    if (visits.length === 0) {
      return {
        visit_count: 0,
        first_visit: '',
        last_visit: '',
        total_duration_minutes: 0,
        average_duration_minutes: 0
      };
    }

    const totalDuration = visits.reduce((sum, visit) => sum + visit.duration_minutes, 0);
    const firstVisit = visits[0].visit_start;
    const lastVisit = visits[visits.length - 1].visit_end;

    return {
      visit_count: visits.length,
      first_visit: firstVisit,
      last_visit: lastVisit,
      total_duration_minutes: totalDuration,
      average_duration_minutes: totalDuration / visits.length
    };
  }

  /**
   * Find dwell periods for a specific POI
   */
  private findDwellPeriods(
    trackerData: TrackerDataPoint[],
    poi: DiscoveredPOI,
    config: VisitDetectionConfig
  ): Array<{
    visit_start: string;
    visit_end: string;
    duration_minutes: number;
  }> {
    const visits: Array<{
      visit_start: string;
      visit_end: string;
      duration_minutes: number;
    }> = [];

    let currentDwellStart: TrackerDataPoint | null = null;
    let consecutivePoints = 0;

    for (const point of trackerData) {
      if (!point.location) continue;

      const distance = this.calculateDistance(
        poi.location.coordinates[1], // poi lat
        poi.location.coordinates[0], // poi lng
        point.location.coordinates[1], // point lat
        point.location.coordinates[0]  // point lng
      );

      const isNearPoi = distance <= config.maxDistanceMeters;

      if (isNearPoi) {
        consecutivePoints++;
        if (!currentDwellStart) {
          currentDwellStart = point;
        }
      } else {
        // Check if we had a valid dwell period
        if (currentDwellStart && consecutivePoints >= config.minConsecutivePoints) {
          const dwellDuration = this.calculateDurationMinutes(
            currentDwellStart.recorded_at,
            point.recorded_at
          );

          if (dwellDuration >= config.minDwellMinutes) {
            visits.push({
              visit_start: currentDwellStart.recorded_at,
              visit_end: point.recorded_at,
              duration_minutes: dwellDuration
            });
          }
        }

        // Reset for next potential dwell period
        currentDwellStart = null;
        consecutivePoints = 0;
      }
    }

    return visits;
  }

  // Helper methods
  private createPOIKey(poi: DiscoveredPOI, countryCode: string): string {
    return `${poi.name}|${poi.type}|${poi.category}|${countryCode}`;
  }

  private findNearbyPOI(
    poiGroups: Map<string, DiscoveredPOI>,
    newPOI: DiscoveredPOI,
    radiusMeters: number
  ): string | null {
    for (const [key, existingPOI] of poiGroups.entries()) {
      if (existingPOI.name === newPOI.name &&
          existingPOI.type === newPOI.type &&
          existingPOI.category === newPOI.category) {
        return key;
      }

      // Check distance between POIs
      const distance = this.calculateDistance(
        existingPOI.location.coordinates[1], // lat
        existingPOI.location.coordinates[0], // lng
        newPOI.location.coordinates[1], // lat
        newPOI.location.coordinates[0]  // lng
      );

      if (distance <= radiusMeters) {
        return key;
      }
    }

    return null;
  }

  private averageLocation(loc1: { type: string; coordinates: number[] }, loc2: { type: string; coordinates: number[] }): { type: string; coordinates: number[] } {
    const avgLat = (loc1.coordinates[1] + loc2.coordinates[1]) / 2;
    const avgLng = (loc1.coordinates[0] + loc2.coordinates[0]) / 2;

    return {
      type: 'Point',
      coordinates: [avgLng, avgLat]
    };
  }

  private createAddressString(address: AddressData): string {
    const parts = [
      address.house_number,
      address.road,
      address.suburb,
      address.city,
      address.state,
      address.country
    ].filter(Boolean);

    return parts.join(', ');
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  }

  private calculateDurationMinutes(startTime: string, endTime: string): number {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    return Math.round((end - start) / (1000 * 60));
  }

  private calculateConfidenceScore(consecutivePoints: number, durationMinutes: number): number {
    const pointScore = Math.min(consecutivePoints / 10, 1);
    const durationScore = Math.min(durationMinutes / 60, 1);

    return Math.round((pointScore * 0.6 + durationScore * 0.4) * 100) / 100;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private calculateAverageDuration(totalDuration: number, visitCount: number): number {
    return visitCount > 0 ? totalDuration / visitCount : 0;
  }
}