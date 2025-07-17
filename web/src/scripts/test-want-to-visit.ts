#!/usr/bin/env bun

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

console.log('🧪 Testing Want-to-Visit Service...');
console.log('📋 Supabase URL:', supabaseUrl);
console.log('🔑 Service Role Key Length:', serviceRoleKey?.length || 0);

async function testWantToVisitService() {
  try {
    // Test 1: Check if table exists
    console.log('\n🔍 Test 1: Checking if want_to_visit_places table exists...');

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: tableCheck, error: tableError } = await supabase
      .from('want_to_visit_places')
      .select('id')
      .limit(1);

    if (tableError) {
      console.error('❌ Table check failed:', tableError);
      console.log('💡 This might mean the table needs to be created. Check the migration file.');
      return;
    }

    console.log('✅ Table exists and is accessible!');
    console.log('📊 Current records:', tableCheck?.length || 0);

    // Test 2: Create a test place
    console.log('\n🔍 Test 2: Creating a test place...');

    const testPlace = {
      title: 'Test Place - Colosseum',
      type: 'Landmarks',
      coordinates: '41.8902, 12.4922',
      description: 'Ancient Roman gladiatorial arena. Should book tickets in advance.',
      address: 'Piazza del Colosseo, 1, 00184 Roma RM, Italy',
      location: 'Rome, Italy',
      markerType: 'camera',
      markerColor: '#EF4444',
      labels: ['history', 'must-see'],
      favorite: false
    };

    // We need a user ID for testing - let's create a test user or use an existing one
    const { data: users, error: usersError } = await supabase
      .from('user_profiles')
      .select('id')
      .limit(1);

    if (usersError || !users || users.length === 0) {
      console.log('⚠️  No users found, creating test place with a dummy user ID...');
      // For testing purposes, we'll use a dummy user ID
      const dummyUserId = '00000000-0000-0000-0000-000000000000';

      const { data: insertData, error: insertError } = await supabase
        .from('want_to_visit_places')
        .insert({
          ...testPlace,
          user_id: dummyUserId
        })
        .select();

      if (insertError) {
        console.error('❌ Failed to insert test place:', insertError);
        return;
      }

      console.log('✅ Test place created successfully!');
      console.log('📝 Created place:', insertData[0]);

      // Test 3: Retrieve the place
      console.log('\n🔍 Test 3: Retrieving the test place...');

      const { data: retrievedPlace, error: retrieveError } = await supabase
        .from('want_to_visit_places')
        .select('*')
        .eq('id', insertData[0].id)
        .single();

      if (retrieveError) {
        console.error('❌ Failed to retrieve test place:', retrieveError);
        return;
      }

      console.log('✅ Test place retrieved successfully!');
      console.log('📝 Retrieved place:', retrievedPlace);

      // Test 4: Update the place
      console.log('\n🔍 Test 4: Updating the test place...');

      const { data: updatedPlace, error: updateError } = await supabase
        .from('want_to_visit_places')
        .update({
          title: 'Updated Test Place - Colosseum',
          favorite: true
        })
        .eq('id', insertData[0].id)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Failed to update test place:', updateError);
        return;
      }

      console.log('✅ Test place updated successfully!');
      console.log('📝 Updated place:', updatedPlace);

      // Test 5: Delete the test place
      console.log('\n🔍 Test 5: Deleting the test place...');

      const { error: deleteError } = await supabase
        .from('want_to_visit_places')
        .delete()
        .eq('id', insertData[0].id);

      if (deleteError) {
        console.error('❌ Failed to delete test place:', deleteError);
        return;
      }

      console.log('✅ Test place deleted successfully!');

    } else {
      console.log('👤 Using existing user for testing:', users[0].id);

      const { data: insertData, error: insertError } = await supabase
        .from('want_to_visit_places')
        .insert({
          ...testPlace,
          user_id: users[0].id
        })
        .select();

      if (insertError) {
        console.error('❌ Failed to insert test place:', insertError);
        return;
      }

      console.log('✅ Test place created successfully!');
      console.log('📝 Created place:', insertData[0]);

      // Clean up
      await supabase
        .from('want_to_visit_places')
        .delete()
        .eq('id', insertData[0].id);

      console.log('🧹 Test place cleaned up!');
    }

    console.log('\n🎉 All tests passed! Want-to-visit service is working correctly.');

  } catch (error) {
    console.error('❌ Unexpected error during testing:', error);
  }
}

// Run the test
testWantToVisitService();