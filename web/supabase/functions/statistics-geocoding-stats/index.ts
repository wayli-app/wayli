import {
  setupRequest,
  authenticateRequest,
  successResponse,
  errorResponse,
  getQueryParams,
  logError,
  logInfo,
  logSuccess
} from '../_shared/utils.ts';
import { needsGeocoding, isRetryableError } from '../_shared/geocoding-utils.ts';

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = setupRequest(req);
  if (corsResponse) return corsResponse;

  try {
    const { user, supabase } = await authenticateRequest(req);

    if (req.method === 'GET') {
      logInfo('Processing geocoding statistics request', 'STATISTICS-GEOCODING-STATS', {
        userId: user.id,
        method: req.method
      });

      // First, try to get cached statistics from user_profiles
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('geocoding_stats')
        .eq('id', user.id)
        .single();

      if (profileError) {
        // If user profile doesn't exist, create it with default geocoding stats
        if (profileError.code === 'PGRST116') { // No rows returned
          logInfo('User profile not found, creating default profile', 'STATISTICS-GEOCODING-STATS', {
            userId: user.id
          });

          const { error: insertError } = await supabase
            .from('user_profiles')
            .insert({
              id: user.id,
              geocoding_stats: {
                total_points: 0,
                geocoded_points: 0,
                points_needing_geocoding: 0,
                null_or_empty_geocodes: 0,
                retryable_errors: 0,
                non_retryable_errors: 0,
                last_calculated: new Date().toISOString(),
                cache_version: '1.0'
              }
            });

          if (insertError) {
            logError(insertError, 'STATISTICS-GEOCODING-STATS');
            return errorResponse('Failed to create user profile', 500);
          }

          // Return default statistics for new user
          return successResponse({
            total_points: 0,
            geocoded_count: 0,
            failed_count: 0,
            points_needing_geocoding: 0,
            null_or_empty_geocodes: 0,
            retryable_errors: 0,
            non_retryable_errors: 0,
            success_rate: 0,
            average_response_time: 0,
            error_breakdown: {},
            daily_stats: [],
            from_cache: true,
            cache_age_minutes: 0
          });
        } else {
          logError(profileError, 'STATISTICS-GEOCODING-STATS');
          return errorResponse('Failed to fetch user profile', 500);
        }
      }

      const cachedStats = userProfile?.geocoding_stats;
      const cacheAge = cachedStats?.last_calculated ?
        (Date.now() - new Date(cachedStats.last_calculated).getTime()) / (1000 * 60) : null; // Age in minutes

      // Use cached data if it's less than 5 minutes old
      if (cachedStats && cacheAge !== null && cacheAge < 5) {
        logInfo('Using cached geocoding statistics', 'STATISTICS-GEOCODING-STATS', {
          userId: user.id,
          cacheAge: `${cacheAge.toFixed(1)} minutes`,
          totalPoints: cachedStats.total_points,
          pointsNeedingGeocoding: cachedStats.points_needing_geocoding
        });

        return successResponse({
          total_points: cachedStats.total_points || 0,
          geocoded_count: cachedStats.geocoded_points || 0,
          failed_count: (cachedStats.total_points || 0) - (cachedStats.geocoded_points || 0),
          points_needing_geocoding: cachedStats.points_needing_geocoding || 0,
          null_or_empty_geocodes: cachedStats.null_or_empty_geocodes || 0,
          retryable_errors: cachedStats.retryable_errors || 0,
          non_retryable_errors: cachedStats.non_retryable_errors || 0,
          success_rate: cachedStats.total_points > 0 ?
            ((cachedStats.geocoded_points || 0) / cachedStats.total_points) * 100 : 0,
          average_response_time: 0, // Not cached
          error_breakdown: {}, // Not cached
          daily_stats: [], // Not cached
          from_cache: true,
          cache_age_minutes: cacheAge
        });
      }

      logInfo('Cache expired or missing, calculating fresh statistics', 'STATISTICS-GEOCODING-STATS', {
        userId: user.id,
        cacheAge: cacheAge ? `${cacheAge.toFixed(1)} minutes` : 'no cache'
      });

      const url = req.url;
      const params = getQueryParams(url);
      const startDate = params.get('start_date') || '';
      const endDate = params.get('end_date') || '';

      // Build query for tracker data with count to get total records
      let countQuery = supabase
        .from('tracker_data')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (startDate) {
        countQuery = countQuery.gte('created_at', startDate);
      }
      if (endDate) {
        countQuery = countQuery.lte('created_at', endDate);
      }

      const { count: totalCount, error: countError } = await countQuery;

      if (countError) {
        logError(countError, 'STATISTICS-GEOCODING-STATS');
        return errorResponse('Failed to count tracker data', 500);
      }

      // Debug: Log the total count
      logInfo('Total count fetched', 'STATISTICS-GEOCODING-STATS', {
        userId: user.id,
        totalCount: totalCount || 0
      });

      // For geocoding stats, we need to get ALL data to calculate accurate percentages
      // Use a larger limit or paginate through all data
      let allTrackerData: any[] = [];
      let offset = 0;
      const limit = 1000;

      while (true) {
        let query = supabase
          .from('tracker_data')
          .select('geocode, created_at')
          .eq('user_id', user.id)
          .range(offset, offset + limit - 1);

        if (startDate) {
          query = query.gte('created_at', startDate);
        }
        if (endDate) {
          query = query.lte('created_at', endDate);
        }

        const { data: batchData, error: batchError } = await query;

        if (batchError) {
          logError(batchError, 'STATISTICS-GEOCODING-STATS');
          return errorResponse('Failed to fetch tracker data', 500);
        }

        if (!batchData || batchData.length === 0) {
          break; // No more data
        }

        allTrackerData = allTrackerData.concat(batchData);
        offset += limit;

        // Safety check to prevent infinite loops
        if (offset > 100000) {
          logError('Too many records, stopping at 100k', 'STATISTICS-GEOCODING-STATS');
          break;
        }
      }

      // Debug: Log the query parameters and data fetched
      logInfo('Query parameters and data fetched', 'STATISTICS-GEOCODING-STATS', {
        userId: user.id,
        startDate,
        endDate,
        hasStartDate: !!startDate,
        hasEndDate: !!endDate,
        totalFetched: allTrackerData.length,
        expectedTotal: totalCount
      });

      // Debug: Log the actual data being processed
      logInfo('Tracker data fetched', 'STATISTICS-GEOCODING-STATS', {
        userId: user.id,
        totalRecords: allTrackerData.length,
        sampleGeocode: allTrackerData?.[0]?.geocode,
        hasGeocode: allTrackerData?.[0]?.geocode ? 'yes' : 'no'
      });

            // Calculate how many points actually need geocoding (matching job logic)
      let pointsNeedingGeocoding = 0;
      let retryableErrors = 0;
      let nonRetryableErrors = 0;
      let nullOrEmptyGeocodes = 0;

      for (const point of allTrackerData) {
        const geocode = point.geocode;

        // Use shared utility to determine if point needs geocoding
        if (needsGeocoding(geocode)) {
          pointsNeedingGeocoding++;

          // Count different types
          if (!geocode || (typeof geocode === 'object' && geocode !== null && Object.keys(geocode).length === 0)) {
            nullOrEmptyGeocodes++;
          } else if (geocode && typeof geocode === 'object' && geocode !== null && 'error' in geocode && geocode.error && isRetryableError(geocode)) {
            retryableErrors++;
          }
        }

        // Count non-retryable errors
        if (geocode && typeof geocode === 'object' && geocode !== null && 'error' in geocode && geocode.error && !isRetryableError(geocode)) {
          nonRetryableErrors++;
        }
      }

      // Debug logging
      logInfo('Geocoding breakdown', 'STATISTICS-GEOCODING-STATS', {
        totalPoints: allTrackerData.length,
        pointsNeedingGeocoding,
        nullOrEmptyGeocodes,
        retryableErrors,
        nonRetryableErrors,
        successfullyGeocoded: allTrackerData.length - pointsNeedingGeocoding - nonRetryableErrors
      });

      // Calculate geocoding statistics
      const stats = calculateGeocodingStats(allTrackerData);

      logSuccess('Geocoding statistics calculated successfully', 'STATISTICS-GEOCODING-STATS', {
        userId: user.id,
        totalPoints: allTrackerData.length,
        geocodedPoints: stats.geocodedCount,
        successRate: stats.successRate
      });

      // Update the cache with fresh statistics
      const { error: cacheUpdateError } = await supabase.rpc('update_geocoding_stats_cache', {
        p_user_id: user.id,
        p_total_points: totalCount || 0,
        p_geocoded_points: stats.geocodedCount,
        p_points_needing_geocoding: pointsNeedingGeocoding,
        p_null_or_empty_geocodes: nullOrEmptyGeocodes,
        p_retryable_errors: retryableErrors,
        p_non_retryable_errors: nonRetryableErrors
      });

      if (cacheUpdateError) {
        logError(cacheUpdateError, 'STATISTICS-GEOCODING-STATS');
        // Don't fail the request, just log the cache update error
      }

      return successResponse({
        total_points: totalCount || 0,
        geocoded_count: stats.geocodedCount,
        failed_count: stats.failedCount,
        points_needing_geocoding: pointsNeedingGeocoding,
        null_or_empty_geocodes: nullOrEmptyGeocodes,
        retryable_errors: retryableErrors,
        non_retryable_errors: nonRetryableErrors,
        success_rate: stats.successRate,
        average_response_time: stats.averageResponseTime,
        error_breakdown: stats.errorBreakdown,
        daily_stats: stats.dailyStats,
        from_cache: false,
        cache_age_minutes: 0
      });
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'STATISTICS-GEOCODING-STATS');
    return errorResponse('Internal server error', 500);
  }
});

