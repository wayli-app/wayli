#!/usr/bin/env bun

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Please set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY');
  console.error('You can set them as environment variables or in a .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRealtime() {
  console.log('🧪 Testing Supabase Realtime functionality...\n');
  console.log(`📡 Connecting to: ${supabaseUrl}\n`);

  try {
    // Test 1: Basic connection
    console.log('1. Testing basic realtime connection...');
    const channel = supabase
      .channel('test-connection')
      .on('system', { event: 'disconnect' }, () => {
        console.log('   📡 Realtime disconnected');
      })
      .on('system', { event: 'reconnect' }, () => {
        console.log('   📡 Realtime reconnected');
      })
      .subscribe((status) => {
        console.log(`   📡 Connection status: ${status}`);

        if (status === 'SUBSCRIBED') {
          console.log('   ✅ Basic connection successful');
        } else if (status === 'CHANNEL_ERROR') {
          console.log('   ❌ Connection failed');
        }
      });

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Database changes subscription
    console.log('\n2. Testing database changes subscription...');
    const dbChannel = supabase
      .channel('test-db-changes')
      .on('postgres_changes',
        { event: 'INSERT', table: 'jobs' } as any,
        (payload: any) => {
          console.log('   ✅ Received database change notification:', payload.new.id);
        }
      )
      .subscribe((status) => {
        console.log(`   📡 DB subscription status: ${status}`);
      });

    // Wait for subscription
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: Create a test job to trigger notification
    console.log('\n3. Creating test job to trigger notification...');
    const { data: testJob, error: jobError } = await supabase
      .from('jobs')
      .insert({
        user_id: '00000000-0000-0000-0000-000000000000', // Test user ID
        type: 'test',
        status: 'queued',
        data: { test: true },
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (jobError) {
      console.log('   ⚠️ Could not create test job (table might not exist):', jobError.message);
    } else {
      console.log('   ✅ Test job created:', testJob.id);

      // Wait for notification
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Clean up test job
      await supabase
        .from('jobs')
        .delete()
        .eq('id', testJob.id);
      console.log('   🧹 Test job cleaned up');
    }

    // Test 4: Cleanup
    console.log('\n4. Cleaning up test channels...');
    await supabase.removeChannel(channel);
    await supabase.removeChannel(dbChannel);
    console.log('   ✅ Test channels cleaned up');

    console.log('\n🎉 Realtime test completed successfully!');
    console.log('\nIf you see connection status "SUBSCRIBED", realtime is working correctly.');
    console.log('If you see "CHANNEL_ERROR", check your Supabase project settings.');

  } catch (error: any) {
    console.error('\n❌ Realtime test failed:', error?.message || error);
    process.exit(1);
  }
}

// Run the test
testRealtime();