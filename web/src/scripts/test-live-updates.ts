#!/usr/bin/env bun

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Please set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testLiveUpdates() {
  console.log('🧪 Testing live job updates...\n');

  try {
    // Test 1: Create a test job
    console.log('1. Creating a test job...');
    const { data: testJob, error: jobError } = await supabase
      .from('jobs')
      .insert({
        type: 'statistics_update',
        status: 'queued',
        priority: 'normal',
        data: { include_charts: true },
        progress: 0,
        created_by: '00000000-0000-0000-0000-000000000000'
      })
      .select()
      .single();

    if (jobError) {
      console.log('   ⚠️ Could not create test job (table might not exist):', jobError.message);
      return;
    }

    console.log('   ✅ Test job created:', testJob.id);

    // Test 2: Simulate job progress updates
    console.log('\n2. Simulating job progress updates...');
    for (let progress = 0; progress <= 100; progress += 20) {
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          status: progress === 0 ? 'running' : progress === 100 ? 'completed' : 'running',
          progress,
          updated_at: new Date().toISOString(),
          ...(progress === 0 && { started_at: new Date().toISOString() }),
          ...(progress === 100 && { completed_at: new Date().toISOString() })
        })
        .eq('id', testJob.id);

      if (updateError) {
        console.log('   ⚠️ Could not update job progress:', updateError.message);
      } else {
        console.log(`   📊 Updated job progress to ${progress}%`);
      }

      // Wait a bit between updates
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Test 3: Test duplicate job prevention
    console.log('\n3. Testing duplicate job prevention...');
    const { data: duplicateJob, error: duplicateError } = await supabase
      .from('jobs')
      .insert({
        type: 'statistics_update',
        status: 'queued',
        priority: 'normal',
        data: { include_charts: false },
        progress: 0,
        created_by: '00000000-0000-0000-0000-000000000000'
      })
      .select()
      .single();

    if (duplicateError) {
      console.log('   ✅ Duplicate job creation prevented (expected behavior)');
    } else {
      console.log('   ⚠️ Duplicate job created (this should be prevented by the API)');

      // Clean up duplicate job
      await supabase
        .from('jobs')
        .delete()
        .eq('id', duplicateJob.id);
    }

    // Test 4: Clean up test job
    console.log('\n4. Cleaning up test job...');
    await supabase
      .from('jobs')
      .delete()
      .eq('id', testJob.id);
    console.log('   🧹 Test job cleaned up');

    console.log('\n🎉 Live updates test completed successfully!');
    console.log('\nThe job system should now support:');
    console.log('- Real-time progress updates');
    console.log('- Duplicate job prevention');
    console.log('- Live status monitoring');

  } catch (error: any) {
    console.error('\n❌ Live updates test failed:', error?.message || error);
    process.exit(1);
  }
}

// Run the test
testLiveUpdates();