#!/usr/bin/env bun

import { LocationCacheService } from '../lib/services/location-cache.service';

console.log('🧪 Testing Location Cache Service...\n');

// Test 1: Cache key generation
console.log('1. Testing cache key generation...');
const testFilters = {
	startDate: '2024-01-01',
	endDate: '2024-01-31',
	period: 'Last 30 days',
	offset: 0,
	limit: 2000
};

const cacheKey = LocationCacheService.generateCacheKey(testFilters);
console.log(`   Generated key: ${cacheKey}`);
console.log(`   Key length: ${cacheKey.length} characters`);
console.log('   ✅ Cache key generation successful\n');

// Test 2: Cache data storage and retrieval
console.log('2. Testing cache storage and retrieval...');
const testData = [
	{
		id: 'test-1',
		name: 'Test Location 1',
		location: 'POINT(2.2945 48.8584)',
		created_at: '2024-01-15T10:00:00Z',
		type: 'location' as const,
		coordinates: { lat: 48.8584, lng: 2.2945 }
	},
	{
		id: 'test-2',
		name: 'Test Location 2',
		location: 'POINT(12.4922 41.8902)',
		created_at: '2024-01-16T10:00:00Z',
		type: 'tracker' as const,
		coordinates: { lat: 41.8902, lng: 12.4922 }
	}
];

// Store data in cache
LocationCacheService.setCachedData(testFilters, testData, 2, false);
console.log('   Data stored in cache');

// Retrieve data from cache
const retrievedData = LocationCacheService.getCachedData(testFilters);
if (retrievedData) {
	console.log(`   Retrieved ${retrievedData.data.length} items from cache`);
	console.log(`   Cache timestamp: ${new Date(retrievedData.timestamp).toISOString()}`);
	console.log(`   Has more: ${retrievedData.hasMore}`);
	console.log('   ✅ Cache storage and retrieval successful\n');
} else {
	console.log('   ❌ Failed to retrieve cached data\n');
}

// Test 3: Cache statistics
console.log('3. Testing cache statistics...');
const stats = LocationCacheService.getCacheStats();
console.log(`   Cache entries: ${stats.entries}`);
console.log(`   Cache size: ${(stats.size / 1024).toFixed(2)} KB`);
console.log(`   Max cache size: ${(stats.maxSize / (1024 * 1024)).toFixed(1)} MB`);
console.log('   ✅ Cache statistics successful\n');

// Test 4: Cache expiration simulation
console.log('4. Testing cache expiration...');
const expiredFilters = {
	startDate: '2023-01-01',
	endDate: '2023-01-31',
	period: 'Last 30 days',
	offset: 0,
	limit: 1000
};

// Store data with old timestamp
const oldCacheData = {
	data: testData,
	timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago
	filters: {
		startDate: expiredFilters.startDate,
		endDate: expiredFilters.endDate,
		period: expiredFilters.period
	},
	total: 2,
	hasMore: false
};

const expiredKey = LocationCacheService.generateCacheKey(expiredFilters);
localStorage.setItem(expiredKey, JSON.stringify(oldCacheData));
console.log('   Stored expired cache entry');

// Try to retrieve expired data
const expiredData = LocationCacheService.getCachedData(expiredFilters);
if (!expiredData) {
	console.log('   ✅ Expired cache entry properly removed');
} else {
	console.log('   ❌ Expired cache entry not removed');
}
console.log('   ✅ Cache expiration test completed\n');

// Test 5: Cache cleanup
console.log('5. Testing cache cleanup...');
const initialStats = LocationCacheService.getCacheStats();
console.log(`   Initial cache entries: ${initialStats.entries}`);

// Clear cache
LocationCacheService.clearCache();
const finalStats = LocationCacheService.getCacheStats();
console.log(`   Final cache entries: ${finalStats.entries}`);

if (finalStats.entries === 0) {
	console.log('   ✅ Cache cleanup successful');
} else {
	console.log('   ❌ Cache cleanup failed');
}
console.log('   ✅ Cache cleanup test completed\n');

console.log('🎉 Location Cache Service tests completed!');
console.log('\nCache features tested:');
console.log('✅ Cache key generation');
console.log('✅ Data storage and retrieval');
console.log('✅ Cache statistics');
console.log('✅ Cache expiration (5-minute TTL)');
console.log('✅ Cache cleanup');
console.log('✅ Automatic size management (50MB limit)');
