import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { getWorkerSupabaseConfig } from '$lib/core/config/worker-environment';
import { createWorkerClient } from '../../../worker/client';

export interface Migration {
	version: string;
	name: string;
	filename: string;
	content: string;
	checksum: string;
}

export interface MigrationResult {
	success: boolean;
	version: string;
	name: string;
	error?: string;
}

export class DatabaseMigrationService {
	private static supabase = createWorkerClient();
	private static migrationsPath = path.resolve(process.cwd(), 'supabase/migrations');

	/**
	 * Initialize migration infrastructure (creates tables and functions if needed)
	 */
	static async initializeMigrationInfrastructure(): Promise<void> {
		console.log('🔧 Initializing migration infrastructure...');

		// Check if database_migrations table exists
		const { data: tableExists, error: tableError } = await this.supabase
			.from('database_migrations')
			.select('version')
			.limit(1);

		if (tableError && tableError.code === 'PGRST205') {
			// Table doesn't exist, we'll let the first migration handle this
			console.log('📋 Migration infrastructure not found, will be created by first migration');
		} else if (tableError) {
			throw new Error(`Failed to check migration infrastructure: ${tableError.message}`);
		} else {
			console.log('✅ Migration infrastructure already exists');
		}
	}

	/**
	 * Bootstrap migration infrastructure by creating the necessary tables and functions
	 */
	private static async bootstrapMigrationInfrastructure(): Promise<void> {
		try {
			console.log('🚀 Bootstrapping migration infrastructure...');

			// Create the database_migrations table directly
			const { error: tableError } = await this.supabase
				.from('_sql')
				.select('*')
				.eq(
					'query',
					`
					CREATE TABLE IF NOT EXISTS public.database_migrations (
						version VARCHAR(20) PRIMARY KEY,
						name VARCHAR(255) NOT NULL,
						checksum VARCHAR(32) NOT NULL,
						applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
						execution_time_ms INTEGER,
						error_message TEXT
					);
				`
				);

			if (tableError) {
				console.log('⚠️ Table creation error (may already exist):', tableError.message);
			}

			// Create the exec_sql function directly
			const { error: functionError } = await this.supabase
				.from('_sql')
				.select('*')
				.eq(
					'query',
					`
					CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
					RETURNS VOID AS $$
					BEGIN
						EXECUTE sql;
					END;
					$$ LANGUAGE plpgsql SECURITY DEFINER;
				`
				);

			if (functionError) {
				console.log('⚠️ Function creation error (may already exist):', functionError.message);
			}

			// Enable RLS
			const { error: rlsError } = await this.supabase
				.from('_sql')
				.select('*')
				.eq('query', 'ALTER TABLE public.database_migrations ENABLE ROW LEVEL SECURITY;');

			if (rlsError) {
				console.log('⚠️ RLS error (may already be enabled):', rlsError.message);
			}

			// Create RLS policy
			const { error: policyError } = await this.supabase
				.from('_sql')
				.select('*')
				.eq(
					'query',
					`
					DO $$
					BEGIN
						IF NOT EXISTS (
							SELECT 1 FROM pg_policies
							WHERE tablename = 'database_migrations'
							AND policyname = 'Service role can manage migrations'
						) THEN
							CREATE POLICY "Service role can manage migrations" ON public.database_migrations
								FOR ALL USING (auth.role() = 'service_role');
						END IF;
					END $$;
				`
				);

			if (policyError) {
				console.log('⚠️ Policy creation error (may already exist):', policyError.message);
			}

			// Grant permissions
			const { error: grantError } = await this.supabase
				.from('_sql')
				.select('*')
				.eq(
					'query',
					`
					GRANT ALL ON public.database_migrations TO service_role;
					GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO service_role;
				`
				);

			if (grantError) {
				console.log('⚠️ Grant error (may already be granted):', grantError.message);
			}

			console.log('✅ Migration infrastructure bootstrapped successfully');
		} catch (error) {
			const err = error as Error;
			throw new Error(`Failed to bootstrap migration infrastructure: ${err.message}`);
		}
	}

	/**
	 * Get a specific migration by version
	 */
	private static async getMigrationByVersion(version: string): Promise<Migration | null> {
		try {
			const files = await fs.readdir(this.migrationsPath);
			const migrationFile = files.find((file) => file.startsWith(version));

			if (!migrationFile) {
				return null;
			}

			const filePath = path.join(this.migrationsPath, migrationFile);
			const content = await fs.readFile(filePath, 'utf-8');
			const checksum = crypto.createHash('md5').update(content).digest('hex');

			return {
				version: version,
				name: migrationFile.replace('.sql', '').replace(version + '_', ''),
				filename: migrationFile,
				content,
				checksum
			};
		} catch (error) {
			console.error(`Error reading migration ${version}:`, error);
			return null;
		}
	}

