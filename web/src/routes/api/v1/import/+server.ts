import type { RequestHandler } from './$types';
import { errorResponse, successResponse } from '$lib/utils/api/response';
import { JobQueueService } from '$lib/services/queue/job-queue.service.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const formData = await request.formData();
		const file = formData.get('file') as File;
		const format = formData.get('format') as string;

		if (!file || !format) {
			return errorResponse('File and format are required');
		}

		// Get user ID using secure authentication
		const { data: { user }, error: userError } = await locals.supabase.auth.getUser();

		if (userError) {
			console.error('❌ Authentication error:', userError);
			return errorResponse('Authentication error: ' + userError.message, 401);
		}

		if (!user?.id) {
			console.error('❌ No authenticated user found');
			return errorResponse('No authenticated user found', 401);
		}

		const userId = user.id;
		const fileId = crypto.randomUUID();
		const filePath = `temp-imports/${userId}/${fileId}/${file.name}`;

		// Upload file to Supabase Storage
		const { error: uploadError } = await locals.supabase.storage
			.from('temp-files')
			.upload(filePath, file);

		if (uploadError) {
			console.error('❌ Error uploading file to storage:', uploadError);
			return errorResponse(`Failed to upload file: ${uploadError.message}`);
		}

		// Create a job for the import with storage metadata
		const jobData = {
			filePath,
			fileName: file.name,
			fileSize: file.size,
			format,
			userId
		};

		let job;
		try {
			job = await JobQueueService.createJob('data_import', jobData, 'normal', userId);
		} catch (jobError) {
			console.error('❌ Error creating job:', jobError);
			// Clean up storage file if job creation fails
			try {
				await locals.supabase.storage.from('temp-files').remove([filePath]);
			} catch (cleanupError) {
				console.error('❌ Failed to cleanup storage file after job creation error:', cleanupError);
			}
			return errorResponse(
				`Failed to create import job: ${jobError instanceof Error ? jobError.message : 'Unknown error'}`
			);
		}

		return successResponse({
			jobId: job.id,
			message: 'Import job created successfully'
		});
	} catch (error) {
		console.error('❌ Import error:', error);
		console.error('❌ Error details:', {
			name: error instanceof Error ? error.name : 'Unknown',
			message: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : undefined
		});
		return errorResponse('Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
	}
};
