import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

// Get environment variables
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

console.log('🔧 Testing Supabase Realtime connectivity...');
console.log('📡 Supabase URL:', supabaseUrl);
console.log('🔑 Has anon key:', !!supabaseAnonKey);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testRealtime() {
  try {
    console.log('🌐 Testing basic connectivity...');

    // Test basic REST API connectivity
    const testResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      } as HeadersInit
    });

    console.log('✅ Basic connectivity test:', testResponse.status, testResponse.statusText);

    // Test Realtime channel
    console.log('📡 Testing Realtime channel...');

    const channel = supabase
      .channel('test-channel')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'jobs' },
        (payload) => {
          console.log('🔔 Received job notification:', payload);
        }
      )
      .subscribe((status) => {
        console.log('📡 Channel status:', status);

        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to Realtime!');
          setTimeout(() => {
            console.log('🔒 Closing test channel...');
            supabase.removeChannel(channel);
            process.exit(0);
          }, 5000);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Channel error occurred');
          console.error('🔍 Error details:', {
            supabaseUrl,
            hasAnonKey: !!supabaseAnonKey,
            timestamp: new Date().toISOString()
          });
          process.exit(1);
        } else if (status === 'TIMED_OUT') {
          console.error('⏰ Channel connection timed out');
          process.exit(1);
        }
      });

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testRealtime();