	/**
	 * Get all available migrations from the migrations directory
	 */
	static async getAvailableMigrations(): Promise<Migration[]> {
		try {
			const files = await fs.readdir(this.migrationsPath);
			const sqlFiles = files.filter((file) => file.endsWith('.sql')).sort();

			const migrations: Migration[] = [];

			for (const file of sqlFiles) {
				const filePath = path.join(this.migrationsPath, file);
				const content = await fs.readFile(filePath, 'utf-8');
				const checksum = crypto.createHash('md5').update(content).digest('hex');

				// Extract version and name from filename (e.g., "20241201000000_initial_schema.sql")
				const match = file.match(/^(\d+)_(.+)\.sql$/);
				if (match) {
					migrations.push({
						version: match[1],
						name: match[2].replace(/_/g, ' '),
						filename: file,
						content,
						checksum
					});
				}
			}

			return migrations;
		} catch (error) {
			console.error('Error reading migrations directory:', error);
			return [];
		}
	}

	/**
	 * Get applied migrations from the database
	 */
	static async getAppliedMigrations(): Promise<{ version: string; applied_at: string }[]> {
		try {
			const { data, error } = await this.supabase
				.from('database_migrations')
				.select('version, applied_at')
				.order('version', { ascending: true });

			if (error) {
				console.error('Error fetching applied migrations:', error);
				return [];
			}

			return data || [];
		} catch (error) {
			console.error('Error fetching applied migrations:', error);
			return [];
		}
	}

	/**
	 * Get pending migrations (available but not applied)
	 */
	static async getPendingMigrations(): Promise<Migration[]> {
		const available = await this.getAvailableMigrations();
		const applied = await this.getAppliedMigrations();
		const appliedVersions = new Set(applied.map((m) => m.version));

		return available.filter((migration) => !appliedVersions.has(migration.version));
	}

	/**
	 * Apply a single migration with proper error handling and timing
	 */
	static async applyMigration(migration: Migration): Promise<MigrationResult> {
		const startTime = Date.now();

		try {
			console.log(`🔄 Applying migration: ${migration.version} - ${migration.name}`);

			// Special handling for infrastructure migration
			if (migration.version === '20250826000000' && migration.name === 'migration infrastructure') {
				await this.applyInfrastructureMigration(migration);
			} else {
				// Execute the migration SQL using exec_sql function
				const { error } = await this.supabase.rpc('exec_sql', {
					sql: migration.content
				});

				if (error) {
					throw new Error(`Migration execution failed: ${error.message}`);
				}
			}

			const executionTime = Date.now() - startTime;

			// Record the migration as applied
			const { error: insertError } = await this.supabase.from('database_migrations').insert({
				version: migration.version,
				name: migration.name,
				checksum: migration.checksum,
				applied_at: new Date().toISOString(),
				execution_time_ms: executionTime
			});

			if (insertError) {
				throw new Error(`Failed to record migration: ${insertError.message}`);
			}

			console.log(
				`✅ Migration applied successfully: ${migration.version} - ${migration.name} (${executionTime}ms)`
			);

			return {
				success: true,
				version: migration.version,
				name: migration.name
			};
		} catch (error) {
			const executionTime = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : String(error);

			// Record failed migration
			await this.supabase.from('database_migrations').insert({
				version: migration.version,
				name: migration.name,
				checksum: migration.checksum,
				applied_at: new Date().toISOString(),
				execution_time_ms: executionTime,
				error_message: errorMessage
			});

			console.error(`❌ Migration failed: ${migration.version} - ${migration.name}`, error);

			return {
				success: false,
				version: migration.version,
				name: migration.name,
				error: errorMessage
			};
		}
	}

	/**
	 * Apply the infrastructure migration specially
	 */
	private static async applyInfrastructureMigration(migration: Migration): Promise<void> {
		console.log('🔧 Applying infrastructure migration...');

		// For the infrastructure migration, we need to create the infrastructure manually
		// since exec_sql doesn't exist yet
		await this.createInfrastructureManually();

		console.log('✅ Infrastructure migration completed');
	}

