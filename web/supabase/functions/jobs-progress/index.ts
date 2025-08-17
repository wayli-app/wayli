import {
	setupRequest,
	authenticateRequest,
	successResponse,
	errorResponse,
	logError
} from '../_shared/utils.ts';

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = setupRequest(req);
	if (corsResponse) return corsResponse;

	try {
		const { user, supabase } = await authenticateRequest(req);

		if (req.method === 'GET') {
			// Extract job_id from URL path
			const url = req.url;
			const urlObj = new URL(url);
			const pathParts = urlObj.pathname.split('/').filter(Boolean);

			// The URL structure is: /functions/v1/jobs-progress/{jobId}
			// So jobId should be the last part of the path
			const jobId = pathParts[pathParts.length - 1];

			if (!jobId) {
				return errorResponse('Missing job ID', 400);
			}

			// Get the job
			const { data: job, error: jobError } = await supabase
				.from('jobs')
				.select('*')
				.eq('id', jobId)
				.eq('created_by', user.id)
				.single();

			if (jobError || !job) {
				logError(jobError, 'JOBS-PROGRESS');
				return errorResponse('Job not found', 404);
			}

			return successResponse({
				id: job.id,
				type: job.type,
				status: job.status,
				progress: job.progress || 0,
				created_at: job.created_at,
				updated_at: job.updated_at,
				started_at: job.started_at,
				completed_at: job.completed_at,
				error: job.error,
				result: job.result,
				data: job.data
			});
		}

		return errorResponse('Method not allowed', 405);
	} catch (error) {
		logError(error, 'JOBS-PROGRESS');
		return errorResponse('Internal server error', 500);
	}
});
