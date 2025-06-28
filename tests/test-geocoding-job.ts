#!/usr/bin/env bun

import { JobQueueService } from '../lib/services/job-queue-standalone';
import { JobWorker } from '../lib/services/job-worker-standalone';

async function testGeocodingJob() {
  console.log('🧪 Testing reverse geocoding job functionality...\n');

  try {
    // Create a test job
    console.log('1. Creating test reverse geocoding job...');
    const job = await JobQueueService.createJob(
      'reverse_geocoding_missing',
      {},
      'normal',
      '00000000-0000-0000-0000-000000000000' // Test user ID
    );

    console.log(`✅ Created job: ${job.id}`);

    // Create a worker and process the job
    console.log('\n2. Starting job worker...');
    const worker = new JobWorker('test-worker');

    // Process the job manually (for testing)
    console.log('\n3. Processing job...');
    await worker['processJob'](job);

    console.log('\n✅ Geocoding job test completed!');
    console.log('Note: This test will only work if you have points in your database that need geocoding.');

  } catch (error) {
    console.error('❌ Error testing geocoding job:', error);
  }
}

testGeocodingJob().catch(console.error);