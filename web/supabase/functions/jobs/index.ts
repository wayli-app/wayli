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

		if (req.method === 'DELETE') {
			logInfo('Cancelling job', 'JOBS', { userId: user.id });

			// Parse job ID from URL path
			const url = new URL(req.url);
			const pathParts = url.pathname.split('/');
			const jobId = pathParts[pathParts.length - 1];

			if (!jobId) {
				return errorResponse('Job ID is required', 400);
			}

			// First get the job to check permissions and status
			const { data: job, error: jobError } = await supabase
				.from('jobs')
				.select('*')
				.eq('id', jobId)
				.eq('created_by', user.id)
				.single();

			if (jobError) {
				logError(jobError, 'JOBS');
				return errorResponse('Job not found', 404);
			}

			// Check if job can be cancelled
			if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
				return errorResponse(`Cannot cancel job in ${job.status} status`, 400);
			}

			// Cancel the job
			const { error: updateError } = await supabase
				.from('jobs')
				.update({
					status: 'cancelled',
					updated_at: new Date().toISOString()
				})
				.eq('id', jobId);

			if (updateError) {
				logError(updateError, 'JOBS');
				return errorResponse('Failed to cancel job', 500);
			}

			logSuccess('Job cancelled successfully', 'JOBS', {
				userId: user.id,
				jobId: jobId
			});

			// Always create a reverse geocoding job after cancelling an import job
			if (job.type === 'data_import') {
				try {
					logInfo('Creating reverse geocoding job after import cancellation', 'JOBS', {
						userId: user.id,
						cancelledJobId: jobId
					});

					const { data: geocodingJob, error: geocodingError } = await supabase
						.from('jobs')
						.insert({
							created_by: user.id,
							type: 'reverse_geocoding_missing',
							status: 'queued',
							data: {
								reason: 'Import job cancelled - automatic geocoding',
								cancelledImportJobId: jobId
							}
						})
						.select()
						.single();

					if (geocodingError) {
						logError(geocodingError, 'JOBS');
						// Don't fail the cancellation, just log the error
						console.error('❌ [JOBS] Failed to create geocoding job after import cancellation:', geocodingError);
					} else {
						logSuccess('Reverse geocoding job created successfully after import cancellation', 'JOBS', {
							userId: user.id,
							cancelledJobId: jobId,
							geocodingJobId: geocodingJob.id
						});
					}
				} catch (error) {
					logError(error, 'JOBS');
					// Don't fail the cancellation, just log the error
					console.error('❌ [JOBS] Error creating geocoding job after import cancellation:', error);
				}
			}

			return successResponse({
				message: 'Job cancelled successfully',
				geocodingJobCreated: job.type === 'data_import'
			});
		}

		return errorResponse('Method not allowed', 405);
	} catch (error) {
		logError(error, 'JOBS');
		return errorResponse('Internal server error', 500);
	}
});
