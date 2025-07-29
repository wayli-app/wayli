import {
  setupRequest,
  authenticateRequest,
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
		const { user, supabase } = await authenticateRequest(req);

				// Handle different HTTP methods
		if (req.method === 'GET') {
			logInfo('Fetching jobs', 'JOBS', { userId: user.id });

			// Parse query parameters
			const url = new URL(req.url);
			const type = url.searchParams.get('type');
			const limit = parseInt(url.searchParams.get('limit') || '100');
			const offset = parseInt(url.searchParams.get('offset') || '0');

			// Build query
			let query = supabase
				.from('jobs')
				.select('*')
				.eq('created_by', user.id)
				.order('created_at', { ascending: false })
				.range(offset, offset + limit - 1);

			// Add type filter if specified
			if (type) {
				query = query.eq('type', type);
			}

			const { data: jobs, error: jobsError } = await query;

			if (jobsError) {
				logError(jobsError, 'JOBS');
				return errorResponse('Failed to fetch jobs', 500);
			}

			logSuccess('Jobs fetched successfully', 'JOBS', {
				userId: user.id,
				count: jobs?.length || 0,
				type: type || 'all'
			});
			return successResponse(jobs || []);
		}

		if (req.method === 'POST') {
			logInfo('Creating job', 'JOBS', { userId: user.id });

			const body = await parseJsonBody<Record<string, unknown>>(req);
			const { type, data } = body;

			if (!type) {
				return errorResponse('Job type is required', 400);
			}

			const { data: job, error: jobError } = await supabase
				.from('jobs')
				.insert({
					created_by: user.id,
					type,
					status: 'queued',
					data: data || {}
				})
				.select()
				.single();

			if (jobError) {
				logError(jobError, 'JOBS');
				return errorResponse('Failed to create job', 500);
			}

			logSuccess('Job created successfully', 'JOBS', {
				userId: user.id,
				jobType: type as string
			});
			return successResponse(job);
		}

		return errorResponse('Method not allowed', 405);
	} catch (error) {
		logError(error, 'JOBS');
		return errorResponse('Internal server error', 500);
	}
});
