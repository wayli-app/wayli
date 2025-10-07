import {
	setupRequest,
	authenticateRequest,
	authenticateRequestWithApiKey,
	successResponse,
	errorResponse,
	parseJsonBody,
	logError,
	logInfo,
	logSuccess
} from '../_shared/utils.ts';

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = setupRequest(req);
	if (corsResponse) return corsResponse;

	try {
		let user, supabase;

		// Try API key authentication first (for OwnTracks integration)
		// API key and user_id are in query parameters
		try {
			({ user, supabase } = await authenticateRequestWithApiKey(req));
			logInfo('API key authentication successful', 'OWNTRACKS_POINTS', { userId: user.id });
		} catch (apiKeyError) {
			// Fall back to JWT authentication
			try {
				({ user, supabase } = await authenticateRequest(req));
				logInfo('JWT authentication successful', 'OWNTRACKS_POINTS', { userId: user.id });
			} catch (jwtError) {
				logError(apiKeyError, 'OWNTRACKS_POINTS_API_KEY');
				logError(jwtError, 'OWNTRACKS_POINTS_JWT');
				return errorResponse(
					'Authentication required. Use api_key and user_id query parameters or JWT token.',
					401
				);
			}
		}

		// Only allow POST requests (OwnTracks sends location data in POST body)
		if (req.method !== 'POST') {
			return errorResponse('Method not allowed', 405);
		}

		logInfo('Processing OwnTracks points', 'OWNTRACKS_POINTS', { userId: user.id });

		// Parse request body for location data
		const body = await parseJsonBody<Record<string, unknown>>(req);
		const points = (body.points as any[]) || [];

		if (!Array.isArray(points) || points.length === 0) {
			return errorResponse('No valid points data found', 400);
		}

		logInfo('Processing points', 'OWNTRACKS_POINTS', {
			userId: user.id,
			pointCount: points.length
		});

		// Process and insert points
		const processedPoints = points.map((point: any) => ({
			user_id: user.id,
			tracker_type: 'owntracks',
			device_id: 'owntracks', // Default device ID for OwnTracks
			recorded_at: new Date(point.tst * 1000).toISOString(), // Convert Unix timestamp to ISO string
			location: `POINT(${point.lon} ${point.lat})`, // PostGIS point format
			altitude: point.alt,
			accuracy: point.acc,
			speed: point.vel,
			heading: point.cog,
			battery_level: point.batt,
			activity_type: point.act,
			raw_data: point
		}));

		const { data: insertedPoints, error: insertError } = await supabase
			.from('tracker_data')
			.insert(processedPoints)
			.select();

		if (insertError) {
			logError(insertError, 'OWNTRACKS_POINTS');
			return errorResponse('Failed to insert points', 500);
		}

		logSuccess('Points inserted successfully', 'OWNTRACKS_POINTS', {
			userId: user.id,
			count: insertedPoints?.length || 0
		});

		return successResponse({
			message: 'Points inserted successfully',
			count: insertedPoints?.length || 0
		});
	} catch (error) {
		logError(error, 'OWNTRACKS_POINTS');
		return errorResponse('Internal server error', 500);
	}
});
