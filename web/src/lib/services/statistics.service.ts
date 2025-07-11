import { supabase } from '$lib/core/supabase/client';
import { detectMode } from '$lib/utils/transport-mode';

interface StatisticsData {
  totalDistance: string;
  earthCircumferences: number;
  locationsVisited: string;
  timeSpent: string;
  geopoints: number;
  steps: number;
  uniquePlaces: number;
  countriesVisited: number;
  activity: Array<{
    label: string;
    distance: number;
    locations: number;
  }>;
  transport: Array<{
    mode: string;
    distance: number;
    percentage: number;
    time: number;
  }>;
  trainStationVisits: { name: string, count: number }[];
  countryTimeDistribution: { country_code: string, timeMs: number, percent: number }[];
  visitedPlaces: number;
  timeSpentMoving: string;
}

export class StatisticsService {
  private supabase: typeof supabase;

  constructor() {
    console.log('[StatisticsService] Initializing with authenticated client');
    // Use the authenticated client from the auth store
    this.supabase = supabase;
  }

  async calculateStatistics(startDate?: string, endDate?: string): Promise<StatisticsData> {
    try {
      // Fetch all relevant tracker_data in a single query
      let trackerQuery = this.supabase
        .from('tracker_data')
        .select('location, recorded_at, country_code, reverse_geocode')
        .order('recorded_at', { ascending: true });

      if (startDate) {
        trackerQuery = trackerQuery.gte('recorded_at', startDate);
      }
      if (endDate) {
        trackerQuery = trackerQuery.lte('recorded_at', endDate + ' 23:59:59');
      }

      const { data: trackerData, error } = await trackerQuery;
      if (error) throw error;

      return this.processStatistics((trackerData || []) as Array<{
        location: { coordinates: { lat: number; lng: number }; altitude?: number; accuracy?: number };
        recorded_at: string;
        country_code?: string;
        reverse_geocode?: { city?: string; display_name?: string; amenity?: string; name?: string };
      }>);
    } catch (error) {
      console.error('Error calculating statistics:', error);
      throw error;
    }
  }

