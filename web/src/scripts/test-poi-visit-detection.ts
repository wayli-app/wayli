#!/usr/bin/env bun

import { PoiVisitDetectionService } from '../lib/services/poi-visit-detection.service';

async function testPoiVisitDetection() {
  console.log('🧪 Testing POI Visit Detection Service...');

  const poiService = new PoiVisitDetectionService();

  try {
    // Test configuration
    const config = {
      minDwellMinutes: 15,
      maxDistanceMeters: 100,
      minConsecutivePoints: 3,
      lookbackDays: 7
    };

    console.log('📋 Configuration:', config);

    // Test for a specific user (you'll need to replace with a real user ID)
    const testUserId = process.env.TEST_USER_ID;

    if (testUserId) {
      console.log(`👤 Testing for user: ${testUserId}`);

      const result = await poiService.detectVisitsForUser(testUserId, config);

      console.log('✅ Detection completed!');
      console.log(`📊 Results: ${result.totalDetected} visits detected`);
      console.log('📍 Visits:', result.visits);

      // Get visit statistics
      const stats = await poiService.getVisitStatistics(testUserId, 30);
      console.log('📈 Visit Statistics (last 30 days):', stats);

    } else {
      console.log('⚠️  No TEST_USER_ID provided, skipping user-specific test');
    }

    // Test for all users
    console.log('👥 Testing for all users...');
    const allUsersResult = await poiService.detectVisitsForAllUsers(config);

    console.log('✅ All users detection completed!');
    console.log(`📊 Results: ${allUsersResult.length} users processed`);

    const totalVisits = allUsersResult.reduce((sum, r) => sum + r.totalDetected, 0);
    console.log(`📍 Total visits detected: ${totalVisits}`);

    allUsersResult.forEach(result => {
      if (result.totalDetected > 0) {
        console.log(`  - User ${result.userId}: ${result.totalDetected} visits`);
      }
    });

  } catch (error) {
    console.error('❌ Error during POI visit detection test:', error);
    process.exit(1);
  }
}

// Run the test
testPoiVisitDetection()
  .then(() => {
    console.log('✅ POI visit detection test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ POI visit detection test failed:', error);
    process.exit(1);
  });