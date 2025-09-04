// /Users/bart/Dev/wayli/web/scripts/test-migration-system.ts
// Test script to verify migration system functionality

import { DatabaseMigrationService } from '../src/lib/services/database/migration.service';

async function main() {
	console.log('🧪 Testing migration system...');

	try {
		// Test getting available migrations
		const availableMigrations = await DatabaseMigrationService.getAvailableMigrations();
		console.log(`📋 Found ${availableMigrations.length} available migrations`);

		// Test getting applied migrations
		const appliedMigrations = await DatabaseMigrationService.getAppliedMigrations();
		console.log(`✅ Found ${appliedMigrations.length} applied migrations`);

		// Test getting pending migrations
		const pendingMigrations = await DatabaseMigrationService.getPendingMigrations();
		console.log(`⏳ Found ${pendingMigrations.length} pending migrations`);

		// Show migration status
		console.log('\n📊 Migration Status:');
		console.log(`  Available: ${availableMigrations.length}`);
		console.log(`  Applied: ${appliedMigrations.length}`);
		console.log(`  Pending: ${pendingMigrations.length}`);

		if (pendingMigrations.length > 0) {
			console.log('\n⏳ Pending migrations:');
			pendingMigrations.forEach(migration => {
				console.log(`  - ${migration.version}: ${migration.name}`);
			});
		}

		console.log('\n✅ Migration system test completed successfully');
		process.exit(0);
	} catch (error) {
		console.error('❌ Migration system test failed:', error);
		process.exit(1);
	}
}

main();
