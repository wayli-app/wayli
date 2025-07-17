import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/utils/api/response';
import { JobQueueService } from '$lib/services/queue/job-queue.service.server';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const session = await locals.getSession();
		if (!session?.user) {
			return errorResponse('Unauthorized', 401);
		}

		// Check if user is admin
		if (session.user.user_metadata?.role !== 'admin') {
			return errorResponse('Forbidden', 403);
		}

		// Get job statistics instead of worker status
		const stats = await JobQueueService.getJobStats();

		// Simplified status response
		const status = {
			isRunning: false, // Worker manager is currently disabled
			workerCount: 0,
			activeWorkers: 0,
			config: {
				maxWorkers: 2,
				pollInterval: 5000,
				jobTimeout: 300000,
				retryAttempts: 3,
				retryDelay: 60000
			},
			realtime: {
				isInitialized: false,
				isConnected: false,
				isAvailable: false
			}
		};

		return successResponse({ status, stats });
	} catch (error) {
		console.error('Error getting worker status:', error);
		return errorResponse('Failed to get worker status', 500);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const session = await locals.getSession();
		if (!session?.user) {
			return errorResponse('Unauthorized', 401);
		}

		// Check if user is admin
		if (session.user.user_metadata?.role !== 'admin') {
			return errorResponse('Forbidden', 403);
		}

		const { action } = await request.json();

		switch (action) {
			case 'start':
				// Worker manager is currently disabled
				return successResponse({
					message: 'Worker management is currently disabled',
					status: { isRunning: false, workerCount: 0, activeWorkers: 0, config: {}, realtime: {} }
				});
			case 'stop':
				// Worker manager is currently disabled
				return successResponse({
					message: 'Worker management is currently disabled',
					status: { isRunning: false, workerCount: 0, activeWorkers: 0, config: {}, realtime: {} }
				});
			case 'updateWorkers':
				// Temporarily disabled
				return successResponse({
					message: 'Worker management temporarily disabled',
					status: { isRunning: false, workerCount: 0, activeWorkers: 0, config: {}, realtime: {} }
				});
			case 'updateConfig':
				// Temporarily disabled
				return successResponse({
					message: 'Worker configuration temporarily disabled',
					status: { isRunning: false, workerCount: 0, activeWorkers: 0, config: {}, realtime: {} }
				});
			case 'testRealtime':
				// Temporarily disabled
				return successResponse({
					realtimeTest: false,
					message: 'Realtime testing temporarily disabled'
				});
			case 'getRealtimeConfig':
				// Temporarily disabled
				return successResponse({ realtimeConfig: { isAvailable: false, isEnabled: false } });
			default:
				return validationErrorResponse('Invalid action');
		}
	} catch (error) {
		console.error('Error managing workers:', error);
		return errorResponse('Failed to manage workers', 500);
	}
};
