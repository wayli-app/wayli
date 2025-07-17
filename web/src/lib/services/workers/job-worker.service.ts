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
	private cancellationCheckInterval?: NodeJS.Timeout;
	private pollInterval: number = 5000; // 5 seconds default
	private cancellationCheckIntervalMs: number = 10000; // 10 seconds default
	private jobCancelled: boolean = false;

	constructor(workerId?: string) {
		this.workerId = workerId || randomUUID();
	}

	async start(): Promise<void> {
		if (this.isRunning) return;

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

		// Start cancellation checking for running jobs
		this.cancellationCheckInterval = setInterval(async () => {
			if (this.isRunning && this.currentJob) {
				await this.checkJobCancellation();
			}
		}, this.cancellationCheckIntervalMs);

		// Initial poll
		await this.pollForJobs();
	}

	private async checkEnvironmentVariables(): Promise<void> {
		console.log('🔍 Checking worker environment variables...');

		const supabaseUrl = 'http://127.0.0.1:54321';
		const serviceRoleKey =
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

		if (!supabaseUrl) {
			console.error('❌ PUBLIC_SUPABASE_URL is not set! Worker cannot connect to Supabase.');
		}

		if (!serviceRoleKey) {
			console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set! Worker cannot access jobs table.');
		}

		if (!supabaseUrl || !serviceRoleKey) {
			console.error(
				'🚨 Worker will not be able to retrieve jobs due to missing environment variables!'
			);
			console.error(
				'   Please set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running workers.'
			);
		} else {
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

		// Stop cancellation checking
		if (this.cancellationCheckInterval) {
			clearInterval(this.cancellationCheckInterval);
			this.cancellationCheckInterval = undefined;
		}

		// Complete current job if running
		if (this.currentJob) {
			await JobQueueService.failJob(this.currentJob.id, 'Worker stopped');
			this.currentJob = null;
		}

		await this.unregisterWorker();
		console.log(`🛑 Worker ${this.workerId} stopped`);
	}

	private async checkJobCancellation(): Promise<void> {
		if (!this.currentJob) return;

		try {
			// Check if the current job has been cancelled
			const jobStatus = await JobQueueService.getJobStatus(this.currentJob.id);

			if (jobStatus === 'cancelled') {
				console.log(
					`🛑 Worker ${this.workerId} detected job ${this.currentJob.id} was cancelled, stopping processing`
				);
				this.jobCancelled = true;
				// The job processor will handle the cancellation when it next calls checkJobCancellation
				// We just need to mark that the job was cancelled
			}
		} catch (error) {
			console.error(`❌ Worker ${this.workerId} error in cancellation check:`, error);
		}
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
				console.log(
					`🔄 Worker ${this.workerId} already processing job ${this.currentJob.id}, skipping poll`
				);
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
			this.jobCancelled = false;
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

			// Check if job was cancelled during processing
			if (this.jobCancelled) {
				console.log(`🛑 Worker ${this.workerId} job ${job.id} was cancelled during processing`);
				return;
			}

			await this.completeJob(job.id, { processed: true });
		} catch (error: unknown) {
			console.error(`❌ Worker ${this.workerId} error processing job ${job.id}:`, error);

			// Check if the error is due to cancellation
			if (error instanceof Error && error.message === 'Job was cancelled') {
				console.log(`🛑 Worker ${this.workerId} job ${job.id} was cancelled`);
				return;
			}

			const errorMessage = (error as Error)?.message || 'Unknown error';
			await this.failJob(job.id, errorMessage);
		} finally {
			this.currentJob = null;
			this.jobCancelled = false;
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
