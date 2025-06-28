import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

export interface ServerEnvironmentConfig {
  supabase: {
    url: string;
    serviceRoleKey: string;
  };
}

export function validateServerEnvironmentConfig(): ServerEnvironmentConfig {
  const errors: string[] = [];

  if (!PUBLIC_SUPABASE_URL) {
    errors.push('PUBLIC_SUPABASE_URL is not defined');
  } else if (!PUBLIC_SUPABASE_URL.startsWith('http')) {
    errors.push('PUBLIC_SUPABASE_URL must be a valid URL starting with http:// or https://');
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY is not defined');
  } else if (SUPABASE_SERVICE_ROLE_KEY.length < 20) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY appears to be invalid (too short)');
  }

  // Report all errors
  if (errors.length > 0) {
    console.error('Server environment configuration errors:');
    errors.forEach(error => console.error(`- ${error}`));
    throw new Error(`Server environment configuration errors: ${errors.join(', ')}`);
  }

  return {
    supabase: {
      url: PUBLIC_SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY
    }
  };
}

// Export a singleton instance
export const serverEnv = validateServerEnvironmentConfig();

// Helper function
export function getServerSupabaseConfig() {
  return serverEnv.supabase;
}