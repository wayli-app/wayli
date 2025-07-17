import { successResponse, errorResponse } from '$lib/utils/api/response';
import { supabase } from '$lib/core/supabase/server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		// Get current user from session - this ensures authentication
		const session = await locals.getSession();
		if (!session) {
			return errorResponse('User not authenticated', 401);
		}

		const jobId = url.searchParams.get('id');
		if (!jobId) {
			return successResponse({
				percentage: 0,
				current: 0,
				total: 0,
				status: 'No job ID provided'
			});
		}

		// Get job progress from database - only for the authenticated user
		const { data: job, error } = await supabase
			.from('jobs')
			.select('*')
			.eq('id', jobId)
			.eq('user_id', session.user.id) // Security: Only allow access to user's own jobs
			.single();

		if (error || !job) {
			return successResponse({
				percentage: 0,
				current: 0,
				total: 0,
				status: 'Job not found'
			});
		}

		// Extract progress information from job result
		const result = (job.result as Record<string, unknown>) || {};
		const progress = job.progress || 0;
		const status = result.message || job.status;
		const current = result.totalProcessed || 0;
		const total = result.totalItems || 0;

		return successResponse({
			percentage: progress,
			current,
			total,
			status,
			jobStatus: job.status,
			result
		});
	} catch (error) {
		console.error('Error fetching job progress:', error);
		return errorResponse('Failed to fetch job progress');
	}
};
