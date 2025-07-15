export interface WorkerEnvironmentConfig {
  supabase: {
    url: string;
    serviceRoleKey: string;
  };
}

export function validateWorkerEnvironmentConfig(): WorkerEnvironmentConfig {
  const errors: string[] = [];

  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    errors.push('PUBLIC_SUPABASE_URL is not defined');
  } else if (!supabaseUrl.startsWith('http')) {
    errors.push('PUBLIC_SUPABASE_URL must be a valid URL starting with http:// or https://');
  }

  if (!serviceRoleKey) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY is not defined');
  } else if (serviceRoleKey.length < 20) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY appears to be invalid (too short)');
  }

  // Report all errors
  if (errors.length > 0) {
    console.error('Worker environment configuration errors:');
    errors.forEach(error => console.error(`- ${error}`));
    throw new Error(`Worker environment configuration errors: ${errors.join(', ')}`);
  }

  return {
    supabase: {
      url: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!
    }
  };
}

// Export a singleton instance
export const workerEnv = validateWorkerEnvironmentConfig();

// Helper function
export function getWorkerSupabaseConfig() {
  return workerEnv.supabase;
}