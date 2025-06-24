import { supabase } from '$lib/supabase-worker';
import type { Job, JobType, JobStatus, JobPriority, JobConfig, WorkerInfo } from '$lib/types/job-queue.types';

export class JobQueueService {
  private static defaultConfig: JobConfig = {
    maxWorkers: 2,
    pollInterval: 5000,
    jobTimeout: 300000, // 5 minutes
    retryAttempts: 3,
    retryDelay: 60000 // 1 minute
  };

  private static config: JobConfig = { ...this.defaultConfig };

  static setConfig(newConfig: Partial<JobConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  static getConfig(): JobConfig {
    return { ...this.config };
  }

  static async createJob(
    type: JobType,
    data: Record<string, any>,
    priority: JobPriority = 'normal',
    userId: string
  ): Promise<Job> {
    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        type,
        status: 'queued',
        priority,
        data,
        progress: 0,
        created_by: userId
      })
      .select()
      .single();

    if (error) throw error;

    // Log job creation for monitoring
    console.log(`📝 New job created: ${job.id} (${type}) with priority ${priority}`);

    return job;
  }

  static async getNextJob(workerId: string): Promise<Job | null> {
    // Use a transaction-like approach to ensure atomic job claiming
    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .in('status', ['queued'])
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!job) return null;

    // Claim the job atomically - only update if it's still queued
    const { data: updatedJob, error: updateError } = await supabase
      .from('jobs')
      .update({
        status: 'running',
        worker_id: workerId,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id)
      .eq('status', 'queued') // ⚡ CRITICAL: Only claim if still queued
      .select()
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        // Job was already claimed by another worker
        console.log(`⚠️ Job ${job.id} was already claimed by another worker`);
        return null;
      }
      throw updateError;
    }

    if (!updatedJob) {
      // Job was claimed by another worker between our select and update
      console.log(`⚠️ Job ${job.id} was claimed by another worker during update`);
      return null;
    }

    console.log(`✅ Worker ${workerId} successfully claimed job ${job.id}`);
    return updatedJob;
  }

  static async updateJobProgress(jobId: string, progress: number, result?: any): Promise<void> {
    const update: any = { progress, updated_at: new Date().toISOString() };
    if (result) update.result = result;

    const { error } = await supabase
      .from('jobs')
      .update(update)
      .eq('id', jobId);

    if (error) throw error;
  }

  static async completeJob(jobId: string, result?: any): Promise<void> {
    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'completed',
        progress: 100,
        result,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (error) throw error;
  }

  static async failJob(jobId: string, error: string): Promise<void> {
    // First, get the current job to check retry attempts
    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError) throw fetchError;
    if (!job) throw new Error('Job not found');

    const currentRetries = job.retry_count || 0;
    const maxRetries = this.config.retryAttempts;

    if (currentRetries < maxRetries) {
      // Retry the job
      const { error: retryError } = await supabase
        .from('jobs')
        .update({
          status: 'queued',
          retry_count: currentRetries + 1,
          last_error: error,
          updated_at: new Date().toISOString(),
          // Clear worker assignment and timing fields
          worker_id: null,
          started_at: null,
          progress: 0
        })
        .eq('id', jobId);

      if (retryError) throw retryError;

      console.log(`🔄 Job ${jobId} will be retried (attempt ${currentRetries + 1}/${maxRetries})`);
    } else {
      // Max retries reached, mark as failed
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          status: 'failed',
          error: `Failed after ${maxRetries} attempts. Last error: ${error}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      if (updateError) throw updateError;

      console.log(`❌ Job ${jobId} failed permanently after ${maxRetries} attempts`);
    }
  }

  static async cancelJob(jobId: string): Promise<void> {
    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (error) throw error;
  }

  static async getJobs(
    status?: JobStatus,
    userId?: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ jobs: Job[]; total: number }> {
    let query = supabase.from('jobs').select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (userId) query = query.eq('created_by', userId);

    const { data: jobs, error, count } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;

    return {
      jobs: jobs || [],
      total: count || 0
    };
  }

  static async registerWorker(workerId: string): Promise<void> {
    const { error } = await supabase
      .from('workers')
      .upsert({
        id: workerId,
        status: 'idle',
        last_heartbeat: new Date().toISOString(),
        started_at: new Date().toISOString()
      });

    if (error) throw error;
  }

  static async updateWorkerHeartbeat(workerId: string, status: 'idle' | 'busy', currentJob?: string): Promise<void> {
    const { error } = await supabase
      .from('workers')
      .update({
        status,
        current_job: currentJob || null,
        last_heartbeat: new Date().toISOString()
      })
      .eq('id', workerId);

    if (error) throw error;
  }

  static async getActiveWorkers(): Promise<WorkerInfo[]> {
    const { data: workers, error } = await supabase
      .from('workers')
      .select('*')
      .gte('last_heartbeat', new Date(Date.now() - 60000).toISOString()); // Workers active in last minute

    if (error) throw error;
    return workers || [];
  }

  static async cleanupStaleJobs(): Promise<void> {
    const timeoutThreshold = new Date(Date.now() - this.config.jobTimeout).toISOString();

    // Find jobs that have been running too long
    const { data: staleJobs, error: fetchError } = await supabase
      .from('jobs')
      .select('id, retry_count')
      .eq('status', 'running')
      .lt('started_at', timeoutThreshold);

    if (fetchError) throw fetchError;

    if (staleJobs && staleJobs.length > 0) {
      console.log(`🧹 Found ${staleJobs.length} stale jobs to cleanup`);

      for (const job of staleJobs) {
        await this.failJob(job.id, 'Job timed out');
      }
    }
  }

  static async getJobStats(): Promise<{
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    const { data, error } = await supabase
      .from('jobs')
      .select('status');

    if (error) throw error;

    const stats = {
      total: 0,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };

    data?.forEach(job => {
      stats.total++;
      stats[job.status as keyof typeof stats]++;
    });

    return stats;
  }
}