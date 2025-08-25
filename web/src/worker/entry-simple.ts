#!/usr/bin/env node

import { WORKER_ENVIRONMENT, logWorker } from './environment';

// 🚨 WORKER ENVIRONMENT ONLY - This code runs in background workers
// Do not import this in client or server code

console.log('🚀 Starting simple worker test...');
console.log(`⚙️  Environment: Worker Process`);
console.log(`📁 Working directory: ${process.cwd()}`);
console.log(`🔧 Worker environment loaded: ${WORKER_ENVIRONMENT.IS_WORKER}`);

logWorker('Simple worker started successfully', 'info');

// Handle graceful shutdown
process.on('SIGINT', async () => {
	console.log('\n🛑 Received SIGINT, shutting down worker...');
	process.exit(0);
});

process.on('SIGTERM', async () => {
	console.log('\n🛑 Received SIGTERM, shutting down worker...');
	process.exit(0);
});

console.log('✅ Simple worker is running. Press Ctrl+C to stop.');
console.log('🎯 This confirms the basic worker environment is working!');
