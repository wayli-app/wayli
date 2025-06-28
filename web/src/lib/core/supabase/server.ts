import { createSupabaseClient } from './supabase-factory';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const supabase = createSupabaseClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);