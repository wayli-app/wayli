import { JobQueueService } from '$lib/services/queue/job-queue.service.server';
import { errorResponse, notFoundResponse, successResponse } from '$lib/utils/api/response';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const session = await locals.getSession();
		if (!session?.user) {
			return errorResponse('Unauthorized', 401);
		}

		const { jobs } = await JobQueueService.getJobs();
		const job = jobs.find((j) => j.id === params.job_id);

		if (!job) {
			return notFoundResponse('Job not found');
		}

		return successResponse({ progress: job.progress, status: job.status });
	} catch (error) {
		return errorResponse(error, 500);
	}
};
