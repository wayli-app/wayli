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

Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = setupRequest(req);
  if (corsResponse) return corsResponse;

  try {
    const { user, supabase } = await authenticateRequest(req);

    if (req.method === 'GET') {
      logInfo('Fetching geocoding statistics', 'STATISTICS-GEOCODING-STATS', { userId: user.id });

      const url = req.url;
      const params = getQueryParams(url);
      const startDate = params.get('start_date') || '';
      const endDate = params.get('end_date') || '';

      // Build query for tracker data
      let query = supabase
        .from('tracker_data')
        .select('geocode, created_at')
        .eq('user_id', user.id);

      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data: trackerData, error: trackerError } = await query;

      if (trackerError) {
        logError(trackerError, 'STATISTICS-GEOCODING-STATS');
        return errorResponse('Failed to fetch tracker data', 500);
      }

      // Calculate geocoding statistics
      const stats = calculateGeocodingStats(trackerData || []);

      logSuccess('Geocoding statistics calculated successfully', 'STATISTICS-GEOCODING-STATS', {
        userId: user.id,
        totalPoints: trackerData?.length || 0,
        geocodedPoints: stats.geocodedCount,
        successRate: stats.successRate
      });

      return successResponse({
        total_points: trackerData?.length || 0,
        geocoded_count: stats.geocodedCount,
        failed_count: stats.failedCount,
        success_rate: stats.successRate,
        average_response_time: stats.averageResponseTime,
        error_breakdown: stats.errorBreakdown,
        daily_stats: stats.dailyStats
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

  return {
    geocodedCount,
    failedCount,
    successRate,
    averageResponseTime,
    errorBreakdown,
    dailyStats: dailyStatsArray
  };
}