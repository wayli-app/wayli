import {
  setupRequest,
  authenticateRequest,
  successResponse,
  errorResponse,
  parseJsonBody,
  validateRequiredFields,
  logError,
  logInfo,
  logSuccess
} from '../_shared/utils.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  // Handle CORS for actual requests
  const corsResponse = setupRequest(req);
  if (corsResponse) return corsResponse;

  try {
    logInfo('Starting authentication', 'IMPORT');
    let user, supabase;

    try {
      const authResult = await authenticateRequest(req);
      user = authResult.user;
      supabase = authResult.supabase;
      logInfo('Authentication successful', 'IMPORT', { userId: user.id });
    } catch (authError) {
      logError(authError, 'IMPORT');
      return errorResponse(`Authentication failed: ${authError instanceof Error ? authError.message : 'Unknown error'}`, 401);
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405);
    }

    logInfo('Creating import job', 'IMPORT', { userId: user.id });

    // Parse JSON body
    const body = await parseJsonBody<Record<string, unknown>>(req);
    const { storage_path, file_name, file_size, format } = body;

    // Validate required fields
    const requiredFields = ['storage_path', 'file_name', 'file_size', 'format'];
    const missingFields = validateRequiredFields(body, requiredFields);

    if (missingFields.length > 0) {
      return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
    }

    // Create import job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        created_by: user.id,
        type: 'data_import',
        status: 'queued',
        data: {
          storagePath: storage_path,
          fileName: file_name,
          fileSize: file_size,
          format: format,
          options: {}
        }
      })
      .select()
      .single();

    if (jobError) {
      logError(jobError, 'IMPORT');
      return errorResponse('Failed to create import job', 500);
    }

    logSuccess('Import job created successfully', 'IMPORT', {
      userId: user.id,
      jobId: job.id,
      fileName: file_name as string
    });

    return successResponse({
      success: true,
      data: {
        jobId: job.id
      },
      message: 'Import job created successfully'
    }, 201);

  } catch (error) {
    logError(error, 'IMPORT');

    if (error instanceof Error) {
      return errorResponse(`Import failed: ${error.message}`, 500);
    } else {
    return errorResponse('Internal server error', 500);
    }
  }
});
