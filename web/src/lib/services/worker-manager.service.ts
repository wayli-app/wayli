import { JobWorker } from './job-worker.service';
import { JobQueueService } from './job-queue.service';
import { RealtimeSetupService } from './realtime-setup.service';
import type { JobConfig } from '$lib/types/job-queue.types';

// Browser-compatible UUID generation
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export class WorkerManager {
  private workers: JobWorker[] = [];
  private isRunning: boolean = false;
  private cleanupInterval?: NodeJS.Timeout;

  async start(config?: Partial<JobConfig>): Promise<void> {
    if (this.isRunning) return;

    // Initialize realtime functionality first
    console.log('🚀 Initializing realtime functionality...');
    await RealtimeSetupService.initialize();

    // Update configuration
    if (config) {
      JobQueueService.setConfig(config);
    }

    const currentConfig = JobQueueService.getConfig();
    const realtimeStatus = RealtimeSetupService.getStatus();

    console.log(`🚀 Starting worker manager with ${currentConfig.maxWorkers} workers`);
    console.log(`📡 Realtime status: ⚠️ Disabled (database replication not supported)`);

    // Create and start workers with proper UUIDs
    for (let i = 0; i < currentConfig.maxWorkers; i++) {
      const workerId = generateUUID();
      console.log(`🔧 Creating worker with ID: ${workerId}`);
      const worker = new JobWorker(workerId);
      this.workers.push(worker);
      await worker.start();
    }

    this.isRunning = true;

    // Start cleanup process
    this.cleanupInterval = setInterval(async () => {
      await JobQueueService.cleanupStaleJobs();
    }, 60000); // Cleanup every minute

    console.log(`✅ Worker manager started with ${this.workers.length} workers`);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('🛑 Stopping worker manager...');

    // Stop all workers
    await Promise.all(this.workers.map(worker => worker.stop()));
    this.workers = [];

    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    this.isRunning = false;
    console.log('✅ Worker manager stopped');
  }

  async updateWorkerCount(newCount: number): Promise<void> {
    if (newCount < 1) {
      throw new Error('Worker count must be at least 1');
    }

    const currentCount = this.workers.length;
    console.log(`🔄 Updating worker count from ${currentCount} to ${newCount}`);

    if (newCount > currentCount) {
      // Add more workers
      for (let i = currentCount; i < newCount; i++) {
        const worker = new JobWorker(generateUUID());
        this.workers.push(worker);
        await worker.start();
      }
    } else if (newCount < currentCount) {
      // Remove workers (stop the last ones)
      const workersToStop = this.workers.slice(newCount);
      await Promise.all(workersToStop.map(worker => worker.stop()));
      this.workers = this.workers.slice(0, newCount);
    }

    // Update configuration
    JobQueueService.setConfig({ maxWorkers: newCount });

    console.log(`✅ Worker count updated to ${this.workers.length}`);
  }

  async updateConfig(newConfig: Partial<JobConfig>): Promise<void> {
    console.log(`🔄 Updating worker configuration:`, newConfig);

    // Update the configuration
    JobQueueService.setConfig(newConfig);

    // If we're running, restart workers to pick up new config
    if (this.isRunning) {
      console.log(`🔄 Restarting workers with new configuration...`);
      await this.stop();
      await this.start(newConfig);
    }

    console.log(`✅ Worker configuration updated`);
  }

  getWorkerCount(): number {
    return this.workers.length;
  }

  isActive(): boolean {
    return this.isRunning;
  }

  async getStatus(): Promise<{
    isRunning: boolean;
    workerCount: number;
    activeWorkers: number;
    config: JobConfig;
    realtime: {
      isInitialized: boolean;
      isConnected: boolean;
      isAvailable: boolean;
      isEnabled: boolean;
    };
  }> {
    const activeWorkers = await JobQueueService.getActiveWorkers();
    const config = JobQueueService.getConfig();
    const realtimeStatus = RealtimeSetupService.getStatus();

    return {
      isRunning: this.isRunning,
      workerCount: this.workers.length,
      activeWorkers: activeWorkers.length,
      config,
      realtime: {
        isInitialized: realtimeStatus.isInitialized,
        isConnected: realtimeStatus.isConnected,
        isAvailable: RealtimeSetupService.isRealtimeAvailable(),
        isEnabled: realtimeStatus.isEnabled
      }
    };
  }

  async testRealtime(): Promise<boolean> {
    return await RealtimeSetupService.testRealtime();
  }

  getRealtimeConfig(): {
    supabaseUrl: string;
    hasRealtime: boolean;
    isEnabled: boolean;
  } {
    return RealtimeSetupService.getConfigInfo();
  }
}

// Global worker manager instance
export const workerManager = new WorkerManager();