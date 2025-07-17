#!/usr/bin/env bun

import { EnhancedPoiDetectionService } from '../lib/services/enhanced-poi-detection.service';

async function testPoiVisitDetection() {
	console.log('🧪 Testing Enhanced POI Detection Service...');

	const poiService = new EnhancedPoiDetectionService();

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
			console.log(`📊 Results: ${result.totalDetected} POIs detected`);
			console.log('📍 POIs:', result.pois);
		} else {
			console.log('⚠️  No TEST_USER_ID provided, skipping user-specific test');
		}

		console.log('✅ Enhanced POI detection test completed!');
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
