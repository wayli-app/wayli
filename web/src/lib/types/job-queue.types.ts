export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  priority: JobPriority;
  data: Record<string, any>;
  progress: number;
  result?: any;
  error?: string;
  last_error?: string; // Last error before retry
  retry_count?: number; // Number of retry attempts
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  created_by: string;
  worker_id?: string;
}

export type JobType =
  | 'reverse_geocoding_full'
  | 'reverse_geocoding_missing'
  | 'trip_cover_generation'
  | 'statistics_update'
  | 'photo_import'
  | 'data_cleanup'
  | 'user_analysis';

export type JobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type JobPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface JobConfig {
  maxWorkers: number;
  pollInterval: number; // milliseconds
  jobTimeout: number; // milliseconds
  retryAttempts: number;
  retryDelay: number; // milliseconds
}

export interface WorkerInfo {
  id: string;
  status: 'idle' | 'busy' | 'stopped';
  current_job?: string;
  last_heartbeat: string;
  started_at: string;
}