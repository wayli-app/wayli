import type { RequestHandler } from './$types';
import type { Job } from '$lib/types/job-queue.types';
import { successResponse, errorResponse, validationErrorResponse, conflictResponse } from '$lib/utils/api/response';

export const GET: RequestHandler = async ({ locals }) => {
  try {
    console.log('[Jobs API] GET request received');

    const session = await locals.getSession();
    if (!session?.user) {
      console.log('[Jobs API] Unauthorized request - no session');
      return errorResponse('Unauthorized', 401);
    }

    console.log('[Jobs API] Authorized request for user:', session.user.id);

    const userId = session.user.user_metadata?.role === 'admin' ? undefined : session.user.id;

    // Only return the latest job of each type for this user
    // Supabase/PostgREST does not support GROUP BY with aggregation directly, so use a workaround:
    // 1. Fetch all jobs for the user, ordered by created_at desc
    // 2. In JS, reduce to the latest job per type
    let query = locals.supabase.from('jobs').select('*');
    if (userId) query = query.eq('created_by', userId);

    const { data: jobs, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[Jobs API] Database error:', error);
      throw error;
    }

    // Reduce to latest job per type
    const latestJobsByType: Record<string, Job> = {};
    for (const job of jobs || []) {
      if (!latestJobsByType[job.type]) {
        latestJobsByType[job.type] = job;
      }
    }

    const latestJobs = Object.values(latestJobsByType);

    return successResponse(latestJobs);
  } catch (error) {
    console.error('[Jobs API] Error in GET handler:', error);
    return errorResponse(error);
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    console.log('[Jobs API] POST request received');

    const session = await locals.getSession();
    if (!session?.user) {
      console.log('[Jobs API] Unauthorized request - no session');
      return errorResponse('Unauthorized', 401);
    }

    console.log('[Jobs API] Authorized request for user:', session.user.id);

    const { type, data, priority } = await request.json();

    console.log('[Jobs API] Job creation request:', { type, priority, dataKeys: Object.keys(data || {}) });

    if (!type || !data) {
      console.log('[Jobs API] Validation error: missing type or data');
      return validationErrorResponse('Type and data are required');
    }

    // Check if there's already an active job of this type for this user
    const userId = session.user.user_metadata?.role === 'admin' ? undefined : session.user.id;

    let query = locals.supabase.from('jobs').select('*');
    if (userId) query = query.eq('created_by', userId);

    const { data: jobs, error: fetchError } = await query
      .in('status', ['queued', 'running'])
      .eq('type', type)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('[Jobs API] Error fetching active jobs:', fetchError);
      throw fetchError;
    }

    const activeJob = jobs?.[0];
    if (activeJob) {
      console.log('[Jobs API] Conflict: active job exists:', activeJob.id);
      return conflictResponse(
        `A ${type} job is already ${activeJob.status}. Please wait for it to complete.`,
        {
          activeJob: {
            id: activeJob.id,
            status: activeJob.status,
            progress: activeJob.progress,
            created_at: activeJob.created_at,
            started_at: activeJob.started_at
          }
        }
      );
    }

    console.log('[Jobs API] Creating new job...');

    // Create the job using the server client
    const { data: job, error: createError } = await locals.supabase
      .from('jobs')
      .insert({
        type,
        status: 'queued',
        priority: priority || 'normal',
        data,
        progress: 0,
        created_by: session.user.id
      })
      .select()
      .single();

    if (createError) {
      console.error('[Jobs API] Error creating job:', createError);
      throw createError;
    }

    console.log(`[Jobs API] ✅ New job created: ${job.id} (${type}) with priority ${priority || 'normal'}`);

    return successResponse({ job });
  } catch (error) {
    console.error('[Jobs API] Error in POST handler:', error);
    return errorResponse(error);
  }
};