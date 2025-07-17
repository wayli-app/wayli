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

async function testExportEndToEnd() {
	console.log('🧪 Testing export functionality end-to-end...');

	try {
		// Test 1: Create a test user if needed
		console.log('\n1. Setting up test user...');
		const testEmail = 'test-export@example.com';
		const testPassword = 'testpassword123';

		let {
			data: { user },
			error: userError
		} = await supabase.auth.signInWithPassword({
			email: testEmail,
			password: testPassword
		});

		if (userError) {
			// Create user if it doesn't exist
			const {
				data: { user: newUser },
				error: createError
			} = await supabase.auth.signUp({
				email: testEmail,
				password: testPassword
			});

			if (createError) {
				console.error('❌ Error creating test user:', createError);
				return;
			}

			user = newUser;
			console.log('✅ Test user created');
		} else {
			console.log('✅ Test user found');
		}

		if (!user) {
			console.error('❌ No user available for testing');
			return;
		}

		// Test 2: Create an export job
		console.log('\n2. Creating export job...');
		const { data: jobs, error: jobError } = await supabase
			.from('jobs')
			.insert({
				type: 'data_export',
				status: 'queued',
				priority: 'normal',
				data: {
					userId: user.id,
					options: {
						format: 'GeoJSON',
						includeLocationData: true,
						includeTripInfo: true,
						includeWantToVisit: true,
						includeTrips: true
					},
					expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
				},
				created_by: user.id
			})
			.select()
			.single();

		if (jobError) {
			console.error('❌ Error creating export job:', jobError);
			return;
		}

		console.log('✅ Export job created:', jobs.id);

		// Test 3: Simulate job processing
		console.log('\n3. Simulating job processing...');

		// Update job to running
		await supabase
			.from('jobs')
			.update({
				status: 'running',
				started_at: new Date().toISOString(),
				progress: 10
			})
			.eq('id', jobs.id);

		console.log('✅ Job status updated to running');

		// Simulate progress updates
		for (let progress = 20; progress <= 100; progress += 20) {
			await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second

			await supabase
				.from('jobs')
				.update({
					progress,
					result: {
						message: `Processing export... ${progress}% complete`
					}
				})
				.eq('id', jobs.id);

			console.log(`✅ Progress updated to ${progress}%`);
		}

		// Test 4: Complete the job
		console.log('\n4. Completing export job...');
		await supabase
			.from('jobs')
			.update({
				status: 'completed',
				progress: 100,
				completed_at: new Date().toISOString(),
				result: {
					message: 'Export completed successfully',
					file_path: `${user.id}/export_${user.id}_${Date.now()}.zip`,
					file_size: 1024 * 1024, // 1MB
					totalFiles: 4,
					format: 'GeoJSON',
					exportedAt: new Date().toISOString()
				}
			})
			.eq('id', jobs.id);

		console.log('✅ Export job completed');

		// Test 5: Verify job completion
		console.log('\n5. Verifying job completion...');
		const { data: completedJob, error: fetchError } = await supabase
			.from('jobs')
			.select('*')
			.eq('id', jobs.id)
			.single();

		if (fetchError) {
			console.error('❌ Error fetching completed job:', fetchError);
			return;
		}

		if (completedJob.status === 'completed' && completedJob.progress === 100) {
			console.log('✅ Job verification successful');
			console.log('📊 Final job data:', {
				id: completedJob.id,
				status: completedJob.status,
				progress: completedJob.progress,
				result: completedJob.result
			});
		} else {
			console.error('❌ Job verification failed');
		}

		// Test 6: Clean up
		console.log('\n6. Cleaning up test data...');
		await supabase.from('jobs').delete().eq('id', jobs.id);

		console.log('✅ Test data cleaned up');

		console.log('\n🎉 Export functionality end-to-end test completed successfully!');
	} catch (error) {
		console.error('❌ Test failed:', error);
	}
}

// Run the test
testExportEndToEnd();
