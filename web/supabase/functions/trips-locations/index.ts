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
      const url = req.url;
      const params = getQueryParams(url);

      const startDate = params.get('startDate') || '';
      const endDate = params.get('endDate') || '';
      const limit = parseInt(params.get('limit') || '100');
      const offset = parseInt(params.get('offset') || '0');
      const includeTrackerData = params.get('includeTrackerData') === 'true';
      const includeLocations = params.get('includeLocations') === 'true';
      const includePOIs = params.get('includePOIs') === 'true';

      // Validate limit
      if (limit > 1000) {
        return errorResponse('Limit cannot exceed 1000', 400);
      }

      const result: Record<string, unknown> = {};

      // Fetch locations if requested
      if (includeLocations) {
        let locationsQuery = supabase
          .from('locations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (startDate) {
          locationsQuery = locationsQuery.gte('created_at', startDate);
        }
        if (endDate) {
          locationsQuery = locationsQuery.lte('created_at', endDate);
        }

        const { data: locations, error: locationsError } = await locationsQuery;

        if (locationsError) {
          logError(locationsError, 'TRIPS-LOCATIONS');
          return errorResponse('Failed to fetch locations', 500);
        }

        result.locations = locations || [];
        logSuccess('Locations fetched', 'TRIPS-LOCATIONS', { count: locations?.length || 0 });
      }

      // Fetch POIs if requested
      if (includePOIs) {
        let poisQuery = supabase
          .from('tracker_data')
          .select('*')
          .eq('user_id', user.id)
          .not('geocode', 'is', null)
          .order('recorded_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (startDate) {
          poisQuery = poisQuery.gte('recorded_at', startDate);
        }
        if (endDate) {
          poisQuery = poisQuery.lte('recorded_at', endDate);
        }

        const { data: pois, error: poisError } = await poisQuery;

        if (poisError) {
          logError(poisError, 'TRIPS-LOCATIONS');
          return errorResponse('Failed to fetch POIs', 500);
        }

        result.pois = pois || [];
        logSuccess('POIs fetched', 'TRIPS-LOCATIONS', { count: pois?.length || 0 });
      }

      // Fetch tracker data if requested
      if (includeTrackerData) {
        // First get total count
        let countQuery = supabase
          .from('tracker_data')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (startDate) {
          countQuery = countQuery.gte('recorded_at', startDate);
        }
        if (endDate) {
          countQuery = countQuery.lte('recorded_at', endDate);
        }

        const { count: trackerCount, error: countError } = await countQuery;

        if (countError) {
          logError(countError, 'TRIPS-LOCATIONS');
          return errorResponse('Failed to count tracker data', 500);
        }

        // Then get paginated data
        let trackerQuery = supabase
          .from('tracker_data')
          .select('*')
          .eq('user_id', user.id)
          .order('recorded_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (startDate) {
          trackerQuery = trackerQuery.gte('recorded_at', startDate);
        }
        if (endDate) {
          trackerQuery = trackerQuery.lte('recorded_at', endDate);
        }

        const { data: trackerData, error: trackerError } = await trackerQuery;

        if (trackerError) {
          logError(trackerError, 'TRIPS-LOCATIONS');
          return errorResponse('Failed to fetch tracker data', 500);
        }

        result.trackerData = trackerData || [];
        result.trackerCount = trackerCount || 0;
        logSuccess('Tracker data fetched', 'TRIPS-LOCATIONS', {
          count: trackerData?.length || 0,
          total: trackerCount || 0
        });
      }
      return successResponse(result);
    }

    return errorResponse('Method not allowed', 405);
  } catch (error) {
    logError(error, 'TRIPS-LOCATIONS');
    return errorResponse('Internal server error', 500);
  }
});