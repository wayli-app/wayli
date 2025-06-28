#!/usr/bin/env bun

import { JobWorker } from '../lib/services/workers/job-worker.service';
import { randomUUID } from 'crypto';

// Get worker ID from command line arguments or generate one
const workerId = process.argv[2] || randomUUID();

console.log(`🚀 Starting standalone worker with ID: ${workerId}`);

// Create and start the worker
const worker = new JobWorker(workerId);

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down worker...');
  await worker.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down worker...');
  await worker.stop();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught exception:', error);
  await worker.stop();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  await worker.stop();
  process.exit(1);
});

// Start the worker
worker.start().catch(async (error) => {
  console.error('❌ Failed to start worker:', error);
  await worker.stop();
  process.exit(1);
});

console.log(`✅ Worker ${workerId} is running. Press Ctrl+C to stop.`);