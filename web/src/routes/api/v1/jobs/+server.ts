import type { RequestHandler } from './$types';
import { errorResponse, successResponse, validationErrorResponse, conflictResponse } from '$lib/utils/api/response';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const session = await locals.getSession();
		if (!session?.user) {
			return errorResponse('Unauthorized', 401);
		}

		const userId = session.user.user_metadata?.role === 'admin' ? undefined : session.user.id;

		// Return the last 5 jobs of each type for this user to show both active and completed jobs
		let query = locals.supabase
			.from('jobs')
			.select('*')
			.order('created_at', { ascending: false })
			.limit(50);

		if (userId) {
			query = query.eq('created_by', userId);
		}

		const { data: jobs, error } = await query.order('created_at', { ascending: false });

		if (error) {
			console.error('❌ [Jobs API] Database error:', error);
			throw error;
		}

		// Group jobs by type and return the most recent ones
		const jobsByType = new Map<string, Record<string, unknown>[]>();
		jobs?.forEach((job) => {
			if (!jobsByType.has(job.type)) {
				jobsByType.set(job.type, []);
			}
			jobsByType.get(job.type)!.push(job);
		});

		const allJobs = Array.from(jobsByType.values()).flat();

		return successResponse(allJobs);
	} catch (error) {
		console.error('❌ [Jobs API] Error in GET handler:', error);
		return errorResponse(error);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const session = await locals.getSession();
		if (!session?.user) {
			return errorResponse('Unauthorized', 401);
		}

		const { type, data, priority } = await request.json();

		if (!type || !data) {
			return validationErrorResponse('Type and data are required');
		}

		// Check for active jobs of the same type
		const { data: jobs, error: fetchError } = await locals.supabase
			.from('jobs')
			.select('*')
			.eq('type', type)
			.in('status', ['queued', 'processing'])
			.eq('created_by', session.user.id)
			.order('created_at', { ascending: false })
			.limit(1);

		if (fetchError) {
			console.error('❌ [Jobs API] Error fetching active jobs:', fetchError);
			throw fetchError;
		}

		const activeJob = jobs?.[0];
		if (activeJob) {
			return conflictResponse(
				`A ${type} job is already ${activeJob.status}. Please wait for it to complete.`,
				{ activeJob }
			);
		}

		// Create the job using the server client
		const { data: job, error: createError } = await locals.supabase
			.from('jobs')
			.insert({
				type,
				data,
				priority: priority || 'normal',
				status: 'queued',
				created_by: session.user.id
			})
			.select()
			.single();

		if (createError) {
			console.error('❌ [Jobs API] Error creating job:', createError);
			throw createError;
		}

		return successResponse({ job });
	} catch (error) {
		console.error('❌ [Jobs API] Error in POST handler:', error);
		return errorResponse(error);
	}
};
