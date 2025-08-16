import {
	setupRequest,
	authenticateRequest,
	successResponse,
	errorResponse,
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

		if (req.method === 'GET') {
			logInfo('Processing export download request', 'EXPORT-DOWNLOAD', { userId: user.id });

			// Extract job_id from query parameters instead of path
			const url = new URL(req.url);
			const jobId = url.searchParams.get('job_id');

			if (!jobId) {
				return errorResponse('Missing job ID', 400);
			}

			logInfo('Job ID extracted from query params', 'EXPORT-DOWNLOAD', { jobId, userId: user.id });

			// Get the export job
			const { data: job, error: jobError } = await supabase
				.from('jobs')
				.select('*')
				.eq('id', jobId)
				.eq('created_by', user.id)
				.eq('type', 'data_export')
				.single();

			if (jobError || !job) {
				logError(jobError, 'EXPORT-DOWNLOAD');
				return errorResponse('Export job not found', 404);
			}

			if (job.status !== 'completed') {
				return errorResponse('Export not completed', 400);
			}

			// Extract file path from job result
			const jobResult = job.result as Record<string, unknown>;
			const filePath = jobResult?.file_path as string;

			if (!filePath) {
				return errorResponse('Export file not found', 404);
			}

			logInfo('Generating download URL', 'EXPORT-DOWNLOAD', { filePath, jobId });

			// Get storage bucket name from environment variable
			const storageBucket = Deno.env.get('VITE_SUPABASE_STORAGE_BUCKET') || 'exports';

			// Generate signed URL for download using public Supabase URL
			const { data: signedUrlData, error: signedUrlError } = await supabase.storage
				.from(storageBucket)
				.createSignedUrl(filePath, 3600, { download: true }); // 1 hour expiry

			if (signedUrlError || !signedUrlData?.signedUrl) {
				logError(signedUrlError, 'EXPORT-DOWNLOAD');
				return errorResponse('Failed to generate download link', 500);
			}

			// Ensure the signed URL uses the public Supabase URL, not internal addresses
			let downloadUrl = signedUrlData.signedUrl;

			// Use environment variable for public storage URL to work across all environments
			const storageUrl = Deno.env.get('VITE_SUPABASE_STORAGE_URL');

			if (storageUrl) {
				// Replace the hostname in the signed URL with our configured storage URL
				const urlObj = new URL(downloadUrl);
				urlObj.hostname = new URL(storageUrl).hostname;
				urlObj.protocol = new URL(storageUrl).protocol;
				urlObj.port = new URL(storageUrl).port || '';
				downloadUrl = urlObj.toString();

				logInfo('Generated public download URL using environment variable', 'EXPORT-DOWNLOAD', {
					originalUrl: signedUrlData.signedUrl,
					publicUrl: downloadUrl,
					storageUrl: storageUrl,
					storageBucket: storageBucket
				});
			} else {
				// For relative URLs, just use the signed URL as-is since it should already be correct
				logInfo('Using signed URL as-is (no environment variable set)', 'EXPORT-DOWNLOAD', {
					signedUrl: downloadUrl,
					storageBucket: storageBucket
				});
			}

			logSuccess('Download URL generated successfully', 'EXPORT-DOWNLOAD', {
				jobId,
				userId: user.id,
				filePath
			});

			return successResponse({
				downloadUrl: downloadUrl, // Use the potentially fixed URL
				fileName: filePath.split('/').pop() || 'export.zip'
			});
		}

		return errorResponse('Method not allowed', 405);
	} catch (error) {
		logError(error, 'EXPORT-DOWNLOAD');
		return errorResponse('Internal server error', 500);
	}
});
