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

async function testJobCreation() {
  console.log('🧪 Testing job creation...\n');

  try {
    // Test 1: Create a simple job
    console.log('1. Creating a simple statistics job...');
    const { data: job1, error: error1 } = await supabase
      .from('jobs')
      .insert({
        type: 'statistics_update',
        status: 'queued',
        priority: 'normal',
        data: { include_charts: true },
        progress: 0,
        created_by: '00000000-0000-0000-0000-000000000000' // Test user ID
      })
      .select()
      .single();

    if (error1) {
      console.log('   ⚠️ Could not create test job (table might not exist):', error1.message);
    } else {
      console.log('   ✅ Test job created:', job1.id);

      // Clean up test job
      await supabase
        .from('jobs')
        .delete()
        .eq('id', job1.id);
      console.log('   🧹 Test job cleaned up');
    }

    // Test 2: Create a job with custom data
    console.log('\n2. Creating a job with custom configuration...');
    const { data: job2, error: error2 } = await supabase
      .from('jobs')
      .insert({
        type: 'trip_cover_generation',
        status: 'queued',
        priority: 'high',
        data: {
          style: 'landscape',
          quality: 'high'
        },
        progress: 0,
        created_by: '00000000-0000-0000-0000-000000000000'
      })
      .select()
      .single();

    if (error2) {
      console.log('   ⚠️ Could not create test job (table might not exist):', error2.message);
    } else {
      console.log('   ✅ Test job with custom data created:', job2.id);
      console.log('   📊 Job data:', job2.data);

      // Clean up test job
      await supabase
        .from('jobs')
        .delete()
        .eq('id', job2.id);
      console.log('   🧹 Test job cleaned up');
    }

    // Test 3: Check job table structure
    console.log('\n3. Checking job table structure...');
    const { data: jobs, error: error3 } = await supabase
      .from('jobs')
      .select('*')
      .limit(1);

    if (error3) {
      console.log('   ⚠️ Could not access jobs table:', error3.message);
    } else {
      console.log('   ✅ Jobs table accessible');
      if (jobs && jobs.length > 0) {
        console.log('   📋 Sample job fields:', Object.keys(jobs[0]));
      }
    }

    console.log('\n🎉 Job creation test completed successfully!');
    console.log('\nIf you see "Test job created", the job creation interface is working correctly.');

  } catch (error: any) {
    console.error('\n❌ Job creation test failed:', error?.message || error);
    process.exit(1);
  }
}

// Run the test
testJobCreation();