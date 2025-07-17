import { createClient } from '@supabase/supabase-js';

// Use the same environment variables as the app
const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testDatabaseQuery() {
    console.log('🔍 Testing database queries...');

    const userId = '7290ca79-5ebb-460f-b01a-f8ef54ff4f01';

    try {
        // Test 1: Check if we can query trips table at all
        console.log('\n1. Testing basic trips query...');
        const { data: allTrips, error: allTripsError } = await supabase
            .from('trips')
            .select('*')
            .limit(5);

        if (allTripsError) {
            console.error('❌ Error querying all trips:', allTripsError);
        } else {
            console.log('✅ All trips query successful');
            console.log('📊 Total trips in database:', allTrips?.length || 0);
            if (allTrips && allTrips.length > 0) {
                console.log('📋 Sample trip:', {
                    id: allTrips[0].id,
                    user_id: allTrips[0].user_id,
                    title: allTrips[0].title,
                    status: allTrips[0].status
                });
            }
        }

        // Test 2: Check trips for specific user
        console.log('\n2. Testing trips for specific user...');
        const { data: userTrips, error: userTripsError } = await supabase
            .from('trips')
            .select('*')
            .eq('user_id', userId);

        if (userTripsError) {
            console.error('❌ Error querying user trips:', userTripsError);
        } else {
            console.log('✅ User trips query successful');
            console.log('📊 Trips for user:', userTrips?.length || 0);
            if (userTrips && userTrips.length > 0) {
                userTrips.forEach((trip, index) => {
                    console.log(`📋 Trip ${index + 1}:`, {
                        id: trip.id,
                        title: trip.title,
                        status: trip.status,
                        created_at: trip.created_at
                    });
                });
            }
        }

        // Test 3: Check trips with status filter
        console.log('\n3. Testing trips with status filter...');
        const { data: statusTrips, error: statusTripsError } = await supabase
            .from('trips')
            .select('*')
            .in('status', ['active', 'approved'])
            .eq('user_id', userId);

        if (statusTripsError) {
            console.error('❌ Error querying status-filtered trips:', statusTripsError);
        } else {
            console.log('✅ Status-filtered trips query successful');
            console.log('📊 Trips with active/approved status:', statusTrips?.length || 0);
        }

        // Test 4: Check if user exists in auth.users
        console.log('\n4. Testing user existence...');
        const { data: user, error: userError } = await supabase.auth.getUser();

        if (userError) {
            console.error('❌ Error getting user:', userError);
        } else {
            console.log('✅ User query successful');
            console.log('👤 Current user:', user?.user?.id);
            console.log('🔑 User matches target:', user?.user?.id === userId);
        }

    } catch (error) {
        console.error('❌ Unexpected error:', error);
    }
}

testDatabaseQuery();