import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/utils/api/response';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const { user_id } = params;

    if (!user_id) {
      return validationErrorResponse('User ID is required');
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Delete the user
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (error) {
      return errorResponse(error.message, 500);
    }

    return successResponse({
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Admin user delete error:', error);
    return errorResponse(error);
  }
};