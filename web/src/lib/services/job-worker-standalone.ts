import { JobQueueService } from './job-queue-standalone';
import type { Job, JobType } from '$lib/types/job-queue.types';
import { randomUUID } from 'crypto';

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

    this.isRunning = true;
    await JobQueueService.registerWorker(this.workerId);

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

    console.log(`🛑 Worker ${this.workerId} stopped`);
  }

  private async pollForJobs(): Promise<void> {
    try {
      // Update heartbeat
      await JobQueueService.updateWorkerHeartbeat(
        this.workerId,
        this.currentJob ? 'busy' : 'idle',
        this.currentJob?.id
      );

      // If we're already processing a job, don't get another one
      if (this.currentJob) return;

      // Get next job
      const job = await JobQueueService.getNextJob(this.workerId);
      if (!job) return;

      this.currentJob = job;
      console.log(`📋 Worker ${this.workerId} processing job ${job.id} (${job.type})`);

      // Process the job
      await this.processJob(job);

    } catch (error: any) {
      console.error(`❌ Worker ${this.workerId} error:`, error);

      if (this.currentJob) {
        await this.failJob(this.currentJob.id, error?.message || 'Unknown error');
        this.currentJob = null;
      }
    }
  }

  private async processJob(job: Job): Promise<void> {
    try {
      const processor = this.getJobProcessor(job.type);
      if (!processor) {
        throw new Error(`No processor found for job type: ${job.type}`);
      }

      await processor(job);

    } catch (error: any) {
      console.error(`❌ Worker ${this.workerId} error processing job ${job.id}:`, error);
      await this.failJob(job.id, error?.message || 'Unknown error');
    } finally {
      this.currentJob = null;
    }
  }

  private getJobProcessor(jobType: JobType) {
    const processors: Record<JobType, (job: Job) => Promise<void>> = {
      'reverse_geocoding_full': this.processReverseGeocodingFull.bind(this),
      'reverse_geocoding_missing': this.processReverseGeocodingMissing.bind(this),
      'trip_cover_generation': this.processTripCoverGeneration.bind(this),
      'statistics_update': this.processStatisticsUpdate.bind(this),
      'photo_import': this.processPhotoImport.bind(this),
      'data_cleanup': this.processDataCleanup.bind(this),
      'user_analysis': this.processUserAnalysis.bind(this),
      'data_import': this.processDataImport.bind(this)
    };

    return processors[jobType];
  }

  private async processReverseGeocodingFull(job: Job): Promise<void> {
    console.log(`🌍 Processing reverse geocoding full job ${job.id}`);
    // Implementation would go here
    await this.completeJob(job.id, { processed: true });
  }

  private async processReverseGeocodingMissing(job: Job): Promise<void> {
    console.log(`🌍 Processing reverse geocoding missing job ${job.id}`);
    // Implementation would go here
    await this.completeJob(job.id, { processed: true });
  }

  private async processTripCoverGeneration(job: Job): Promise<void> {
    console.log(`🖼️ Processing trip cover generation job ${job.id}`);
    // Implementation would go here
    await this.completeJob(job.id, { processed: true });
  }

  private async processStatisticsUpdate(job: Job): Promise<void> {
    console.log(`📊 Processing statistics update job ${job.id}`);
    // Implementation would go here
    await this.completeJob(job.id, { processed: true });
  }

  private async processPhotoImport(job: Job): Promise<void> {
    console.log(`📸 Processing photo import job ${job.id}`);
    // Implementation would go here
    await this.completeJob(job.id, { processed: true });
  }

  private async processDataCleanup(job: Job): Promise<void> {
    console.log(`🧹 Processing data cleanup job ${job.id}`);
    // Implementation would go here
    await this.completeJob(job.id, { processed: true });
  }

  private async processUserAnalysis(job: Job): Promise<void> {
    console.log(`📈 Processing user analysis job ${job.id}`);
    // Implementation would go here
    await this.completeJob(job.id, { processed: true });
  }

  private async processDataImport(job: Job): Promise<void> {
    console.log(`📥 Processing data import job ${job.id}`);
    // Implementation would go here
    await this.completeJob(job.id, { processed: true });
  }

  private async updateJobProgress(jobId: string, progress: number, result?: any): Promise<void> {
    try {
      await JobQueueService.updateJobProgress(jobId, progress, result);
    } catch (error: any) {
      console.error(`❌ Worker ${this.workerId} error updating job progress:`, error);
    }
  }

  private async completeJob(jobId: string, result?: any): Promise<void> {
    try {
      await JobQueueService.completeJob(jobId, result);
      console.log(`✅ Worker ${this.workerId} completed job ${jobId}`);
    } catch (error: any) {
      console.error(`❌ Worker ${this.workerId} error completing job:`, error);
      throw error;
    }
  }

  private async failJob(jobId: string, error: string): Promise<void> {
    try {
      await JobQueueService.failJob(jobId, error);
      console.log(`❌ Worker ${this.workerId} failed job ${jobId}: ${error}`);
    } catch (failError: any) {
      console.error(`❌ Worker ${this.workerId} error failing job:`, failError);
    }
  }
}