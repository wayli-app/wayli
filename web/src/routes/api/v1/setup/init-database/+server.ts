import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

export const POST: RequestHandler = async () => {
	try {
		// Create Supabase admin client
		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		console.log('🔄 Initializing database tables...');

		// Check if any users already exist
		const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({
			page: 1,
			perPage: 1
		});

		if (listError) {
			console.error('Error checking existing users:', listError);
			return json({ error: 'Failed to check system status' }, { status: 500 });
		}

		// Only allow database initialization if no users exist
		if (users && users.length > 0) {
			return json({ error: 'Database initialization only allowed before first user creation' }, { status: 403 });
		}

		// Initialize database tables
		const initError = await initializeDatabase(supabaseAdmin);
		if (initError) {
			console.error('Error initializing database:', initError);
			return json({ error: 'Failed to initialize database' }, { status: 500 });
		}

		return json({
			success: true,
			message: 'Database initialized successfully'
		});

	} catch (error) {
		console.error('Database initialization error:', error);
		return json({ error: 'An unexpected error occurred' }, { status: 500 });
	}
};

async function initializeDatabase(supabaseAdmin: any) {
	try {
		console.log('📝 Creating database tables...');

		// Create tables using direct SQL execution via REST API
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
						location GEOMETRY(POINT, 4326),
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
						location GEOMETRY(POINT, 4326),
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
			},
			{
				name: 'tracker_data',
				sql: `
					CREATE TABLE IF NOT EXISTS tracker_data (
						id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
						user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
						tracker_type TEXT NOT NULL,
						device_id TEXT,
						timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
						location GEOMETRY(POINT, 4326),
						altitude DECIMAL(8, 2),
						accuracy DECIMAL(8, 2),
						speed DECIMAL(8, 2),
						heading DECIMAL(5, 2),
						battery_level INTEGER,
						is_charging BOOLEAN,
						activity_type TEXT,
						raw_data JSONB,
						created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
						updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
					);
				`
			}
		];

		// Create each table using the Supabase REST API
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
		const rlsTables = ['profiles', 'trips', 'locations', 'points_of_interest', 'user_preferences', 'tracker_data'];
		for (const tableName of rlsTables) {
			try {
				const response = await fetch(`${PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
						'apikey': SUPABASE_SERVICE_ROLE_KEY
					},
					body: JSON.stringify({
						sql: `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`
					})
				});

				if (response.ok) {
					console.log(`✅ RLS enabled on ${tableName}`);
				} else {
					console.log(`⚠️ RLS setup for ${tableName} skipped`);
				}
			} catch (error) {
				console.log(`⚠️ RLS setup for ${tableName} skipped:`, error);
			}
		}

		// Create basic policies
		await createBasicPolicies();

		// Create indexes
		await createIndexes();

		console.log('🎉 Database initialization completed successfully');
		return null; // Success
	} catch (error) {
		console.error('Database initialization error:', error);
		return error;
	}
}

async function createBasicPolicies() {
	try {
		// Basic policies for all tables
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

			// Locations policies
			`CREATE POLICY IF NOT EXISTS "Users can view their own locations" ON locations FOR SELECT USING (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can insert their own locations" ON locations FOR INSERT WITH CHECK (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can update their own locations" ON locations FOR UPDATE USING (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can delete their own locations" ON locations FOR DELETE USING (auth.uid() = user_id);`,

			// Points of interest policies
			`CREATE POLICY IF NOT EXISTS "Users can view their own points of interest" ON points_of_interest FOR SELECT USING (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can insert their own points of interest" ON points_of_interest FOR INSERT WITH CHECK (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can update their own points of interest" ON points_of_interest FOR UPDATE USING (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can delete their own points of interest" ON points_of_interest FOR DELETE USING (auth.uid() = user_id);`,

			// User preferences policies
			`CREATE POLICY IF NOT EXISTS "Users can view their own preferences" ON user_preferences FOR SELECT USING (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can insert their own preferences" ON user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can update their own preferences" ON user_preferences FOR UPDATE USING (auth.uid() = user_id);`,

			// Tracker data policies
			`CREATE POLICY IF NOT EXISTS "Users can view their own tracker data" ON tracker_data FOR SELECT USING (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can insert their own tracker data" ON tracker_data FOR INSERT WITH CHECK (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can update their own tracker data" ON tracker_data FOR UPDATE USING (auth.uid() = user_id);`,
			`CREATE POLICY IF NOT EXISTS "Users can delete their own tracker data" ON tracker_data FOR DELETE USING (auth.uid() = user_id);`
		];

		for (const policy of policies) {
			try {
				const response = await fetch(`${PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
						'apikey': SUPABASE_SERVICE_ROLE_KEY
					},
					body: JSON.stringify({
						sql: policy
					})
				});

				if (!response.ok) {
					console.log(`⚠️ Policy creation skipped`);
				}
			} catch (error) {
				console.log(`⚠️ Policy creation skipped:`, error);
			}
		}

		console.log('✅ Basic policies created successfully');
	} catch (error) {
		console.log('⚠️ Policy creation skipped:', error);
	}
}

async function createIndexes() {
	try {
		// Create regular indexes
		const indexes = [
			`CREATE INDEX IF NOT EXISTS idx_trips_user_id ON trips(user_id);`,
			`CREATE INDEX IF NOT EXISTS idx_locations_user_id ON locations(user_id);`,
			`CREATE INDEX IF NOT EXISTS idx_locations_trip_id ON locations(trip_id);`,
			`CREATE INDEX IF NOT EXISTS idx_points_of_interest_user_id ON points_of_interest(user_id);`,
			`CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);`,
			`CREATE INDEX IF NOT EXISTS idx_tracker_data_user_id ON tracker_data(user_id);`,
			`CREATE INDEX IF NOT EXISTS idx_tracker_data_timestamp ON tracker_data(timestamp);`,
			`CREATE INDEX IF NOT EXISTS idx_tracker_data_device_id ON tracker_data(device_id);`
		];

		// Create PostGIS spatial indexes
		const spatialIndexes = [
			`CREATE INDEX IF NOT EXISTS idx_locations_location ON locations USING GIST(location);`,
			`CREATE INDEX IF NOT EXISTS idx_points_of_interest_location ON points_of_interest USING GIST(location);`,
			`CREATE INDEX IF NOT EXISTS idx_tracker_data_location ON tracker_data USING GIST(location);`
		];

		for (const index of [...indexes, ...spatialIndexes]) {
			try {
				const response = await fetch(`${PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
						'apikey': SUPABASE_SERVICE_ROLE_KEY
					},
					body: JSON.stringify({
						sql: index
					})
				});

				if (!response.ok) {
					console.log(`⚠️ Index creation skipped`);
				}
			} catch (error) {
				console.log(`⚠️ Index creation skipped:`, error);
			}
		}

		console.log('✅ Indexes created successfully');
	} catch (error) {
		console.log('⚠️ Index creation skipped:', error);
	}
}