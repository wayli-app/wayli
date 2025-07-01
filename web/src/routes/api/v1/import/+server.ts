import type { RequestHandler } from './$types';
import { successResponse, errorResponse, validationErrorResponse } from '$lib/utils/api/response';
import { JobQueueService } from '$lib/services/queue/job-queue.service.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		console.log('Import request started');
		const formData = await request.formData();
		const file = formData.get('file') as File;
		const format = formData.get('format') as string;

		if (!file) {
			return validationErrorResponse('No file provided');
		}

		if (!format) {
			return validationErrorResponse('No format specified');
		}

		console.log(`Processing import: ${file.name}, format: ${format}, size: ${file.size}`);

		// Get user ID using secure authentication
		const { data: { user }, error: userError } = await locals.supabase.auth.getUser();

		if (userError) {
			console.error('Authentication error:', userError);
			return errorResponse('Authentication error: ' + userError.message, 401);
		}

		if (!user?.id) {
			console.error('No authenticated user found');
			return errorResponse('No authenticated user found', 401);
		}

		const userId = user.id;
		console.log('🔐 Authenticated user:', userId);

		// Read the file content
		const fileContent = await file.text();
		console.log(`File content read, length: ${fileContent.length}`);

		// Store file content in a temporary table to avoid storing it in job data
		const { data: tempFile, error: tempFileError } = await locals.supabase
			.from('temp_files')
			.insert({
				user_id: userId,
				file_name: file.name,
				file_content: fileContent,
				format: format,
				file_size: file.size,
				created_at: new Date().toISOString()
			})
			.select()
			.single();

		if (tempFileError) {
			console.error('Error storing temporary file:', tempFileError);
			return errorResponse('Failed to store file temporarily');
		}

		// Create a job for the import with only metadata
		const jobData = {
			tempFileId: tempFile.id,
			format,
			fileName: file.name,
			fileSize: file.size
		};

		const job = await JobQueueService.createJob(
			'data_import',
			jobData,
			'normal',
			userId
		);

		console.log(`📝 Created import job: ${job.id}`);

		return successResponse({
			jobId: job.id,
			message: `Import job created successfully. Job ID: ${job.id}`,
			status: 'queued',
			fileName: file.name,
			format: format
		});

	} catch (error) {
		console.error('Import error:', error);
		return errorResponse(error);
	}
};