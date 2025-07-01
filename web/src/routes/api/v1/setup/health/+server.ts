import type { RequestHandler } from './$types';
import { successResponse, errorResponse } from '$lib/utils/api/response';
import { DatabaseMigrationService } from '$lib/services/database/migration.service';

export const GET: RequestHandler = async () => {
	try {
		console.log('=== DATABASE HEALTH CHECK ===');

		const healthCheck = await DatabaseMigrationService.checkDatabaseHealth();

		console.log('Health check results:', {
			healthy: healthCheck.healthy,
			initialized: healthCheck.initialized,
			errorCount: healthCheck.errors.length
		});

		if (healthCheck.errors.length > 0) {
			console.log('Health check errors:', healthCheck.errors);
		}

		if (healthCheck.healthy) {
			return successResponse({
				message: 'Database is healthy',
				health: healthCheck
			});
		} else {
			return errorResponse('Database health check failed', 500, {
				health: healthCheck
			});
		}

	} catch (error: unknown) {
		console.error('❌ Health check failed:', error);
		const errorMessage = error instanceof Error ? error.message : String(error);
		return errorResponse('Health check failed: ' + errorMessage, 500);
	}
};