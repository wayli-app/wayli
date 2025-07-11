import type { RequestHandler } from '@sveltejs/kit';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { JobQueueService } from '$lib/services/queue/job-queue.service.server';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // Get current user from session
    const session = await locals.getSession();
    if (!session) {
      return errorResponse('User not authenticated', 401);
    }

    const user = session.user;
    const body = await request.json();

    // Parse configuration from request body
    const config = {
      minDwellMinutes: body.minDwellMinutes || 15,
      maxDistanceMeters: body.maxDistanceMeters || 100,
      minConsecutivePoints: body.minConsecutivePoints || 3,
      lookbackDays: body.lookbackDays || 7,
      minVisitDuration: body.minVisitDuration || 10,
      poiDiscoveryRadius: body.poiDiscoveryRadius || 50
    };

    // Create POI visit detection job
    const job = await JobQueueService.createJob(
      'poi_visit_detection',
      {
        userId: user.id,
        ...config
      },
      'normal',
      user.id
    );

    return successResponse({
      jobId: job.id,
      message: 'POI visit detection job created successfully',
      config
    });

  } catch (error) {
    console.error('Error creating POI visit detection job:', error);
    return errorResponse(error);
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