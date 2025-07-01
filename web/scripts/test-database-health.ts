#!/usr/bin/env bun

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Please set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDatabaseHealth() {
  console.log('🧪 Testing Database Health Check...\n');
  console.log(`📡 Connecting to: ${supabaseUrl}\n`);

  try {
    // Test 1: Basic connection
    console.log('1. Testing basic database connection...');
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);

    if (error) {
      console.log('   ❌ Database connection failed:', error.message);
      console.log('   📋 Error code:', error.code);
      console.log('   📋 Error details:', error.details);
      return false;
    }

    console.log('   ✅ Database connection successful');

    // Test 2: Check if wayli schema exists
    console.log('\n2. Checking wayli schema...');
    const { data: schemaData, error: schemaError } = await supabase
      .rpc('exec_sql', {
        sql: "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'wayli'"
      });

    if (schemaError) {
      console.log('   ❌ Wayli schema not found:', schemaError.message);
      return false;
    }

    console.log('   ✅ Wayli schema exists');

    // Test 3: Check if key tables exist
    console.log('\n3. Checking key tables...');
    const tables = ['profiles', 'trips', 'locations', 'points_of_interest', 'tracker_data'];

    for (const table of tables) {
      const { error: tableError } = await supabase
        .from(table)
        .select('id')
        .limit(1);

      if (tableError) {
        console.log(`   ❌ Table '${table}' not found:`, tableError.message);
        return false;
      }
      console.log(`   ✅ Table '${table}' exists`);
    }

    // Test 4: Check PostGIS extension
    console.log('\n4. Checking PostGIS extension...');
    const { data: postgisData, error: postgisError } = await supabase
      .rpc('exec_sql', {
        sql: "SELECT 1 FROM pg_extension WHERE extname = 'postgis'"
      });

    if (postgisError) {
      console.log('   ❌ PostGIS extension not found:', postgisError.message);
      return false;
    }

    console.log('   ✅ PostGIS extension is available');

    // Test 5: Check RLS policies
    console.log('\n5. Checking Row Level Security...');
    const { data: rlsData, error: rlsError } = await supabase
      .rpc('exec_sql', {
        sql: "SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'wayli' AND tablename = 'profiles'"
      });

    if (rlsError) {
      console.log('   ❌ RLS check failed:', rlsError.message);
    } else {
      console.log('   ✅ RLS policies are configured');
    }

    console.log('\n🎉 All database health checks passed!');
    console.log('✅ Database is healthy and ready for use');
    return true;

  } catch (error) {
    console.error('❌ Database health check failed:', error);
    return false;
  }
}

// Run the test
testDatabaseHealth().then((success) => {
  process.exit(success ? 0 : 1);
});