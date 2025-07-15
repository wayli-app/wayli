import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export interface EnvironmentConfig {
  // Supabase Configuration
  supabase: {
    url: string;
    anonKey: string;
  };

  // Worker Configuration
  workers: {
    maxWorkers: number;
    pollInterval: number;
    jobTimeout: number;
    retryAttempts: number;
    retryDelay: number;
  };

  // External Services
  nominatim: {
    endpoint: string;
    rateLimit: number;
  };

  pexels: {
    accessKey: string;
  };

  // Application Configuration
  app: {
    nodeEnv: string;
    isDevelopment: boolean;
    isProduction: boolean;
  };
}

export function validateEnvironmentConfig(): EnvironmentConfig {
  const errors: string[] = [];

  // Validate Supabase configuration
  if (!PUBLIC_SUPABASE_URL) {
    errors.push('PUBLIC_SUPABASE_URL is not defined');
  } else if (!PUBLIC_SUPABASE_URL.startsWith('http')) {
    errors.push('PUBLIC_SUPABASE_URL must be a valid URL starting with http:// or https://');
  }

  if (!PUBLIC_SUPABASE_ANON_KEY) {
    errors.push('PUBLIC_SUPABASE_ANON_KEY is not defined');
  } else if (PUBLIC_SUPABASE_ANON_KEY.length < 20) {
    errors.push('PUBLIC_SUPABASE_ANON_KEY appears to be invalid (too short)');
  }

  // Validate worker configuration
  const maxWorkers = parseInt(process.env.MAX_WORKERS || '2');
  if (isNaN(maxWorkers) || maxWorkers < 1 || maxWorkers > 10) {
    errors.push('MAX_WORKERS must be a number between 1 and 10');
  }

  const pollInterval = parseInt(process.env.WORKER_POLL_INTERVAL || '5000');
  if (isNaN(pollInterval) || pollInterval < 1000 || pollInterval > 30000) {
    errors.push('WORKER_POLL_INTERVAL must be a number between 1000 and 30000');
  }

  const jobTimeout = parseInt(process.env.JOB_TIMEOUT || '300000');
  if (isNaN(jobTimeout) || jobTimeout < 60000 || jobTimeout > 3600000) {
    errors.push('JOB_TIMEOUT must be a number between 60000 and 3600000');
  }

  const retryAttempts = parseInt(process.env.RETRY_ATTEMPTS || '3');
  if (isNaN(retryAttempts) || retryAttempts < 0 || retryAttempts > 10) {
    errors.push('RETRY_ATTEMPTS must be a number between 0 and 10');
  }

  const retryDelay = parseInt(process.env.RETRY_DELAY || '60000');
  if (isNaN(retryDelay) || retryDelay < 1000 || retryDelay > 300000) {
    errors.push('RETRY_DELAY must be a number between 1000 and 300000');
  }

  // Validate Nominatim configuration
  const nominatimEndpoint = process.env.NOMINATIM_ENDPOINT || 'https://nominatim.int.hazen.nu';
  if (!nominatimEndpoint.startsWith('http')) {
    errors.push('NOMINATIM_ENDPOINT must be a valid URL starting with http:// or https://');
  }

  const nominatimRateLimit = parseFloat(process.env.NOMINATIM_RATE_LIMIT || '1');
  if (isNaN(nominatimRateLimit) || nominatimRateLimit < 0.1 || nominatimRateLimit > 10) {
    errors.push('NOMINATIM_RATE_LIMIT must be a number between 0.1 and 10');
  }

  // Note: Pexels access key is optional, so we don't validate it
  const pexelsAccessKey = process.env.PEXELS_ACCESS_KEY || '';

  // Report all errors
  if (errors.length > 0) {
    console.error('Environment configuration errors:');
    errors.forEach(error => console.error(`- ${error}`));
    throw new Error(`Environment configuration errors: ${errors.join(', ')}`);
  }

  return {
    supabase: {
      url: PUBLIC_SUPABASE_URL,
      anonKey: PUBLIC_SUPABASE_ANON_KEY
    },
    workers: {
      maxWorkers,
      pollInterval,
      jobTimeout,
      retryAttempts,
      retryDelay
    },
    nominatim: {
      endpoint: nominatimEndpoint,
      rateLimit: nominatimRateLimit
    },
    pexels: {
      accessKey: pexelsAccessKey
    },
    app: {
      nodeEnv: process.env.NODE_ENV || 'development',
      isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
      isProduction: (process.env.NODE_ENV || 'development') === 'production'
    }
  };
}

// Export a singleton instance
export const env = validateEnvironmentConfig();

// Helper functions for common environment checks
export function isDevelopment(): boolean {
  return env.app.isDevelopment;
}

export function isProduction(): boolean {
  return env.app.isProduction;
}

export function getSupabaseConfig() {
  return env.supabase;
}

export function getWorkerConfig() {
  return env.workers;
}

export function getNominatimConfig() {
  return env.nominatim;
}

export function getPexelsConfig() {
  return env.pexels;
}