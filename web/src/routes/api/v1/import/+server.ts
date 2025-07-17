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
		const {
			data: { user },
			error: userError
		} = await locals.supabase.auth.getUser();

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

		// Check file size limit (1GB)
		const maxFileSize = 1024 * 1024 * 1024; // 1GB
		if (file.size > maxFileSize) {
			return errorResponse(
				`File too large. Maximum size is ${(maxFileSize / 1024 / 1024).toFixed(0)}MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`
			);
		}

		// Generate a unique file path for storage
		const fileId = crypto.randomUUID();
		const filePath = `temp-imports/${userId}/${fileId}/${file.name}`;

		console.log(`Uploading file to Supabase Storage: ${filePath}`);

		// Upload file to Supabase Storage
		const { error: uploadError } = await locals.supabase.storage
			.from('temp-files')
			.upload(filePath, file, {
				cacheControl: '3600',
				upsert: false
			});

		if (uploadError) {
			console.error('Error uploading file to storage:', uploadError);
			return errorResponse(`Failed to upload file: ${uploadError.message}`);
		}

		console.log('File uploaded successfully to storage');

		// Create a job for the import with storage metadata
		const jobData = {
			storagePath: filePath,
			format,
			fileName: file.name,
			fileSize: file.size
		};

		console.log('Creating import job...');
		let job;
		try {
			job = await JobQueueService.createJob('data_import', jobData, 'normal', userId);
		} catch (jobError) {
			console.error('Error creating job:', jobError);
			// Clean up storage file if job creation fails
			try {
				await locals.supabase.storage.from('temp-files').remove([filePath]);
			} catch (cleanupError) {
				console.error('Failed to cleanup storage file after job creation error:', cleanupError);
			}
			return errorResponse(
				`Failed to create import job: ${jobError instanceof Error ? jobError.message : 'Unknown error'}`
			);
		}

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
		console.error('Error details:', {
			name: error instanceof Error ? error.name : 'Unknown',
			message: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : undefined
		});
		return errorResponse(
			`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
};
