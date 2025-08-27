import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

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
	private static migrationsPath = path.resolve(__dirname, '../../../supabase/migrations');

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
	 * Apply a single migration
	 */
	static async applyMigration(migration: Migration): Promise<MigrationResult> {
		try {
			console.log(`Applying migration: ${migration.version} - ${migration.name}`);

			// Execute the migration SQL
			const { error } = await this.supabase.rpc('exec_sql', {
				sql: migration.content
			});

			if (error) {
				throw new Error(`Migration execution failed: ${error.message}`);
			}

			// Record the migration as applied
			const { error: insertError } = await this.supabase.from('database_migrations').insert({
				version: migration.version,
				name: migration.name,
				checksum: migration.checksum,
				applied_at: new Date().toISOString()
			});

			if (insertError) {
				throw new Error(`Failed to record migration: ${insertError.message}`);
			}

			console.log(`✅ Migration applied successfully: ${migration.version} - ${migration.name}`);

			return {
				success: true,
				version: migration.version,
				name: migration.name,
				error: undefined
			};
		} catch (error) {
			console.error(`❌ Migration failed: ${migration.version} - ${migration.name}`, error);

			return {
				success: false,
				version: migration.version,
				name: migration.name,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/**
	 * Apply all pending migrations
	 */
	static async applyPendingMigrations(): Promise<MigrationResult[]> {
		const pending = await this.getPendingMigrations();
		const results: MigrationResult[] = [];

		console.log(`Found ${pending.length} pending migrations`);

		for (const migration of pending) {
			const result = await this.applyMigration(migration);
			results.push(result);

			if (!result.success) {
				console.error(`Migration failed, stopping: ${migration.version}`);
				break;
			}
		}

		return results;
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
