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
    console.log('[Jobs API] User metadata:', session.user.user_metadata);

    const userId = session.user.user_metadata?.role === 'admin' ? undefined : session.user.id;
    console.log('[Jobs API] Using userId for query:', userId);

    // Return the last 5 jobs of each type for this user to show both active and completed jobs
    const query = locals.supabase.from('jobs').select('*');

    // Temporarily remove user filtering to debug
    console.log('[Jobs API] TEMPORARY: Not filtering by user to debug');
    // if (userId) {
    //   query = query.eq('created_by', userId);
    //   console.log('[Jobs API] Filtering by user ID:', userId);
    // } else {
    //   console.log('[Jobs API] Admin user - not filtering by user ID');
    // }

    console.log('[Jobs API] Executing database query...');
    const { data: jobs, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[Jobs API] Database error:', error);
      throw error;
    }

    console.log('[Jobs API] Raw database response - jobs count:', jobs?.length || 0);
    console.log('[Jobs API] Raw database response - jobs:', jobs?.map(j => ({ id: j.id, type: j.type, status: j.status, created_by: j.created_by })));

    // Group jobs by type and keep the last 5 of each type
    const jobsByType: Record<string, Job[]> = {};
    for (const job of jobs || []) {
      if (!jobsByType[job.type]) {
        jobsByType[job.type] = [];
      }
      if (jobsByType[job.type].length < 5) {
        jobsByType[job.type].push(job);
      }
    }

    // Flatten the jobs back into a single array
    const allJobs = Object.values(jobsByType).flat();

    console.log('[Jobs API] Jobs by type:', Object.keys(jobsByType).map(type => ({
      type,
      count: jobsByType[type].length,
      jobs: jobsByType[type].map(j => ({ id: j.id, status: j.status, completed_at: j.completed_at }))
    })));
    console.log('[Jobs API] Total jobs being returned:', allJobs.length);

    return successResponse(allJobs);
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