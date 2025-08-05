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

// Start the worker with retry mechanism
async function startWorkerWithRetry(maxRetries = 3, retryDelay = 2000) {
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			console.log(`🔄 Attempt ${attempt}/${maxRetries} to start worker...`);
			await worker.start();
			console.log('✅ Worker started successfully!');
			return;
		} catch (error) {
			console.error(`❌ Attempt ${attempt} failed:`, error);

			if (attempt < maxRetries) {
				console.log(`⏳ Retrying in ${retryDelay}ms...`);
				await new Promise(resolve => setTimeout(resolve, retryDelay));
				retryDelay *= 2; // Exponential backoff
			} else {
				console.error('❌ All attempts to start worker failed');
				await worker.stop();
				process.exit(1);
			}
		}
	}
}

startWorkerWithRetry();

console.log(`✅ Worker ${workerId} is running. Press Ctrl+C to stop.`);
