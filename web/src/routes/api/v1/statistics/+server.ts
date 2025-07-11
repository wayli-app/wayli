import type { RequestHandler } from '@sveltejs/kit';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { detectMode, detectTrainMode } from '$lib/utils/transport-mode';
import type { ModeContext } from '$lib/utils/transport-mode';

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
}

export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    // Get current user from session
    const session = await locals.getSession();
    if (!session) {
      return errorResponse('User not authenticated', 401);
    }

    const user = session.user;
    const searchParams = url.searchParams;

    // Parse date range parameters
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Create admin client with service role key
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all relevant tracker_data in a single query
    let trackerData: Array<{ location: { coordinates: { lat: number; lng: number } }; recorded_at: string; country_code?: string; reverse_geocode?: unknown }> = [];
    try {
      let trackerQuery = supabaseAdmin
        .from('tracker_data')
        .select('location, recorded_at, country_code, reverse_geocode')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: true });
      if (startDate) {
        trackerQuery = trackerQuery.gte('recorded_at', startDate);
      }
      if (endDate) {
        trackerQuery = trackerQuery.lte('recorded_at', endDate + ' 23:59:59');
      }
      const { data, error } = await trackerQuery;
      if (!error && data) {
        trackerData = data;
      }
    } catch {
      // ignore
    }

    // Compute all metrics from trackerData
    let totalDistance = 0;
    let timeSpentMoving = 0;
    const geopoints = trackerData.length;
    let countryTimeDistribution: { country_code: string, timeMs: number, percent: number }[] = [];
    let countriesVisited = 0;
    let visitedPlaces = 0;
    const byCountry: Record<string, Date[]> = {};
    const uniqueCountries = new Set<string>();
    const uniqueCities = new Set<string>();
    for (let i = 0; i < trackerData.length; i++) {
      const row = trackerData[i];
      // Country distribution
      if (row.country_code && row.recorded_at) {
        if (!byCountry[row.country_code]) byCountry[row.country_code] = [];
        byCountry[row.country_code].push(new Date(row.recorded_at));
        uniqueCountries.add(row.country_code);
      }
      // Visited places (unique cities)
      if (row.reverse_geocode) {
        let geo;
        try {
          geo = typeof row.reverse_geocode === 'string' ? JSON.parse(row.reverse_geocode) : row.reverse_geocode;
        } catch {
          continue;
        }
        if (geo && geo.address && geo.address.city) {
          uniqueCities.add(geo.address.city);
        }
      }
    }
    countriesVisited = uniqueCountries.size;
    visitedPlaces = uniqueCities.size;
    // Country time distribution
    let totalTimeMs = 0;
    const countryTimes: { country_code: string, timeMs: number }[] = [];
    for (const [country_code, dates] of Object.entries(byCountry)) {
      if (dates.length > 1) {
        dates.sort((a, b) => a.getTime() - b.getTime());
        const timeMs = dates[dates.length - 1].getTime() - dates[0].getTime();
        countryTimes.push({ country_code, timeMs });
        totalTimeMs += timeMs;
      } else {
        countryTimes.push({ country_code, timeMs: 0 });
      }
    }
    if (totalTimeMs === 0 && startDate && endDate) {
      totalTimeMs = new Date(endDate + 'T23:59:59').getTime() - new Date(startDate + 'T00:00:00').getTime();
    }
    countryTimeDistribution = countryTimes.map(({ country_code, timeMs }) => ({
      country_code,
      timeMs,
      percent: totalTimeMs > 0 ? Math.round((timeMs / totalTimeMs) * 1000) / 10 : 0
    })).sort((a, b) => b.percent - a.percent);
    // Distance, time moving, and transport mode detection
    const modeStats: Record<string, { distance: number; time: number }> = {};

    // Enhanced train detection with velocity-based continuity
    const modeContext: ModeContext = {};

    for (let i = 1; i < trackerData.length; i++) {
      const prev = trackerData[i - 1];
      const curr = trackerData[i];
      const prevCoords = prev.location.coordinates;
      const currCoords = curr.location.coordinates;
      if (
        !Array.isArray(prevCoords) || prevCoords.length < 2 ||
        !Array.isArray(currCoords) || currCoords.length < 2
      ) {
        continue;
      }
      const [prevLng, prevLat] = prevCoords;
      const [currLng, currLat] = currCoords;
      if (
        typeof prevLat !== 'number' || typeof prevLng !== 'number' ||
        typeof currLat !== 'number' || typeof currLng !== 'number' ||
        isNaN(prevLat) || isNaN(prevLng) || isNaN(currLat) || isNaN(currLng)
      ) {
        continue;
      }
      const dt = (new Date(curr.recorded_at).getTime() - new Date(prev.recorded_at).getTime()) / 1000; // seconds
      if (dt <= 0) continue;

      // Haversine distance in meters
      const toRad = (x: number) => x * Math.PI / 180;
      const R = 6371e3;
      const φ1 = toRad(prevLat);
      const φ2 = toRad(currLat);
      const Δφ = toRad(currLat - prevLat);
      const Δλ = toRad(currLng - prevLng);
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c; // meters
      if (!isFinite(distance) || isNaN(distance)) continue;
      totalDistance += distance;
      const speed = distance / dt; // m/s
      if (speed > 0.833) {
        timeSpentMoving += dt;
      }

      // Check if current point is at a railway location
      let atTrainLocation = false;
      if (curr.reverse_geocode) {
        try {
          const geocode = typeof curr.reverse_geocode === 'string' ? JSON.parse(curr.reverse_geocode) : curr.reverse_geocode;
          if (
            (geocode && geocode.type === 'railway_station') ||
            (geocode && geocode.class === 'railway') ||
            (geocode && geocode.type === 'platform') ||
            (geocode && geocode.addresstype === 'railway')
          ) {
            atTrainLocation = true;
          }
        } catch {
          // Ignore parsing errors
        }
      }

      // Use enhanced train detection
      const trainDetection = detectTrainMode(prevLat, prevLng, currLat, currLng, dt, atTrainLocation, modeContext);
      let transport_mode = trainDetection.mode;

      // If not detected as train, use regular mode detection
      if (transport_mode !== 'train') {
        transport_mode = detectMode(prevLat, prevLng, currLat, currLng, dt, modeContext);
      }

      // Track statistics
      if (!modeStats[transport_mode]) modeStats[transport_mode] = { distance: 0, time: 0 };
      modeStats[transport_mode].distance += distance;
      if (speed > 0.833) {
        modeStats[transport_mode].time += dt;
      }
    }

    // 2. Calculate unique places based on reverse geocoded data from tracker_data
    const uniqueLocations = new Set<string>();
    const uniquePOIs = new Set<string>();

    for (const row of trackerData) {
      if (row.reverse_geocode) {
        try {
          const geocode = typeof row.reverse_geocode === 'string'
            ? JSON.parse(row.reverse_geocode)
            : row.reverse_geocode;

          if (geocode && geocode.address) {
            // Create a unique identifier for the location
            const city = geocode.address.city || '';
            const town = geocode.address.town || '';
            const village = geocode.address.village || '';
            const suburb = geocode.address.suburb || '';
            const neighbourhood = geocode.address.neighbourhood || '';

            // Use the most specific location name available
            const locationName = city || town || village || suburb || neighbourhood;

            if (locationName) {
              // Add country code to make it unique globally
              const countryCode = row.country_code || '';
              const uniqueLocationKey = `${locationName}, ${countryCode}`;
              uniqueLocations.add(uniqueLocationKey);
            }

            // Check if this is a point of interest (specific named places)
            if (geocode.name && geocode.name !== locationName) {
              const poiKey = `${geocode.name}, ${row.country_code || ''}`;
              uniquePOIs.add(poiKey);
            }
          }
        } catch {
          // Ignore parsing errors
        }
      }
    }

    const totalUniquePlaces = uniqueLocations.size + uniquePOIs.size;

    // 3. Calculate total distance from tracker data
    const totalDistanceKm = isFinite(totalDistance / 1000) ? totalDistance / 1000 : 0;

    // 4. Calculate earth circumferences
    const earthCircumference = 40075; // km
    const earthCircumferences = totalDistanceKm / earthCircumference;

    // 5. Calculate time spent (rough calculation: average 5 km/h walking speed)
    const estimatedHours = totalDistanceKm / 5;
    const timeSpent = `${Math.round(estimatedHours)} hrs`;

    // 6. Calculate activity data (last 7 days)
    const activityData = [];
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStart = date.toISOString().split('T')[0];
      const dayEnd = new Date(date.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Count unique locations for this day based on reverse geocoded data
      const dayTrackerData = trackerData.filter(row => {
        const rowDate = row.recorded_at.split('T')[0];
        return rowDate >= dayStart && rowDate < dayEnd;
      });

      const dayUniqueLocations = new Set<string>();
      for (const row of dayTrackerData) {
        if (row.reverse_geocode) {
          try {
            const geocode = typeof row.reverse_geocode === 'string'
              ? JSON.parse(row.reverse_geocode)
              : row.reverse_geocode;

            if (geocode && geocode.address) {
              const city = geocode.address.city || '';
              const town = geocode.address.town || '';
              const village = geocode.address.village || '';
              const suburb = geocode.address.suburb || '';
              const neighbourhood = geocode.address.neighbourhood || '';

              const locationName = city || town || village || suburb || neighbourhood;

              if (locationName) {
                const countryCode = row.country_code || '';
                const uniqueLocationKey = `${locationName}, ${countryCode}`;
                dayUniqueLocations.add(uniqueLocationKey);
              }
            }
          } catch {
            // Ignore parsing errors
          }
        }
      }

      // Calculate distance for this day
      let dayDistance = 0;
      if (dayTrackerData.length > 1) {
        for (let j = 1; j < dayTrackerData.length; j++) {
          const prevPoint = dayTrackerData[j - 1].location;
          const currPoint = dayTrackerData[j].location;

          // Extract coordinates from location objects
          const prevCoords = prevPoint.coordinates;
          const currCoords = currPoint.coordinates;

          if (
            Array.isArray(prevCoords) && prevCoords.length >= 2 &&
            Array.isArray(currCoords) && currCoords.length >= 2
          ) {
            const [prevLng, prevLat] = prevCoords;
            const [currLng, currLat] = currCoords;

            if (
              typeof prevLat === 'number' && typeof prevLng === 'number' &&
              typeof currLat === 'number' && typeof currLng === 'number' &&
              !isNaN(prevLat) && !isNaN(prevLng) && !isNaN(currLat) && !isNaN(currLng)
            ) {
              // Haversine distance calculation
              const toRad = (x: number) => x * Math.PI / 180;
              const R = 6371e3;
              const φ1 = toRad(prevLat);
              const φ2 = toRad(currLat);
              const Δφ = toRad(currLat - prevLat);
              const Δλ = toRad(currLng - prevLng);
              const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              const distance = R * c; // meters
              if (isFinite(distance) && !isNaN(distance)) {
                dayDistance += distance;
              }
            }
          }
        }
      }

      activityData.push({
        label: daysOfWeek[date.getDay()],
        distance: Math.round(dayDistance / 1000 * 10) / 10, // Convert to km and round to 1 decimal
        locations: dayUniqueLocations.size
      });
    }

    // 8. Calculate transport modes (based on activity_type)
    let transportQuery = supabaseAdmin
      .from('tracker_data')
      .select('activity_type, location')
      .eq('user_id', user.id)
      .not('activity_type', 'is', null);

    if (startDate) {
      transportQuery = transportQuery.gte('recorded_at', startDate);
    }
    if (endDate) {
      transportQuery = transportQuery.lte('recorded_at', endDate + ' 23:59:59');
    }

    const { data: transportData, error: transportError } = await transportQuery;

    const transportModes = new Map<string, { distance: number; count: number }>();

    if (!transportError && transportData && transportData.length > 1) {
      // Group by activity type and calculate distances
      for (let i = 1; i < transportData.length; i++) {
        const prevPoint = transportData[i - 1];
        const currPoint = transportData[i];

        // Only count if both points have the same activity type
        if (prevPoint.activity_type && currPoint.activity_type === prevPoint.activity_type) {
          // Extract coordinates from location objects
          const prevCoords = prevPoint.location.coordinates;
          const currCoords = currPoint.location.coordinates;

          let distance = 0;
          if (
            Array.isArray(prevCoords) && prevCoords.length >= 2 &&
            Array.isArray(currCoords) && currCoords.length >= 2
          ) {
            const [prevLng, prevLat] = prevCoords;
            const [currLng, currLat] = currCoords;

            if (
              typeof prevLat === 'number' && typeof prevLng === 'number' &&
              typeof currLat === 'number' && typeof currLng === 'number' &&
              !isNaN(prevLat) && !isNaN(prevLng) && !isNaN(currLat) && !isNaN(currLng)
            ) {
              // Haversine distance calculation
              const toRad = (x: number) => x * Math.PI / 180;
              const R = 6371e3;
              const φ1 = toRad(prevLat);
              const φ2 = toRad(currLat);
              const Δφ = toRad(currLat - prevLat);
              const Δλ = toRad(currLng - prevLng);
              const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              distance = R * c; // meters
            }
          }
          const mode = prevPoint.activity_type;

          if (!transportModes.has(mode)) {
            transportModes.set(mode, { distance: 0, count: 0 });
          }

          const modeData = transportModes.get(mode)!;
          modeData.distance += distance;
          modeData.count += 1;
        }
      }
    }

    // Build transport array for response using modeStats
    const allowedModes = ['walking', 'cycling', 'car', 'train', 'airplane', 'boat'];
    const transport = Object.entries(modeStats)
      .filter(([mode, stat]) => stat.distance > 0 && allowedModes.includes(mode))
      .map(([mode, stat]) => ({
        mode,
        distance: Math.round((stat.distance / 1000) * 10) / 10, // km, 1 decimal
        percentage: totalDistance > 0 ? Math.round((stat.distance / totalDistance) * 100) : 0,
        time: Math.round(stat.time) // seconds
      }))
      .sort((a, b) => b.distance - a.distance);

    // 10. Calculate time spent moving (>3 km/h)
    const timeSpentMovingHours = `${Math.round(timeSpentMoving / 3600)} hrs`;

    // Count visits to each train station (no double-counting within 1 hour)
    const trainStationVisits: { name: string; count: number }[] = [];

    // Group tracker points by train station
    const stationVisits = new Map<string, number[]>();

    for (const row of trackerData) {
      if (row.reverse_geocode) {
        try {
          const geocode = typeof row.reverse_geocode === 'string'
            ? JSON.parse(row.reverse_geocode)
            : row.reverse_geocode;

          // Check if this is a railway station
          if (geocode && geocode.type === 'railway_station' && geocode.address) {
            const city = geocode.address.city || '';
            const name = geocode.address.name || '';
            const stationName = city && name ? `${city} - ${name}` : (name || city || 'Unknown Station');

            if (!stationVisits.has(stationName)) {
              stationVisits.set(stationName, []);
            }
            stationVisits.get(stationName)!.push(new Date(row.recorded_at).getTime());
          }
        } catch {
          // Ignore parsing errors
        }
      }
    }

    // Count visits for each station, skipping points within 1 hour of previous
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

    // After building the transport array
    const walking = transport.find(t => t.mode === 'walking');
    const steps = walking ? Math.round(walking.distance * 1000 / 0.7) : 0;

    const data: StatisticsData & { countryTimeDistribution: { country_code: string, timeMs: number, percent: number }[], visitedPlaces: number, timeSpentMoving: string, trainStationVisits: { name: string, count: number }[] } = {
      totalDistance: isFinite(totalDistanceKm)
        ? (totalDistanceKm >= 1000
            ? `${(totalDistanceKm / 1000).toFixed(1)}k km`
            : `${totalDistanceKm.toFixed(1)} km`)
        : '0 km',
      earthCircumferences: earthCircumferences,
      locationsVisited: totalUniquePlaces.toString(),
      timeSpent,
      timeSpentMoving: timeSpentMovingHours,
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

    return successResponse(data);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    return errorResponse(error);
  }
};