import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { JobQueueService } from '$lib/services/job-queue.service';

export const GET: RequestHandler = async ({ params, locals }) => {
  try {
    const session = await locals.getSession();
    if (!session?.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobs } = await JobQueueService.getJobs();
    const job = jobs.find(j => j.id === params.job_id);

    if (!job) {
      return json({ error: 'Job not found' }, { status: 404 });
    }

    return json({ progress: job.progress, status: job.status });
  } catch (error) {
    console.error('Error getting job progress:', error);
    return json({ error: 'Failed to get job progress' }, { status: 500 });
  }
};