// Helper function to calculate geocoding statistics
function calculateGeocodingStats(trackerData: Array<Record<string, unknown>>): {
  geocodedCount: number;
  failedCount: number;
  successRate: number;
  averageResponseTime: number;
  errorBreakdown: Record<string, number>;
  dailyStats: Array<{ date: string; total: number; geocoded: number; failed: number }>;
} {
  let geocodedCount = 0;
  let failedCount = 0;
  let totalResponseTime = 0;
  let responseTimeCount = 0;
  const errorBreakdown: Record<string, number> = {};
  const dailyStats: Record<string, { total: number; geocoded: number; failed: number }> = {};

  for (const point of trackerData) {
    const geocode = point.geocode;
    const createdAt = String(point.created_at || '');
    const date = createdAt.split('T')[0]; // Get date part only

    // Initialize daily stats
    if (!dailyStats[date]) {
      dailyStats[date] = { total: 0, geocoded: 0, failed: 0 };
    }
    dailyStats[date].total++;

    if (geocode) {
      if (typeof geocode === 'object' && geocode !== null) {
        // Check if geocoding was successful
        if ('error' in geocode && geocode.error) {
          failedCount++;
          dailyStats[date].failed++;

          // Track error types
          const errorType = String((geocode as any).error_message || 'unknown');
          errorBreakdown[errorType] = (errorBreakdown[errorType] || 0) + 1;
        } else {
          geocodedCount++;
          dailyStats[date].geocoded++;
        }

        // Track response time if available
        if ('response_time' in geocode && typeof geocode.response_time === 'number') {
          totalResponseTime += geocode.response_time;
          responseTimeCount++;
        }
      } else if (typeof geocode === 'string') {
        // String geocode data (likely successful)
        geocodedCount++;
        dailyStats[date].geocoded++;
      }
    } else {
      failedCount++;
      dailyStats[date].failed++;
      errorBreakdown['no_geocode'] = (errorBreakdown['no_geocode'] || 0) + 1;
    }
  }

  const totalPoints = trackerData.length;
  const successRate = totalPoints > 0 ? (geocodedCount / totalPoints) * 100 : 0;
  const averageResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0;

  // Convert daily stats to array format
  const dailyStatsArray = Object.entries(dailyStats)
    .map(([date, stats]) => ({
      date,
      total: stats.total,
      geocoded: stats.geocoded,
      failed: stats.failed
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Debug: Log the calculation results
  logInfo('Geocoding stats calculated', 'STATISTICS-GEOCODING-STATS', {
    totalPoints: trackerData.length,
    geocodedCount,
    failedCount,
    successRate,
    errorBreakdown
  });

  return {
    geocodedCount,
    failedCount,
    successRate,
    averageResponseTime,
    errorBreakdown,
    dailyStats: dailyStatsArray
  };
}

