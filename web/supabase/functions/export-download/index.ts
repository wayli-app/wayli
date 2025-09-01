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

			// Generate signed URL using the internal Supabase client (which can access storage)
			// Use the actual supabase client, not the typed interface
			const { data: signedUrlData, error: signedUrlError } = await (supabase as any).storage
				.from(storageBucket)
				.createSignedUrl(filePath, 3600, { download: true }); // 1 hour expiry

			if (signedUrlError || !signedUrlData?.signedUrl) {
				logError(signedUrlError, 'EXPORT-DOWNLOAD');
				return errorResponse('Failed to generate download link', 500);
			}

			// Transform the internal URL to a public URL that the frontend can access
			let downloadUrl = signedUrlData.signedUrl;

			// Get the public Supabase URL for the frontend
			const publicSupabaseUrl = Deno.env.get('PUBLIC_SUPABASE_URL') || 'http://127.0.0.1:54321';

			// If the signed URL contains internal hostnames, replace them with the public URL
			if (downloadUrl.includes('kong:8000') || downloadUrl.includes('localhost:54321')) {
				const urlObj = new URL(downloadUrl);
				const publicUrlObj = new URL(publicSupabaseUrl);

				// Replace the hostname and port with the public URL
				urlObj.hostname = publicUrlObj.hostname;
				urlObj.port = publicUrlObj.port || '';
				downloadUrl = urlObj.toString();

				logInfo('Transformed internal URL to public URL', 'EXPORT-DOWNLOAD', {
					originalUrl: signedUrlData.signedUrl,
					transformedUrl: downloadUrl,
					publicSupabaseUrl: publicSupabaseUrl
				});
			} else {
				logInfo('Using signed URL as-is (already public)', 'EXPORT-DOWNLOAD', {
					downloadUrl: downloadUrl
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
