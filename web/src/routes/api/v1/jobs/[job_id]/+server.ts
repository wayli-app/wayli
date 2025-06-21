import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { JobQueueService } from '$lib/services/job-queue.service';

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