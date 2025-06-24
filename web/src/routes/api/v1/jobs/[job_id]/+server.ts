import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { JobQueueService } from '$lib/services/job-queue.service';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

// Create server-side Supabase client with admin privileges
const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const DELETE: RequestHandler = async ({ params, locals }) => {
  try {
    const session = await locals.getSession();
    if (!session?.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    await JobQueueService.cancelJob(params.job_id);
    return json({ success: true });
  } catch (error) {
    console.error('Error cancelling job:', error);
    return json({ error: 'Failed to cancel job' }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ params, request }) => {
	try {
		const jobId = params.job_id;

		if (!jobId) {
			return json({ success: false, message: 'Job ID required' }, { status: 400 });
		}

		// Get the current user from the request headers
		const authHeader = request.headers.get('authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return json({ success: false, message: 'Authentication required' }, { status: 401 });
		}

		const token = authHeader.substring(7);
		const { data: { user }, error: authError } = await supabase.auth.getUser(token);

		if (authError || !user) {
			return json({ success: false, message: 'Authentication required' }, { status: 401 });
		}

		// Get the job details
		const { data: job, error } = await supabase
			.from('jobs')
			.select('*')
			.eq('id', jobId)
			.eq('created_by', user.id)
			.single();

		if (error) {
			return json({ success: false, message: 'Job not found' }, { status: 404 });
		}

		return json({
			success: true,
			job
		});

	} catch (error) {
		console.error('Job status error:', error);
		return json({
			success: false,
			message: error instanceof Error ? error.message : 'Failed to get job status'
		}, { status: 500 });
	}
};