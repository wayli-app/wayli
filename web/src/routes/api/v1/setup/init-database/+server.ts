import { json } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import postgres from 'postgres';
import fs from 'fs/promises';
import path from 'path';

export async function POST() {
	if (!PUBLIC_SUPABASE_URL) {
		return json({ error: 'PUBLIC_SUPABASE_URL environment variable is not set.' }, { status: 500 });
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
		return json({ message: 'Database initialized successfully' });
	} catch (error: any) {
		console.error('Database initialization failed:', error);
		return json({ error: 'Database initialization failed: ' + error.message }, { status: 500 });
	} finally {
		await sql.end();
	}
}