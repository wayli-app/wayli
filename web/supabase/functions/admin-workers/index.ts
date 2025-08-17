import {
	setupRequest,
	authenticateRequest,
	successResponse,
	errorResponse,
	parseJsonBody,
	validateRequiredFields,
	logError,
	logInfo,
	logSuccess
} from '../_shared/utils.ts';

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = setupRequest(req);
	if (corsResponse) return corsResponse;

	try {
		const { user, supabase } = await authenticateRequest(req);

		logInfo('Admin workers request', 'ADMIN_WORKERS', { userId: user.id, method: req.method });

		// Check if user is admin by querying user_profiles table
		const { data: userProfile, error: profileError } = await supabase
			.from('user_profiles')
			.select('role')
			.eq('id', user.id)
			.single();

		if (profileError || userProfile?.role !== 'admin') {
			logError(profileError || 'User is not admin', 'ADMIN_WORKERS');
			return errorResponse('Admin access required', 403);
		}

		// Handle different HTTP methods
		if (req.method === 'GET') {
			// Get all workers
			const { data: workers, error: workersError } = await supabase
				.from('workers')
				.select('*')
				.order('created_at', { ascending: false });

			if (workersError) {
				logError(workersError, 'ADMIN_WORKERS');
				return errorResponse('Failed to fetch workers', 500);
			}

			return successResponse(workers || []);
		}

		if (req.method === 'POST') {
			logInfo('Creating worker', 'ADMIN_WORKERS', { userId: user.id });

			const body = await parseJsonBody<Record<string, unknown>>(req);
			const { name, type, config } = body;

			// Validate required fields
			const requiredFields = ['name', 'type'];
			const missingFields = validateRequiredFields(body, requiredFields);

			if (missingFields.length > 0) {
				return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
			}

			const { data: worker, error: workerError } = await supabase
				.from('workers')
				.insert({
					name,
					type,
					status: 'inactive',
					config: config || {},
					last_heartbeat: null
				})
				.select()
				.single();

			if (workerError) {
				logError(workerError, 'ADMIN_WORKERS');
				return errorResponse('Failed to create worker', 500);
			}

			logSuccess('Worker created successfully', 'ADMIN_WORKERS', {
				userId: user.id,
				workerId: worker.id
			});

			return successResponse(worker, 201);
		}

		if (req.method === 'PUT') {
			logInfo('Updating worker', 'ADMIN_WORKERS', { userId: user.id });

			const body = await parseJsonBody<Record<string, unknown>>(req);
			const { worker_id, status } = body;

			// Validate required fields
			const requiredFields = ['worker_id', 'status'];
			const missingFields = validateRequiredFields(body, requiredFields);

			if (missingFields.length > 0) {
				return errorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400);
			}

			if (!['active', 'inactive', 'error'].includes(status as string)) {
				return errorResponse('Invalid status', 400);
			}

			const { data: updatedWorker, error: updateError } = await supabase
				.from('workers')
				.update({ status })
				.eq('id', worker_id)
				.select()
				.single();

			if (updateError) {
				logError(updateError, 'ADMIN_WORKERS');
				return errorResponse('Failed to update worker', 500);
			}

			logSuccess('Worker updated successfully', 'ADMIN_WORKERS', {
				userId: user.id,
				workerId: worker_id
			});

			return successResponse(updatedWorker);
		}

		return errorResponse('Method not allowed', 405);
	} catch (error) {
		logError(error, 'ADMIN_WORKERS');
		return errorResponse('Internal server error', 500);
	}
});
