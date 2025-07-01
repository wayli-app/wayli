import type { RequestHandler } from './$types';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { DatabaseMigrationService } from '$lib/services/database/migration.service';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import postgres from 'postgres';
import fs from 'fs/promises';
import path from 'path';

export const POST: RequestHandler = async () => {
	if (!PUBLIC_SUPABASE_URL) {
		return errorResponse('PUBLIC_SUPABASE_URL environment variable is not set.', 500);
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

		// Construct database URL from Supabase URL
		const databaseUrl = PUBLIC_SUPABASE_URL.replace('https://', 'postgresql://postgres:').replace('.supabase.co', '.supabase.co:5432/postgres');
		const schema = 'wayli'; // Default schema
		const sql = postgres(databaseUrl, { ssl: 'require' });

		try {
			console.log('Reading database setup script...');
			const sqlFilePath = path.resolve(process.cwd(), 'setup-database.sql');
			let sqlFileContent = await fs.readFile(sqlFilePath, 'utf-8');

			console.log(`Replacing schema placeholder with "${schema}"...`);
			sqlFileContent = sqlFileContent.replace(/%%SCHEMA%%/g, schema);

			console.log('Executing database setup script...');
			await sql.unsafe(sqlFileContent);

			console.log('✅ Database initialization script executed successfully.');
		} catch (error: unknown) {
			console.error('❌ Database initialization failed:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			return errorResponse('Database initialization failed: ' + errorMessage, 500);
		} finally {
			await sql.end();
		}

		// Step 3: Verify initialization
		console.log('3. Verifying database initialization...');
		const verificationCheck = await DatabaseMigrationService.checkDatabaseHealth();

		if (!verificationCheck.healthy || !verificationCheck.initialized) {
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