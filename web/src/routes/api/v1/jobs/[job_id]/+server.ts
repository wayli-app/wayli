import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse, notFoundResponse } from '$lib/utils/api/response';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

// Create server-side Supabase client with admin privileges
const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const DELETE: RequestHandler = async ({ params, locals }) => {
  try {
    const session = await locals.getSession();
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    // Actually delete the job from the jobs table
    const { error } = await locals.supabase
      .from('jobs')
      .delete()
      .eq('id', params.job_id);

    if (error) throw error;
	console.log('[DELETE] Job deleted:', params.job_id);

    return successResponse({ success: true });
  } catch (error) {
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
		const { data: { user }, error: authError } = await supabase.auth.getUser(token);

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