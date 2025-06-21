import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { workerManager } from '$lib/services/worker-manager.service';
import { JobQueueService } from '$lib/services/job-queue.service';

export const GET: RequestHandler = async ({ locals }) => {
  try {
    const session = await locals.getSession();
    if (!session?.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (session.user.user_metadata?.role !== 'admin') {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const status = await workerManager.getStatus();
    const activeWorkers = await JobQueueService.getActiveWorkers();

    return json({ status, activeWorkers });
  } catch (error) {
    console.error('Error getting worker status:', error);
    return json({ error: 'Failed to get worker status' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const session = await locals.getSession();
    if (!session?.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (session.user.user_metadata?.role !== 'admin') {
      return json({ error: 'Forbidden' }, { status: 403 });
    }

    const { action, workerCount, config } = await request.json();

    switch (action) {
      case 'start':
        await workerManager.start(config);
        break;
      case 'stop':
        await workerManager.stop();
        break;
      case 'updateWorkers':
        if (typeof workerCount !== 'number') {
          return json({ error: 'Worker count must be a number' }, { status: 400 });
        }
        await workerManager.updateWorkerCount(workerCount);
        break;
      case 'updateConfig':
        if (!config || typeof config !== 'object') {
          return json({ error: 'Config must be an object' }, { status: 400 });
        }
        await workerManager.updateConfig(config);
        break;
      case 'testRealtime':
        const testResult = await workerManager.testRealtime();
        return json({ success: true, realtimeTest: testResult });
      case 'getRealtimeConfig':
        const realtimeConfig = workerManager.getRealtimeConfig();
        return json({ success: true, realtimeConfig });
      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }

    const status = await workerManager.getStatus();
    return json({ success: true, status });
  } catch (error) {
    console.error('Error managing workers:', error);
    return json({ error: 'Failed to manage workers' }, { status: 500 });
  }
};