  private processStatistics(trackerData: Array<{
    location: { coordinates: { lat: number; lng: number }; altitude?: number; accuracy?: number };
    recorded_at: string;
    country_code?: string;
    reverse_geocode?: { city?: string; display_name?: string; amenity?: string; name?: string };
  }>): StatisticsData {
    // Compute all metrics from trackerData
    let totalDistance = 0;
    let timeSpentMoving = 0;
    const geopoints = trackerData.length;
    const countryTimeDistribution: { country_code: string, timeMs: number, percent: number }[] = [];
    let countriesVisited = 0;
    let visitedPlaces = 0;
    const byCountry: Record<string, Date[]> = {};
    const uniqueCountries = new Set<string>();
    const uniqueCities = new Set<string>();
    const uniquePlaces = new Set<string>();
    const transportModes: Record<string, { distance: number; time: number }> = {};
    const activityData: Array<{ label: string; distance: number; locations: number }> = [];
    const trainStationVisits: { name: string, count: number }[] = [];
    const stationVisits = new Map<string, number[]>();

    // Process each tracker point
    for (let i = 0; i < trackerData.length; i++) {
      const point = trackerData[i];
      const nextPoint = trackerData[i + 1];

      // Calculate distance to next point
      if (nextPoint && point.location && nextPoint.location) {
        const distance = this.haversineDistance(
          point.location.coordinates.lat,
          point.location.coordinates.lng,
          nextPoint.location.coordinates.lat,
          nextPoint.location.coordinates.lng
        );
        totalDistance += distance;

        // Calculate time between points
        const timeDiff = new Date(nextPoint.recorded_at).getTime() - new Date(point.recorded_at).getTime();
        if (timeDiff > 0 && timeDiff < 3600000) { // Less than 1 hour
          timeSpentMoving += timeDiff;
        }

        // Detect transport mode using the haversine function directly
        const mode = detectMode(
          point.location.coordinates.lat,
          point.location.coordinates.lng,
          nextPoint.location.coordinates.lat,
          nextPoint.location.coordinates.lng,
          timeDiff / 1000 // Convert to seconds
        );
        if (!transportModes[mode]) {
          transportModes[mode] = { distance: 0, time: 0 };
        }
        transportModes[mode].distance += distance;
        transportModes[mode].time += timeDiff;
      }

      // Track countries and places
      if (point.country_code) {
        uniqueCountries.add(point.country_code);
        if (!byCountry[point.country_code]) {
          byCountry[point.country_code] = [];
        }
        byCountry[point.country_code].push(new Date(point.recorded_at));
      }

      if (point.reverse_geocode?.city) {
        uniqueCities.add(point.reverse_geocode.city);
      }

      if (point.reverse_geocode?.display_name) {
        uniquePlaces.add(point.reverse_geocode.display_name);
      }

      // Track train station visits
      if (point.reverse_geocode?.amenity === 'train_station') {
        const stationName = point.reverse_geocode.name || point.reverse_geocode.display_name;
        if (stationName) {
          if (!stationVisits.has(stationName)) {
            stationVisits.set(stationName, []);
          }
          stationVisits.get(stationName)!.push(new Date(point.recorded_at).getTime());
        }
      }
    }

    // Calculate country time distribution
    const totalTime = trackerData.length > 1
      ? new Date(trackerData[trackerData.length - 1].recorded_at).getTime() - new Date(trackerData[0].recorded_at).getTime()
      : 0;

    for (const [countryCode, timestamps] of Object.entries(byCountry)) {
      if (timestamps.length > 1) {
        const timeInCountry = timestamps[timestamps.length - 1].getTime() - timestamps[0].getTime();
        const percent = totalTime > 0 ? (timeInCountry / totalTime) * 100 : 0;
        countryTimeDistribution.push({
          country_code: countryCode,
          timeMs: timeInCountry,
          percent: Math.round(percent * 100) / 100
        });
      }
    }

    // Sort by time spent
    countryTimeDistribution.sort((a, b) => b.timeMs - a.timeMs);

    // Calculate transport statistics
    const totalTransportDistance = Object.values(transportModes).reduce((sum, mode) => sum + mode.distance, 0);
    const transport = Object.entries(transportModes).map(([mode, data]) => ({
      mode,
      distance: Math.round(data.distance / 1000 * 100) / 100, // Convert to km
      percentage: totalTransportDistance > 0 ? Math.round((data.distance / totalTransportDistance) * 100) : 0,
      time: Math.round(data.time / 1000) // Convert to seconds
    }));

    // Sort transport by distance
    transport.sort((a, b) => b.distance - a.distance);

    // Calculate activity data (simplified)
    activityData.push({
      label: 'Total Distance',
      distance: Math.round(totalDistance / 1000 * 100) / 100,
      locations: uniquePlaces.size
    });

    // Calculate train station visits
    for (const [stationName, timestamps] of stationVisits.entries()) {
      // Sort by time
      timestamps.sort((a, b) => a - b);

      // Count visits, skipping points within 1 hour of previous
      let count = 0;
      let lastVisit = -Infinity;
      for (const timestamp of timestamps) {
        if (timestamp - lastVisit > 3600 * 1000) { // 1 hour in milliseconds
          count++;
          lastVisit = timestamp;
        }
      }

      if (count > 0) {
        trainStationVisits.push({ name: stationName, count });
      }
    }

    // Sort by visit count (descending)
    trainStationVisits.sort((a, b) => b.count - a.count);

    // Calculate final metrics
    const totalDistanceKm = totalDistance / 1000;
    const earthCircumferences = totalDistanceKm / 40075; // Earth circumference in km
    const timeSpentMovingHours = Math.round(timeSpentMoving / (1000 * 60 * 60) * 100) / 100;
    const totalUniquePlaces = uniquePlaces.size;
    countriesVisited = uniqueCountries.size;
    visitedPlaces = uniquePlaces.size;

    // Calculate steps from walking distance
    const walking = transport.find(t => t.mode === 'walking');
    const steps = walking ? Math.round(walking.distance * 1000 / 0.7) : 0;

    return {
      totalDistance: isFinite(totalDistanceKm)
        ? (totalDistanceKm >= 1000
            ? `${(totalDistanceKm / 1000).toFixed(1)}k km`
            : `${totalDistanceKm.toFixed(1)} km`)
        : '0 km',
      earthCircumferences: earthCircumferences,
      locationsVisited: totalUniquePlaces.toString(),
      timeSpent: `${Math.round(totalTime / (1000 * 60 * 60 * 24))} days`,
      timeSpentMoving: `${timeSpentMovingHours}h`,
      geopoints: geopoints || 0,
      steps,
      uniquePlaces: totalUniquePlaces,
      countriesVisited,
      activity: activityData,
      transport: transport,
      countryTimeDistribution,
      visitedPlaces,
      trainStationVisits
    };
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // metres
    const toRad = (x: number) => (x * Math.PI) / 180;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // in metres
  }
}