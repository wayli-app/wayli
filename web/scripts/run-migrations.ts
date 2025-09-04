// /Users/bart/Dev/wayli/web/scripts/run-migrations.ts
// Main script to run all pending database migrations

import { DatabaseMigrationService } from '../src/lib/services/database/migration.service';

async function main() {
	console.log('🚀 Starting database migrations...');

	try {
		await DatabaseMigrationService.runMigrations();
		console.log('✅ Migration process completed successfully');
		process.exit(0);
	} catch (error) {
		console.error('❌ Migration process failed:', error);
		process.exit(1);
	}
}

main();
