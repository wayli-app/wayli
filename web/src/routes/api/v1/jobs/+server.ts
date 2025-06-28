import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse, conflictResponse } from '$lib/utils/api/response';

export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    const session = await locals.getSession();
    if (!session?.user) {
      return errorResponse('Unauthorized', 401);
    }

    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const status = url.searchParams.get('status') as string | null;
    const userId = session.user.user_metadata?.role === 'admin' ? undefined : session.user.id;

    let query = locals.supabase.from('jobs').select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (userId) query = query.eq('created_by', userId);

    const { data: jobs, error, count } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;

    return successResponse({
      jobs: jobs || [],
      total: count || 0,
      page,
      limit
    });
  } catch (error) {
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

    // Check if there's already an active job of this type for this user
    const userId = session.user.user_metadata?.role === 'admin' ? undefined : session.user.id;

    let query = locals.supabase.from('jobs').select('*');
    if (userId) query = query.eq('created_by', userId);

    const { data: jobs, error: fetchError } = await query
      .in('status', ['queued', 'running'])
      .eq('type', type)
      .order('created_at', { ascending: false });

    if (fetchError) throw fetchError;

    const activeJob = jobs?.[0];
    if (activeJob) {
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
      console.error('Error creating job:', createError);
      throw createError;
    }

    console.log(`📝 New job created: ${job.id} (${type}) with priority ${priority || 'normal'}`);

    return successResponse({ job });
  } catch (error) {
    return errorResponse(error);
  }
};