import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ExportService } from '$lib/services/export.service';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const jobId = params.job_id;
		if (!jobId) {
			return json({ success: false, message: 'Missing job ID' }, { status: 400 });
		}

		const {
			data: { user },
			error: userError
		} = await locals.supabase.auth.getUser();

		if (userError || !user?.id) {
			return json({ success: false, message: 'Authentication error' }, { status: 401 });
		}

		const job = await ExportService.getExportJob(jobId, user.id);
		if (!job || job.status !== 'completed') {
			return json({ success: false, message: 'Export not found or not completed' }, { status: 404 });
		}

		// Check for file path in job.result
		const filePath = (job.result as Record<string, unknown>)?.file_path as string;
		if (!filePath) {
			return json({ success: false, message: 'Export file not found' }, { status: 404 });
		}

		console.log('About to call getExportDownloadUrl with:', { jobId, userId: user.id, filePath });
		const signedUrl = await ExportService.getExportDownloadUrl(jobId, user.id);
		console.log('getExportDownloadUrl returned:', signedUrl);

		if (!signedUrl) {
			return json({ success: false, message: 'Could not generate download link' }, { status: 500 });
		}

		// Redirect to the signed URL
		return redirect(302, signedUrl);
	} catch (error) {
		// Re-throw SvelteKit redirects so they are handled properly
		if ((error as any)?.status === 302 && (error as any)?.location) {
			throw error;
		}
		console.error('Error generating export download link:', error);
		return json({ success: false, message: 'Internal server error' }, { status: 500 });
	}
};
