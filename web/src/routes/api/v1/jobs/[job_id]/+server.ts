import type { RequestHandler } from './$types';
import {
	successResponse,
	errorResponse,
	validationErrorResponse,
	notFoundResponse
} from '$lib/utils/api/response';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

// Create server-side Supabase client with admin privileges
const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const DELETE: RequestHandler = async ({ params, locals }) => {
	try {
		console.log('[Jobs API] DELETE request received for job:', params.job_id);

		const session = await locals.getSession();
		if (!session?.user) {
			console.log('[Jobs API] Unauthorized request - no session');
			return errorResponse('Unauthorized', 401);
		}

		console.log('[Jobs API] Authorized request for user:', session.user.id);

		const jobId = params.job_id;
		const userId = session.user.user_metadata?.role === 'admin' ? undefined : session.user.id;

		// First, get the job to check if it exists and belongs to the user
		let query = locals.supabase.from('jobs').select('*').eq('id', jobId);
		if (userId) query = query.eq('created_by', userId);

		const { data: job, error: fetchError } = await query.single();

		if (fetchError) {
			console.error('[Jobs API] Error fetching job:', fetchError);
			return errorResponse('Job not found', 404);
		}

		if (!job) {
			return errorResponse('Job not found', 404);
		}

		// Check if the job can be cancelled (only queued or running jobs)
		if (!['queued', 'running'].includes(job.status)) {
			return errorResponse('Job cannot be cancelled - it is not in a cancellable state', 400);
		}

		// Cancel the job
		const { error: updateError } = await locals.supabase
			.from('jobs')
			.update({
				status: 'cancelled',
				updated_at: new Date().toISOString(),
				completed_at: new Date().toISOString()
			})
			.eq('id', jobId);

		if (updateError) {
			console.error('[Jobs API] Error cancelling job:', updateError);
			return errorResponse('Failed to cancel job');
		}

		console.log(`[Jobs API] ✅ Job cancelled: ${jobId}`);

		return successResponse({ message: 'Job cancelled successfully' });
	} catch (error) {
		console.error('[Jobs API] Error in DELETE handler:', error);
		return errorResponse(error);
	}
};

export const GET: RequestHandler = async ({ params, request }) => {
	try {
		const jobId = params.job_id;

		if (!jobId) {
			return validationErrorResponse('Job ID required');
		}

		// Get the current user from the request headers
		const authHeader = request.headers.get('authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return errorResponse('Authentication required', 401);
		}

		const token = authHeader.substring(7);
		const {
			data: { user },
			error: authError
		} = await supabase.auth.getUser(token);

		if (authError || !user) {
			return errorResponse('Authentication required', 401);
		}

		// Get the job details
		const { data: job, error } = await supabase
			.from('jobs')
			.select('*')
			.eq('id', jobId)
			.eq('created_by', user.id)
			.single();

		if (error) {
			return notFoundResponse('Job not found');
		}

		return successResponse({ job });
	} catch (error) {
		return errorResponse(error);
	}
};