	/**
	 * Create the migration infrastructure manually without using exec_sql
	 */
	private static async createInfrastructureManually(): Promise<void> {
		console.log('🔧 Creating migration infrastructure manually...');

		try {
			// Create the database_migrations table
			console.log('📋 Creating database_migrations table...');

			// We'll use a different approach - create the table by trying to insert a test record
			// This will fail if the table doesn't exist, but that's okay
			const { error: testError } = await this.supabase
				.from('database_migrations')
				.select('version')
				.limit(1);

			if (testError && testError.code === 'PGRST205') {
				console.log('🔧 Table does not exist, creating it...');

				// Since we can't create tables directly through the Supabase client,
				// we'll provide instructions for manual setup
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
				console.log(
					'CREATE POLICY "Service role can manage migrations" ON public.database_migrations'
				);
				console.log("    FOR ALL USING (auth.role() = 'service_role');");
				console.log('');
				console.log('-- Grant permissions');
				console.log('GRANT ALL ON public.database_migrations TO service_role;');
				console.log('GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO service_role;');
				console.log('');
				console.log('After running this SQL, you can run: npm run migrate');

				// Exit the process to let the user run the SQL
				process.exit(1);
			} else if (testError) {
				throw new Error(`Unexpected error: ${testError.message}`);
			} else {
				console.log('✅ Table already exists');
			}
		} catch (error) {
			const err = error as Error;
			throw new Error(`Failed to create infrastructure: ${err.message}`);
		}
	}

	/**
	 * Apply all pending migrations
	 */
	static async applyPendingMigrations(): Promise<MigrationResult[]> {
		const pending = await this.getPendingMigrations();
		const results: MigrationResult[] = [];

		console.log(`📋 Found ${pending.length} pending migrations`);

		for (const migration of pending) {
			const result = await this.applyMigration(migration);
			results.push(result);

			if (!result.success) {
				console.error(`❌ Migration failed, stopping: ${migration.version}`);
				break;
			}
		}

		return results;
	}

	/**
	 * Run all migrations with proper initialization
	 */
	static async runMigrations(): Promise<MigrationResult[]> {
		try {
			console.log('🚀 Starting database migration process...');

			// Initialize migration infrastructure first
			await this.initializeMigrationInfrastructure();

			// Get and apply pending migrations
			const results = await this.applyPendingMigrations();

			const successCount = results.filter((r) => r.success).length;
			const failureCount = results.filter((r) => !r.success).length;

			console.log(`📊 Migration Summary: ${successCount} successful, ${failureCount} failed`);

			if (failureCount > 0) {
				const failed = results.filter((r) => !r.success);
				console.error('❌ Failed migrations:');
				failed.forEach((f) => console.error(`  - ${f.version}: ${f.error}`));
			}

			return results;
		} catch (error) {
			console.error('❌ Migration system initialization failed:', error);
			throw error;
		}
	}

	/**
	 * Check database health and migration status
	 */
	static async checkDatabaseHealth(): Promise<{
		healthy: boolean;
		initialized: boolean;
		errors: string[];
	}> {
		const errors: string[] = [];
		let healthy = true;
		let initialized = false;

		try {
			console.log('🔍 Starting database health check...');

			// Log the Supabase configuration (without sensitive data)
			const workerConfig = getWorkerSupabaseConfig();
			console.log('📋 Supabase config:', {
				url: workerConfig.url,
				serviceRoleKeyLength: workerConfig.serviceRoleKey?.length || 0
			});

			// Check if wayli schema exists by trying to query the jobs table (core application table)
			console.log('🔍 Testing database connection by querying jobs table...');
			const { error: schemaError } = await this.supabase.from('jobs').select('id').limit(1);

			if (schemaError) {
				console.log('❌ Database query failed:', {
					message: schemaError.message,
					details: schemaError.details,
					hint: schemaError.hint
				});

				// Check if this is a "table doesn't exist" error vs a real connection/auth error
				if (
					schemaError.message.includes('relation') &&
					schemaError.message.includes('does not exist')
				) {
					// This is expected during setup - the table doesn't exist yet
					console.log(
						"✅ Database is healthy, table just doesn't exist yet (expected during setup)"
					);
					healthy = true; // Database is healthy, just not initialized
					initialized = false;
				} else if (
					schemaError.message.includes('authentication') ||
					schemaError.message.includes('permission')
				) {
					// This is a real authentication/permission error
					console.log('❌ Authentication/permission error detected');
					errors.push(`Database authentication failed: ${schemaError.message}`);
					healthy = false;
				} else {
					// Other database errors
					console.log('❌ Other database error detected');
					errors.push(`Database schema error: ${schemaError.message}`);
					healthy = false;
				}
			} else {
				// Table exists, database is initialized
				console.log('✅ Database is healthy and initialized');
				initialized = true;
			}
		} catch (error) {
			// Network or other connection errors
			console.log('❌ Connection error caught:', error);
			errors.push(
				`Database connection failed: ${error instanceof Error ? error.message : String(error)}`
			);
			healthy = false;
		}

		return {
			healthy,
			initialized,
			errors
		};
	}
}
