// /Users/bart/Dev/wayli/web/supabase/functions/tracker-data-smart/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// CORS setup
function setupRequest(req: Request) {
	const corsHeaders = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
	};

	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders });
	}

	return null;
}

// Helper functions for logging
function logError(error: unknown, context: string, details?: Record<string, unknown>) {
	console.error(`❌ [${context}] Error:`, error);
	if (details) {
		console.error(`❌ [${context}] Details:`, details);
	}
}

function logSuccess(message: string, context: string, details?: Record<string, unknown>) {
	console.log(`✅ [${context}] ${message}`);
	if (details) {
		console.log(`✅ [${context}] Details:`, details);
	}
}

// Response helpers
function successResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
		},
	});
}

function errorResponse(message: string, status = 400) {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
		},
	});
}

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = setupRequest(req);
	if (corsResponse) return corsResponse;

	try {
		// Initialize Supabase client
		const supabaseUrl = Deno.env.get('SUPABASE_URL');
		const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

		if (!supabaseUrl || !supabaseServiceKey) {
			logError('Missing environment variables', 'TRACKER-DATA-SMART');
			return errorResponse('Server configuration error', 500);
		}

		const supabase = createClient(supabaseUrl, supabaseServiceKey);

		// Get user from Authorization header
		const authHeader = req.headers.get('Authorization');
		if (!authHeader) {
			return errorResponse('Missing authorization header', 401);
		}

		const { data: { user }, error: authError } = await supabase.auth.getUser(
			authHeader.replace('Bearer ', '')
		);

		if (authError || !user) {
			logError(authError, 'TRACKER-DATA-SMART');
			return errorResponse('Invalid authentication', 401);
		}

		if (req.method === 'POST') {
			const body = await req.json();
			const {
				userId: requestUserId,
				startDate,
				endDate,
				maxPointsThreshold = 1000,  // More aggressive threshold
				offset = 0,
				limit = 1000,
				totalCount: providedTotalCount
			} = body;

			// Validate that the requested userId matches the authenticated user
			if (requestUserId && requestUserId !== user.id) {
				logError('User ID mismatch', 'TRACKER-DATA-SMART', {
					requestedUserId: requestUserId,
					authenticatedUserId: user.id
				});
				return errorResponse('User ID mismatch', 403);
			}

			logSuccess('Processing smart tracker data request', 'TRACKER-DATA-SMART', {
				userId: user.id,
				startDate,
				endDate,
				maxPointsThreshold,
				offset,
				limit
			});

			// Use provided total count or get it from database
			let actualTotalCount = providedTotalCount || 0;

			if (!providedTotalCount) {
				// Fallback: get the total count from database if not provided
				const { count: totalCount, error: countError } = await supabase
					.from('tracker_data')
					.select('*', { count: 'exact', head: true })
					.eq('user_id', user.id)
					.not('location', 'is', null)
					.gte('recorded_at', startDate || '1900-01-01')
					.lte('recorded_at', endDate || '2100-01-01');

				if (countError) {
					logError(countError, 'TRACKER-DATA-SMART');
					return errorResponse('Failed to get total count', 500);
				}

				actualTotalCount = totalCount || 0;
			}

			// Dynamic sampling parameters based on dataset size
			let samplingParams;
			if (actualTotalCount <= 1000) {
				// Small dataset - no sampling needed
				samplingParams = {
					p_min_distance_meters: 0,
					p_min_time_minutes: 0,
					p_max_points_per_hour: 1000
				};
			} else if (actualTotalCount <= 5000) {
				// Medium dataset - light sampling
				samplingParams = {
					p_min_distance_meters: 200,
					p_min_time_minutes: 2,
					p_max_points_per_hour: 60
				};
			} else if (actualTotalCount <= 20000) {
				// Large dataset - moderate sampling
				samplingParams = {
					p_min_distance_meters: 500,
					p_min_time_minutes: 5,
					p_max_points_per_hour: 30
				};
			} else if (actualTotalCount <= 100000) {
				// Very large dataset - aggressive sampling
				samplingParams = {
					p_min_distance_meters: 1000,
					p_min_time_minutes: 10,
					p_max_points_per_hour: 15
				};
			} else {
				// Massive dataset - extremely aggressive sampling
				samplingParams = {
					p_min_distance_meters: 2000,
					p_min_time_minutes: 20,
					p_max_points_per_hour: 8
				};
			}

			logSuccess('Dynamic sampling parameters determined', 'TRACKER-DATA-SMART', {
				totalCount: actualTotalCount,
				countSource: providedTotalCount ? 'provided' : 'database_query',
				samplingParams
			});

			// Call the SQL function with dynamic sampling parameters
			const { data, error } = await supabase.rpc('sample_tracker_data_if_needed', {
				p_target_user_id: user.id,
				p_start_date: startDate || null,
				p_end_date: endDate || null,
				p_max_points_threshold: maxPointsThreshold,
				...samplingParams,
				p_offset: offset,
				p_limit: limit
			});

			if (error) {
				logError(error, 'TRACKER-DATA-SMART');
				return errorResponse('Failed to fetch tracker data', 500);
			}

			// Extract metadata from first row if available
			const totalCount = data && data.length > 0 ? data[0].result_total_count : 0;
			const isSampled = data && data.length > 0 ? data[0].result_is_sampled : false;

			// Remove metadata columns from response and map all result_* columns back to original names
			const cleanData = data?.map(({
				result_is_sampled: _is_sampled,
				result_total_count: _total_count,
				result_user_id,
				result_tracker_type,
				result_device_id,
				result_recorded_at,
				result_location,
				result_country_code,
				result_altitude,
				result_accuracy,
				result_speed,
				result_distance,
				result_time_spent,
				result_heading,
				result_battery_level,
				result_is_charging,
				result_activity_type,
				result_geocode,
				result_tz_diff,
				result_created_at,
				result_updated_at,
				...point
			}: Record<string, unknown>) => ({
				...point,
				user_id: result_user_id,
				tracker_type: result_tracker_type,
				device_id: result_device_id,
				recorded_at: result_recorded_at,
				location: result_location,
				country_code: result_country_code,
				altitude: result_altitude,
				accuracy: result_accuracy,
				speed: result_speed,
				distance: result_distance,
				time_spent: result_time_spent,
				heading: result_heading,
				battery_level: result_battery_level,
				is_charging: result_is_charging,
				activity_type: result_activity_type,
				geocode: result_geocode,
				tz_diff: result_tz_diff,
				created_at: result_created_at,
				updated_at: result_updated_at
			})) || [];

			logSuccess('Smart tracker data fetched successfully', 'TRACKER-DATA-SMART', {
				userId: user.id,
				returnedCount: cleanData.length,
				totalCount,
				isSampled
			});

			return successResponse({
				data: cleanData,
				metadata: {
					totalCount,
					returnedCount: cleanData.length,
					isSampled,
					samplingApplied: isSampled,
					samplingLevel: actualTotalCount <= 1000 ? 'none' :
								  actualTotalCount <= 5000 ? 'light' :
								  actualTotalCount <= 20000 ? 'moderate' :
								  actualTotalCount <= 100000 ? 'aggressive' : 'extreme',
					samplingParams,
					pagination: {
						offset,
						limit,
						hasMore: cleanData.length === limit && (offset + limit) < totalCount
					}
				}
			});
		}

		return errorResponse('Method not allowed', 405);
	} catch (error) {
		logError(error, 'TRACKER-DATA-SMART');
		return errorResponse('Internal server error', 500);
	}
});
