import type { RequestHandler } from './$types';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { DatabaseMigrationService } from '$lib/services/database/migration.service';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { Client } from 'pg';

// SQL script to create the database schema
const SETUP_SQL = `
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    role TEXT DEFAULT 'user',
    avatar_url TEXT,
    home_address JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'light',
    language TEXT DEFAULT 'en',
    notifications_enabled BOOLEAN DEFAULT true,
    timezone TEXT DEFAULT 'UTC+00:00 (London, Dublin)',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trips table
CREATE TABLE IF NOT EXISTS public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    image_url TEXT,
    labels TEXT[] DEFAULT '{}',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create locations table
CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    location GEOMETRY(POINT, 4326),
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create points_of_interest table
CREATE TABLE IF NOT EXISTS public.points_of_interest (
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

-- Create poi_visits table
CREATE TABLE IF NOT EXISTS public.poi_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    poi_id UUID REFERENCES public.points_of_interest(id) ON DELETE CASCADE,
    visit_start TIMESTAMP WITH TIME ZONE NOT NULL,
    visit_end TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER NOT NULL,
    location GEOMETRY(POINT, 4326),
    address TEXT,
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    visit_type TEXT DEFAULT 'detected' CHECK (visit_type IN ('detected', 'manual', 'confirmed')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, poi_id, visit_start)
);

-- Create tracker_data table
CREATE TABLE IF NOT EXISTS public.tracker_data (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    tracker_type TEXT NOT NULL,
    device_id TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    location GEOMETRY(POINT, 4326),
    country_code VARCHAR(2),
    altitude DECIMAL(8, 2),
    accuracy DECIMAL(8, 2),
    speed DECIMAL(8, 2),
    heading DECIMAL(5, 2),
    battery_level INTEGER,
    is_charging BOOLEAN,
    activity_type TEXT,
    raw_data JSONB,
    reverse_geocode JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, location, recorded_at)
);

-- Create geocoded_points table
CREATE TABLE IF NOT EXISTS public.geocoded_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    location GEOMETRY(POINT, 4326),
    address TEXT,
    geocoding_data JSONB,
    geocoded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(table_name, record_id)
);

-- Create jobs table
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    data JSONB NOT NULL DEFAULT '{}',
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    result JSONB,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    worker_id TEXT
);

-- Create workers table
CREATE TABLE IF NOT EXISTS public.workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'stopped')),
    current_job UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create temp_files table
CREATE TABLE IF NOT EXISTS public.temp_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_content TEXT NOT NULL,
    format TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Create trip_exclusions table
CREATE TABLE IF NOT EXISTS public.trip_exclusions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    exclusion_type TEXT NOT NULL CHECK (exclusion_type IN ('city', 'address', 'region')),
    location JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_priority ON public.jobs(priority);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON public.jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_trips_user_id ON public.trips(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_user_id ON public.locations(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_trip_id ON public.locations(trip_id);
CREATE INDEX IF NOT EXISTS idx_points_of_interest_user_id ON public.points_of_interest(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_id ON public.user_preferences(id);
CREATE INDEX IF NOT EXISTS idx_tracker_data_user_id ON public.tracker_data(user_id);
CREATE INDEX IF NOT EXISTS idx_tracker_data_timestamp ON public.tracker_data(recorded_at);
CREATE INDEX IF NOT EXISTS idx_geocoded_points_user_id ON public.geocoded_points(user_id);
CREATE INDEX IF NOT EXISTS idx_workers_status ON public.workers(status);
CREATE INDEX IF NOT EXISTS idx_temp_files_user_id ON public.temp_files(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_exclusions_user_id ON public.trip_exclusions(user_id);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_of_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poi_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geocoded_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.temp_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_exclusions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view their own preferences" ON public.user_preferences FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert their own preferences" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own preferences" ON public.user_preferences FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view their own trips" ON public.trips FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own trips" ON public.trips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own trips" ON public.trips FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own trips" ON public.trips FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own locations" ON public.locations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own locations" ON public.locations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own locations" ON public.locations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own locations" ON public.locations FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own points of interest" ON public.points_of_interest FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own points of interest" ON public.points_of_interest FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own points of interest" ON public.points_of_interest FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own points of interest" ON public.points_of_interest FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own poi visits" ON public.poi_visits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own poi visits" ON public.poi_visits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own poi visits" ON public.poi_visits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own poi visits" ON public.poi_visits FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own tracker data" ON public.tracker_data FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own tracker data" ON public.tracker_data FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own tracker data" ON public.tracker_data FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own tracker data" ON public.tracker_data FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own geocoded points" ON public.geocoded_points FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own geocoded points" ON public.geocoded_points FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own geocoded points" ON public.geocoded_points FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own geocoded points" ON public.geocoded_points FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own jobs" ON public.jobs FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "Users can insert their own jobs" ON public.jobs FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own jobs" ON public.jobs FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Users can delete their own jobs" ON public.jobs FOR DELETE USING (auth.uid() = created_by);

CREATE POLICY "Users can view their own temp files" ON public.temp_files FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own temp files" ON public.temp_files FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own temp files" ON public.temp_files FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own trip exclusions" ON public.trip_exclusions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own trip exclusions" ON public.trip_exclusions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own trip exclusions" ON public.trip_exclusions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own trip exclusions" ON public.trip_exclusions FOR DELETE USING (auth.uid() = user_id);

-- Create functions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'role', 'user')
    );

    INSERT INTO public.user_preferences (id)
    VALUES (NEW.id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update workers updated_at
CREATE OR REPLACE FUNCTION public.update_workers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for workers updated_at
DROP TRIGGER IF EXISTS update_workers_updated_at ON public.workers;
CREATE TRIGGER update_workers_updated_at
    BEFORE UPDATE ON public.workers
    FOR EACH ROW EXECUTE FUNCTION public.update_workers_updated_at();

-- Create function to cleanup expired temp files
CREATE OR REPLACE FUNCTION public.cleanup_expired_temp_files()
RETURNS void AS $$
BEGIN
    DELETE FROM public.temp_files
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get distance in meters
CREATE OR REPLACE FUNCTION get_distance_meters(
    lat1 DECIMAL, lon1 DECIMAL,
    lat2 DECIMAL, lon2 DECIMAL
) RETURNS DECIMAL AS $$
BEGIN
    RETURN ST_Distance(
        ST_SetSRID(ST_MakePoint(lon1, lat1), 4326)::geography,
        ST_SetSRID(ST_MakePoint(lon2, lat2), 4326)::geography
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to get points within radius
CREATE OR REPLACE FUNCTION get_points_within_radius(
    center_lat DECIMAL, center_lon DECIMAL,
    radius_meters INTEGER,
    table_name TEXT,
    location_column TEXT DEFAULT 'location'
) RETURNS TABLE (
    id UUID,
    distance_meters DECIMAL
) AS $$
BEGIN
    RETURN QUERY EXECUTE format(
        'SELECT id, ST_Distance(
            %I::geography,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
        ) as distance_meters
        FROM %I
        WHERE ST_DWithin(
            %I::geography,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
            %s
        )
        ORDER BY distance_meters',
        location_column, center_lon, center_lat, table_name,
        location_column, center_lon, center_lat, radius_meters
    );
END;
$$ LANGUAGE plpgsql;
`;

