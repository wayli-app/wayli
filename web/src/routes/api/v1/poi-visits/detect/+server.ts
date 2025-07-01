import type { RequestHandler } from './$types';
import { JobQueueService } from '$lib/services/queue/job-queue.service.server';

export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    const session = await locals.getSession();
    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await request.json();
    const { userId, config } = body;

    // Validate input
    if (userId && typeof userId !== 'string') {
      return new Response('Invalid userId', { status: 400 });
    }

    // Validate config if provided
    if (config) {
      if (typeof config !== 'object') {
        return new Response('Invalid config object', { status: 400 });
      }

      const validConfigKeys = ['minDwellMinutes', 'maxDistanceMeters', 'minConsecutivePoints', 'lookbackDays'];
      for (const key of Object.keys(config)) {
        if (!validConfigKeys.includes(key)) {
          return new Response(`Invalid config key: ${key}`, { status: 400 });
        }
      }
    }

    // Create job data
    const jobData: Record<string, unknown> = {};
    if (userId) {
      jobData.userId = userId;
    }
    if (config) {
      Object.assign(jobData, config);
    }

    // Create the job
    const job = await JobQueueService.createJob(
      'poi_visit_detection',
      jobData,
      'normal',
      session.user.id
    );

    return new Response(JSON.stringify({
      success: true,
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        created_at: job.created_at
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Error creating POI visit detection job:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to create POI visit detection job'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};

export const GET: RequestHandler = async ({ locals, url }) => {
  try {
    const session = await locals.getSession();
    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    const userId = url.searchParams.get('userId');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    // Get POI visit detection jobs
    const { jobs, total } = await JobQueueService.getJobs(
      undefined, // status - get all statuses
      userId || session.user.id,
      page,
      limit
    );

    // Filter for POI visit detection jobs
    const poiJobs = jobs.filter(job => job.type === 'poi_visit_detection');

    return new Response(JSON.stringify({
      success: true,
      jobs: poiJobs,
      pagination: {
        page,
        limit,
        total: poiJobs.length,
        totalPages: Math.ceil(poiJobs.length / limit)
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Error fetching POI visit detection jobs:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to fetch POI visit detection jobs'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};