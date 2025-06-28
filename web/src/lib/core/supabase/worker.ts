import { createSupabaseClient } from './supabase-factory';

export const supabase = createSupabaseClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);