// Split SQL into individual statements
function splitSqlStatements(sql: string): string[] {
	// Remove comments and split by semicolon
	const statements = sql
		.replace(/--.*$/gm, '') // Remove single-line comments
		.replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
		.split(';')
		.map(stmt => stmt.trim())
		.filter(stmt => stmt.length > 0 && !stmt.match(/^\s*$/));

	return statements;
}

// Execute SQL statements using direct PostgreSQL connection
async function executeSqlStatements(statements: string[]): Promise<{ success: boolean; errors: string[] }> {
	const errors: string[] = [];

	// Extract database connection info from Supabase URL
	const supabaseUrl = new URL(PUBLIC_SUPABASE_URL);
	const host = supabaseUrl.hostname;
	const port = parseInt(supabaseUrl.port) || 5432;
	const database = supabaseUrl.pathname.slice(1) || 'postgres';

	// Create PostgreSQL client
	const client = new Client({
		host,
		port,
		database,
		user: 'postgres',
		password: SUPABASE_SERVICE_ROLE_KEY,
		ssl: true
	});

	try {
		await client.connect();
		console.log('Connected to PostgreSQL database');

		for (let i = 0; i < statements.length; i++) {
			const statement = statements[i];
			console.log(`Executing statement ${i + 1}/${statements.length}: ${statement.substring(0, 50)}...`);

			try {
				await client.query(statement);
				console.log(`Statement ${i + 1} executed successfully`);
			} catch (error) {
				console.log(`Statement ${i + 1} failed:`, error);
				errors.push(`Statement ${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

	} catch (error) {
		console.error('Failed to connect to database:', error);
		errors.push(`Database connection failed: ${error instanceof Error ? error.message : String(error)}`);
	} finally {
		await client.end();
	}

	return {
		success: errors.length === 0,
		errors
	};
}

export const POST: RequestHandler = async () => {
	if (!PUBLIC_SUPABASE_URL) {
		return errorResponse('PUBLIC_SUPABASE_URL environment variable is not set.', 500);
	}

	if (!SUPABASE_SERVICE_ROLE_KEY) {
		return errorResponse('SUPABASE_SERVICE_ROLE_KEY environment variable is not set.', 500);
	}

	try {
		console.log('=== DATABASE INITIALIZATION STARTED ===');

		// Step 1: Check database health
		console.log('1. Checking database health...');
		const healthCheck = await DatabaseMigrationService.checkDatabaseHealth();

		if (healthCheck.healthy && healthCheck.initialized) {
			console.log('✅ Database is already initialized and healthy');
			return successResponse({
				message: 'Database is already initialized and healthy',
				health: healthCheck
			});
		}

		if (!healthCheck.healthy) {
			console.log('❌ Database health check failed:', healthCheck.errors);
			return errorResponse('Database health check failed: ' + healthCheck.errors.join(', '), 500);
		}

		// Step 2: Initialize database with basic schema
		console.log('2. Initializing database schema...');

		try {
			console.log('Creating database schema...');

			// Split the SQL into individual statements
			const statements = splitSqlStatements(SETUP_SQL);
			console.log(`Found ${statements.length} SQL statements to execute`);

			// Execute the statements
			const result = await executeSqlStatements(statements);

			if (!result.success) {
				console.log('❌ Some SQL statements failed:', result.errors);
				return errorResponse('Database initialization failed: ' + result.errors.join(', '), 500);
			}

			console.log('✅ All SQL statements executed successfully');

		} catch (error: unknown) {
			console.error('❌ Database initialization failed:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			return errorResponse('Database initialization failed: ' + errorMessage, 500);
		}

		// Step 3: Verify initialization
		console.log('3. Verifying database initialization...');
		const verificationCheck = await DatabaseMigrationService.checkDatabaseHealth();

		if (!verificationCheck.healthy) {
			console.error('❌ Database verification failed:', verificationCheck.errors);
			return errorResponse('Database verification failed after initialization: ' + verificationCheck.errors.join(', '), 500);
		}

		console.log('✅ Database initialization completed successfully');
		console.log('=== DATABASE INITIALIZATION COMPLETED ===');

		return successResponse({
			message: 'Database initialized successfully',
			health: verificationCheck
		});

	} catch (error: unknown) {
		console.error('❌ Database initialization failed:', error);
		const errorMessage = error instanceof Error ? error.message : String(error);
		return errorResponse('Database initialization failed: ' + errorMessage, 500);
	}
};