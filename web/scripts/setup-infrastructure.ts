// /Users/bart/Dev/wayli/web/scripts/setup-infrastructure.ts
// Script to output the SQL for manual migration infrastructure setup

import { createWorkerClient } from '../src/worker/client';

async function main() {
	console.log('🚀 Setting up migration infrastructure...');
	const supabase = createWorkerClient();
	console.log('🔗 Creating worker Supabase client with URL:', supabase.supabaseUrl);

	console.log('📋 Creating database_migrations table...');

	// Check if database_migrations table exists
	const { error: tableError } = await supabase
		.from('database_migrations')
		.select('version')
		.limit(1);

	if (tableError && tableError.code === 'PGRST205') {
		console.log('🔧 Table does not exist, creating it...');
		console.log('📋 Please run the following SQL in your Supabase SQL editor:');
		console.log('');
		console.log('-- Create migration tracking table');
		console.log('CREATE TABLE IF NOT EXISTS public.database_migrations (');
		console.log('    version VARCHAR(20) PRIMARY KEY,');
		console.log('    name VARCHAR(255) NOT NULL,');
		console.log('    checksum VARCHAR(32) NOT NULL,');
		console.log('    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),');
		console.log('    execution_time_ms INTEGER,');
		console.log('    error_message TEXT');
		console.log(');');
		console.log('');
		console.log('-- Create exec_sql function');
		console.log('CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)');
		console.log('RETURNS VOID AS $$');
		console.log('BEGIN');
		console.log('    EXECUTE sql;');
		console.log('END;');
		console.log('$$ LANGUAGE plpgsql SECURITY DEFINER;');
		console.log('');
		console.log('-- Enable RLS');
		console.log('ALTER TABLE public.database_migrations ENABLE ROW LEVEL SECURITY;');
		console.log('');
		console.log('-- Create RLS policy');
		console.log('CREATE POLICY "Service role can manage migrations" ON public.database_migrations');
		console.log("    FOR ALL USING (auth.role() = 'service_role');");
		console.log('');
		console.log('-- Grant permissions');
		console.log('GRANT ALL ON public.database_migrations TO service_role;');
		console.log('GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO service_role;');
		console.log('');
		console.log('After running this SQL, you can run: npm run migrate');
	} else if (tableError) {
		console.error('❌ Error checking for database_migrations table:', tableError.message);
		process.exit(1);
	} else {
		console.log('✅ database_migrations table already exists');
	}
	console.log('✅ Migration infrastructure bootstrapped successfully');
}

main().catch((err) => {
	console.error('❌ Error during migration infrastructure setup:', err);
	process.exit(1);
});
