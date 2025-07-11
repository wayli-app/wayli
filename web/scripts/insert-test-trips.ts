#!/usr/bin/env bun

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function insertTestTrips() {
  console.log('🧪 Inserting test trips...\n');

  try {
    // Get the first user (for testing purposes)
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);

    if (usersError || !users || users.length === 0) {
      console.error('❌ No users found in database');
      return;
    }

    const userId = users[0].id;
    console.log(`👤 Using user ID: ${userId}`);

    // Test trips data
    const testTrips = [
      {
        user_id: userId,
        title: 'Weekend in Amsterdam',
        description: 'A wonderful weekend exploring the canals and museums',
        start_date: '2024-06-15',
        end_date: '2024-06-17',
        status: 'active',
        image_url: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800&h=400&fit=crop',
        labels: ['auto-generated', 'weekend', 'city'],
        metadata: {
          distance_traveled: 125.5,
          visited_places_count: 8,
          cityName: 'Amsterdam',
          location: { type: 'Point', coordinates: [4.9041, 52.3676] },
          jobId: 'test-job-1'
        }
      },
      {
        user_id: userId,
        title: 'Hiking in the Alps',
        description: 'Challenging mountain trails with breathtaking views',
        start_date: '2024-05-20',
        end_date: '2024-05-25',
        status: 'active',
        image_url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=400&fit=crop',
        labels: ['auto-generated', 'hiking', 'mountains'],
        metadata: {
          distance_traveled: 45.2,
          visited_places_count: 12,
          cityName: 'Alps',
          location: { type: 'Point', coordinates: [10.4515, 46.8182] },
          jobId: 'test-job-2'
        }
      },
      {
        user_id: userId,
        title: 'City Walk in Paris',
        description: 'Exploring the beautiful streets and landmarks',
        start_date: '2024-06-10',
        end_date: '2024-06-10',
        status: 'active',
        image_url: 'https://images.unsplash.com/photo-1502602898535-0b7b5b2c0b0b?w=800&h=400&fit=crop',
        labels: ['manual', 'city', 'walking'],
        metadata: {
          distance_traveled: 8.7,
          visited_places_count: 5
        }
      },
      {
        user_id: userId,
        title: 'Beach Vacation in Bali',
        description: 'Relaxing days by the ocean and exploring local culture',
        start_date: '2024-04-15',
        end_date: '2024-04-22',
        status: 'active',
        image_url: 'https://images.unsplash.com/photo-1537953773345-d172ccf13cf1?w=800&h=400&fit=crop',
        labels: ['auto-generated', 'beach', 'vacation'],
        metadata: {
          distance_traveled: 0, // Local vacation
          visited_places_count: 15,
          cityName: 'Bali',
          location: { type: 'Point', coordinates: [115.1889, -8.4095] },
          jobId: 'test-job-3'
        }
      }
    ];

    // Insert test trips
    const { data: insertedTrips, error: insertError } = await supabase
      .from('trips')
      .insert(testTrips)
      .select();

    if (insertError) {
      console.error('❌ Error inserting test trips:', insertError);
      return;
    }

    console.log(`✅ Successfully inserted ${insertedTrips?.length || 0} test trips`);

    if (insertedTrips) {
      console.log('\n📋 Inserted trips:');
      insertedTrips.forEach((trip, index) => {
        console.log(`  ${index + 1}. ${trip.title} (${trip.labels?.includes('auto-generated') ? 'Auto-generated' : 'Manual'})`);
      });
    }

    console.log('\n✅ Test trips insertion completed!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the script
insertTestTrips();