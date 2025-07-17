#!/usr/bin/env bun

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('Missing required environment variables');
	process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testExportFunctionality() {
	console.log('🧪 Testing export functionality...');

	try {
		// Test 1: Check if export bucket exists
		console.log('\n1. Checking export bucket...');
		const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();

		if (bucketError) {
			console.error('❌ Error listing buckets:', bucketError);
			return;
		}

		const exportBucket = buckets.find((bucket) => bucket.name === 'exports');
		if (exportBucket) {
			console.log('✅ Export bucket exists');
		} else {
			console.log('❌ Export bucket not found');
		}

		// Test 2: Check if jobs table exists and has data_export type
		console.log('\n2. Checking jobs table for data_export type...');
		const { error: jobsError } = await supabase
			.from('jobs')
			.select('type')
			.eq('type', 'data_export')
			.limit(1);

		if (jobsError) {
			console.error('❌ Error checking jobs table:', jobsError);
			return;
		}

		console.log('✅ Jobs table exists and supports data_export type');

		// Test 3: Check if cleanup function exists
		console.log('\n3. Checking cleanup function...');
		const { error: functionError } = await supabase.rpc('cleanup_expired_exports');

		if (functionError) {
			console.error('❌ Error checking cleanup function:', functionError);
			return;
		}

		console.log('✅ cleanup_expired_exports function exists and is callable');

		// Test 4: Test the cleanup function
		console.log('\n4. Testing cleanup function...');
		const { data: cleanupResult, error: cleanupError } =
			await supabase.rpc('cleanup_expired_exports');

		if (cleanupError) {
			console.error('❌ Error running cleanup function:', cleanupError);
		} else {
			console.log(
				`✅ Cleanup function executed successfully. Deleted ${cleanupResult || 0} expired exports`
			);
		}

		console.log('\n🎉 Export functionality test completed!');
	} catch (error) {
		console.error('❌ Test failed:', error);
	}
}

// Run the test
testExportFunctionality();
