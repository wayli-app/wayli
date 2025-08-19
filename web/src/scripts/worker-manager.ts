#!/usr/bin/env node

import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';

// Get number of workers from command line arguments (default: 1)
const numWorkers = parseInt(process.argv[2]) || 1;

console.log(`🚀 Starting ${numWorkers} worker(s)...`);

const workers: ChildProcess[] = [];

// Start workers
for (let i = 0; i < numWorkers; i++) {
	const workerId = randomUUID();

	console.log(`Starting worker ${i + 1}/${numWorkers} with ID: ${workerId}`);

	const worker = spawn('node', ['src/scripts/worker.ts', workerId], {
		stdio: 'inherit'
	});

	worker.on('error', (error) => {
		console.error(`❌ Worker ${workerId} failed to start:`, error);
	});

	worker.on('exit', (code) => {
		console.log(`🛑 Worker ${workerId} exited with code ${code}`);
	});

	workers.push(worker);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
	console.log('\n🛑 Received SIGINT, shutting down all workers...');
	workers.forEach((worker) => worker.kill('SIGINT'));
	process.exit(0);
});

process.on('SIGTERM', () => {
	console.log('\n🛑 Received SIGTERM, shutting down all workers...');
	workers.forEach((worker) => worker.kill('SIGTERM'));
	process.exit(0);
});

console.log(`✅ All ${numWorkers} worker(s) started. Press Ctrl+C to stop all workers.`);
