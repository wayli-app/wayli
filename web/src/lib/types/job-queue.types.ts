export interface Job {
    id: string;
    type: JobType;
    status: JobStatus;
    data: Record<string, unknown>;
    progress: number;
    result?: Record<string, unknown>;
    error?: string;
    last_error?: string; // Last error before retry
    retry_count?: number; // Number of retry attempts
    created_at: string;
    updated_at: string;
    started_at?: string;
    completed_at?: string;
    created_by: string;
    worker_id?: string;
    priority: JobPriority;
  }

export type JobType = 'reverse_geocoding_missing' | 'trip_cover_generation' | 'data_import' | 'poi_visit_detection';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type JobPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface JobConfig {
  maxWorkers: number;
  pollInterval: number;
  jobTimeout: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface WorkerInfo {
  id: string;
  user_id?: string;
  status: 'idle' | 'busy' | 'stopped';
  current_job?: string;
  last_heartbeat: string;
  started_at: string;
  updated_at: string;
}
