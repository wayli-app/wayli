import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { JobQueueService } from '$lib/services/job-queue.service';
import type { JobType, JobPriority } from '$lib/types/job-queue.types';

export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    const session = await locals.getSession();
    if (!session?.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const status = url.searchParams.get('status') as any;
    const userId = session.user.user_metadata?.role === 'admin' ? undefined : session.user.id;

    const { jobs, total } = await JobQueueService.getJobs(status, userId, page, limit);

    return json({ jobs, total, page, limit });
  } catch (error) {
    console.error('Error getting jobs:', error);
    return json({ error: 'Failed to get jobs' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const session = await locals.getSession();
    if (!session?.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type, data, priority } = await request.json();

    if (!type || !data) {
      return json({ error: 'Type and data are required' }, { status: 400 });
    }

    // Check if there's already an active job of this type for this user
    const userId = session.user.user_metadata?.role === 'admin' ? undefined : session.user.id;
    const { jobs } = await JobQueueService.getJobs(undefined, userId, 1, 100);

    const activeJob = jobs.find(job =>
      job.type === type &&
      (job.status === 'queued' || job.status === 'running')
    );

    if (activeJob) {
      return json({
        error: `A ${type} job is already ${activeJob.status}. Please wait for it to complete.`,
        activeJob: {
          id: activeJob.id,
          status: activeJob.status,
          progress: activeJob.progress,
          created_at: activeJob.created_at,
          started_at: activeJob.started_at
        }
      }, { status: 409 });
    }

    const job = await JobQueueService.createJob(
      type as JobType,
      data,
      priority as JobPriority || 'normal',
      session.user.id
    );

    return json({ job });
  } catch (error) {
    console.error('Error creating job:', error);
    return json({ error: 'Failed to create job' }, { status: 500 });
  }
};