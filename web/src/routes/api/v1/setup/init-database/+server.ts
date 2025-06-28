import type { RequestHandler } from './$types';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import postgres from 'postgres';
import fs from 'fs/promises';
import path from 'path';

export const POST: RequestHandler = async () => {
	if (!PUBLIC_SUPABASE_URL) {
		return errorResponse('PUBLIC_SUPABASE_URL environment variable is not set.', 500);
	}

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

		console.log('Database initialization script executed successfully.');
		return successResponse({
			message: 'Database initialized successfully'
		});
	} catch (error: unknown) {
		console.error('Database initialization failed:', error);
		const errorMessage = error instanceof Error ? error.message : String(error);
		return errorResponse('Database initialization failed: ' + errorMessage, 500);
	} finally {
		await sql.end();
	}
};