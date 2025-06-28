// This file is for server-side worker logic only. Do not import SvelteKit or Vite modules here.
// The Supabase client is provided by JobQueueService, which uses the worker-only client.
// No changes needed unless there are direct supabase imports (which there are not).

import { randomUUID } from 'crypto';
import { JobQueueService } from '../queue/job-queue.service.worker';
import { JobProcessorService } from '../queue/job-processor.service';
import type { Job } from '$lib/types/job-queue.types';

export class JobWorker {
  private workerId: string;
  private isRunning: boolean = false;
  private currentJob: Job | null = null;
  private intervalId?: NodeJS.Timeout;
  private pollInterval: number = 5000; // 5 seconds default

  constructor(workerId?: string) {
    this.workerId = workerId || randomUUID();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    // Debug: Check environment variables
    await this.checkEnvironmentVariables();

    this.isRunning = true;
    await this.registerWorker();

    console.log(`🚀 Worker ${this.workerId} started`);

    // Start polling for jobs
    this.intervalId = setInterval(async () => {
      if (this.isRunning && !this.currentJob) {
        await this.pollForJobs();
      }
    }, this.pollInterval);

    // Initial poll
    await this.pollForJobs();
  }

  private async checkEnvironmentVariables(): Promise<void> {
    console.log('🔍 Checking worker environment variables...');

    const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      console.error('❌ PUBLIC_SUPABASE_URL is not set! Worker cannot connect to Supabase.');
    } else {
      console.log('✅ PUBLIC_SUPABASE_URL is set:', supabaseUrl.substring(0, 20) + '...');
    }

    if (!serviceRoleKey) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set! Worker cannot access jobs table.');
    } else {
      console.log('✅ SUPABASE_SERVICE_ROLE_KEY is set:', serviceRoleKey.substring(0, 10) + '...');
    }

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('🚨 Worker will not be able to retrieve jobs due to missing environment variables!');
      console.error('   Please set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running workers.');
    } else {
      console.log('✅ All required environment variables are set. Testing Supabase connection...');

      // Test the connection by trying to get job stats
      try {
        const stats = await JobQueueService.getJobStats();
        console.log('✅ Supabase connection successful! Job stats:', stats);
      } catch (error) {
        console.error('❌ Failed to connect to Supabase:', error);
        console.error('   This could be due to:');
        console.error('   - Invalid SUPABASE_SERVICE_ROLE_KEY');
        console.error('   - Invalid PUBLIC_SUPABASE_URL');
        console.error('   - Network connectivity issues');
        console.error('   - Database permissions issues');
      }
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    // Stop polling
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    // Complete current job if running
    if (this.currentJob) {
      await JobQueueService.failJob(this.currentJob.id, 'Worker stopped');
      this.currentJob = null;
    }

    await this.unregisterWorker();
    console.log(`🛑 Worker ${this.workerId} stopped`);
  }

  private async registerWorker(): Promise<void> {
    // Register worker in the database (if you have a workers table)
    // This could be used for monitoring and management
    console.log(`📝 Worker ${this.workerId} registered`);
  }

  private async pollForJobs(): Promise<void> {
    try {
      // If we're already processing a job, don't get another one
      if (this.currentJob) {
        console.log(`🔄 Worker ${this.workerId} already processing job ${this.currentJob.id}, skipping poll`);
        return;
      }

      // console.log(`🔍 Worker ${this.workerId} polling for jobs...`);

      // Get next job
      const job = await JobQueueService.getNextJob(this.workerId);
      if (!job) {
        // console.log(`⏳ Worker ${this.workerId} found no available jobs`);
        return;
      }

      this.currentJob = job;
      console.log(`📋 Worker ${this.workerId} claimed job ${job.id} (${job.type})`);

      // Process the job
      await this.processJob(job);

    } catch (error: unknown) {
      console.error(`❌ Worker ${this.workerId} error during polling:`, error);

      if (this.currentJob) {
        await this.failJob(this.currentJob.id, (error as Error)?.message || 'Unknown error');
        this.currentJob = null;
      }
    }
  }

  private async processJob(job: Job): Promise<void> {
    try {
      await JobProcessorService.processJob(job);
      await this.completeJob(job.id, { processed: true });

    } catch (error: unknown) {
      console.error(`❌ Worker ${this.workerId} error processing job ${job.id}:`, error);

      const errorMessage = (error as Error)?.message || 'Unknown error';
      await this.failJob(job.id, errorMessage);
    } finally {
      this.currentJob = null;
    }
  }

  private async updateJobProgress(
    jobId: string,
    progress: number,
    result?: Record<string, unknown>
  ): Promise<void> {
    try {
      await JobQueueService.updateJobProgress(jobId, progress, result);
    } catch (error: unknown) {
      console.error(`❌ Worker ${this.workerId} error updating job progress:`, error);
    }
  }

  private async completeJob(jobId: string, result?: Record<string, unknown>): Promise<void> {
    try {
      await JobQueueService.completeJob(jobId, result);
      console.log(`✅ Worker ${this.workerId} completed job ${jobId}`);
    } catch (error: unknown) {
      console.error(`❌ Worker ${this.workerId} error completing job:`, error);
      throw error;
    }
  }

  private async failJob(jobId: string, error: string): Promise<void> {
    try {
      await JobQueueService.failJob(jobId, error);
      console.log(`❌ Worker ${this.workerId} failed job ${jobId}: ${error}`);
    } catch (failError: unknown) {
      console.error(`❌ Worker ${this.workerId} error failing job:`, failError);
    }
  }

  private async unregisterWorker(): Promise<void> {
    // Unregister worker in the database (if you have a workers table)
    // This could be used for monitoring and management
    console.log(`🗑️ Worker ${this.workerId} unregistered`);
  }
}