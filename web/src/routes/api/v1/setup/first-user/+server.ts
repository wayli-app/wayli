import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { email, password, firstName, lastName } = await request.json();

		// Validate input
		if (!email || !password || !firstName || !lastName) {
			return json({ error: 'All fields are required' }, { status: 400 });
		}

		if (password.length < 8) {
			return json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
		}

		// Create Supabase admin client
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Check if any users already exist
		const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({
			page: 1,
			perPage: 1
		});

		if (listError) {
			console.error('Error checking existing users:', listError);
			return json({ error: 'Failed to check system status' }, { status: 500 });
		}

		if (users && users.length > 0) {
			return json({ error: 'Setup has already been completed' }, { status: 403 });
		}

		// Create the first user with admin role
		const { data: { user }, error: createError } = await supabaseAdmin.auth.admin.createUser({
			email,
			password,
			email_confirm: true, // Auto-confirm email for first user
			user_metadata: {
				role: 'admin',
				firstName,
				lastName,
				fullName: `${firstName} ${lastName}`
			}
		});

		if (createError) {
			console.error('Error creating first user:', createError);
			return json({ error: 'Failed to create user account' }, { status: 500 });
		}

		if (!user) {
			return json({ error: 'Failed to create user account' }, { status: 500 });
		}

		// Try to create user profile in profiles table
		try {
			const { error: profileError } = await supabaseAdmin
				.from('profiles')
				.insert({
					id: user.id,
					email: user.email,
					first_name: firstName,
					last_name: lastName,
					full_name: `${firstName} ${lastName}`,
					role: 'admin',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				});

			if (profileError) {
				console.error('Error creating user profile:', profileError);
				// Don't fail the setup if profile creation fails
			} else {
				console.log('✅ User profile created successfully');
			}
		} catch (profileError) {
			console.error('Error creating user profile (table might not exist):', profileError);
			// Don't fail the setup if profile creation fails
		}

		// Try to create user preferences
		try {
			const { error: preferencesError } = await supabaseAdmin
				.from('user_preferences')
				.insert({
					user_id: user.id,
					theme: 'light',
					language: 'en',
					notifications_enabled: true,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				});

			if (preferencesError) {
				console.error('Error creating user preferences:', preferencesError);
				// Don't fail the setup if preferences creation fails
			} else {
				console.log('✅ User preferences created successfully');
			}
		} catch (preferencesError) {
			console.error('Error creating user preferences (table might not exist):', preferencesError);
			// Don't fail the setup if preferences creation fails
		}

		return json({
			success: true,
			message: 'Setup completed successfully',
			userId: user.id,
			note: 'Database tables may need to be created manually. Please run the setup-database.sql script in your Supabase SQL editor.'
		});

	} catch (error) {
		console.error('Setup error:', error);
		return json({ error: 'An unexpected error occurred' }, { status: 500 });
	}
};

async function initializeDatabase(supabaseAdmin: any) {
	try {
		console.log('📝 Creating database tables...');

		// Create tables using direct SQL execution
		const tables = [
			{
				name: 'profiles',
				sql: `
					CREATE TABLE IF NOT EXISTS profiles (
						id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
						email TEXT UNIQUE NOT NULL,
						first_name TEXT,
						last_name TEXT,
						full_name TEXT,
						role TEXT DEFAULT 'user',
						avatar_url TEXT,
						created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
						updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
					);
				`
			},
			{
				name: 'trips',
				sql: `
					CREATE TABLE IF NOT EXISTS trips (
						id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
						user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
						title TEXT NOT NULL,
						description TEXT,
						start_date DATE,
						end_date DATE,
						status TEXT DEFAULT 'planned',
						created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
						updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
					);
				`
			},
			{
				name: 'locations',
				sql: `
					CREATE TABLE IF NOT EXISTS locations (
						id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
						user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
						trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
						name TEXT NOT NULL,
						description TEXT,
						latitude DECIMAL(10, 8),
						longitude DECIMAL(11, 8),
						address TEXT,
						created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
						updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
					);
				`
			},
			{
				name: 'points_of_interest',
				sql: `
					CREATE TABLE IF NOT EXISTS points_of_interest (
						id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
						user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
						name TEXT NOT NULL,
						description TEXT,
						category TEXT,
						latitude DECIMAL(10, 8),
						longitude DECIMAL(11, 8),
						address TEXT,
						rating INTEGER CHECK (rating >= 1 AND rating <= 5),
						created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
						updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
					);
				`
			},
			{
				name: 'user_preferences',
				sql: `
					CREATE TABLE IF NOT EXISTS user_preferences (
						id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
						user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
						theme TEXT DEFAULT 'light',
						language TEXT DEFAULT 'en',
						notifications_enabled BOOLEAN DEFAULT true,
						created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
						updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
					);
				`
			}
		];

		// Create each table
		for (const table of tables) {
			try {
				// Use the REST API to execute SQL
				const response = await fetch(`${PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
						'apikey': SUPABASE_SERVICE_ROLE_KEY
					},
					body: JSON.stringify({
						sql: table.sql
					})
				});

				if (!response.ok) {
					console.log(`⚠️ Table ${table.name} might already exist or creation skipped`);
				} else {
					console.log(`✅ Table ${table.name} created successfully`);
				}
			} catch (error) {
				console.log(`⚠️ Table ${table.name} creation skipped (might already exist):`, error);
			}
		}

		// Enable RLS on all tables
		const rlsTables = ['profiles', 'trips', 'locations', 'points_of_interest', 'user_preferences'];
		for (const tableName of rlsTables) {
			try {
				await supabaseAdmin.rpc('exec_sql', {
					sql: `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`
				});
				console.log(`✅ RLS enabled on ${tableName}`);
			} catch (error) {
				console.log(`⚠️ RLS setup for ${tableName} skipped:`, error);
			}
		}

		// Create basic policies
		await createBasicPolicies(supabaseAdmin);

		console.log('🎉 Database initialization completed successfully');
		return null; // Success
	} catch (error) {
		console.error('Database initialization error:', error);
		return error;
	}
}

async function createBasicPolicies(supabaseAdmin: any) {
	try {
		// Basic policies for profiles
		const policies = [
			// Profiles policies
			`CREATE POLICY IF NOT EXISTS "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);`,
			`CREATE POLICY IF NOT EXISTS "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);`,
			`CREATE POLICY IF NOT EXISTS "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);`,

			// Trips policies
			`CREATE POLICY IF NOT EXISTS "Users can view their own trips" ON trips FOR SELECT USING (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can insert their own trips" ON trips FOR INSERT WITH CHECK (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can update their own trips" ON trips FOR UPDATE USING (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can delete their own trips" ON trips FOR DELETE USING (auth.uid() = user_id);`,

			// User preferences policies
			`CREATE POLICY IF NOT EXISTS "Users can view their own preferences" ON user_preferences FOR SELECT USING (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can insert their own preferences" ON user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can update their own preferences" ON user_preferences FOR UPDATE USING (auth.uid() = user_id);`
		];

		for (const policy of policies) {
			try {
				await supabaseAdmin.rpc('exec_sql', { sql: policy });
			} catch (error) {
				console.log(`⚠️ Policy creation skipped:`, error);
			}
		}

		console.log('✅ Basic policies created successfully');
	} catch (error) {
		console.log('⚠️ Policy creation skipped:', error);
	}
}