import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ExportService } from '$lib/services/export.service';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const {
			data: { user },
			error: userError
		} = await locals.supabase.auth.getUser();

		if (userError) {
			return json({ success: false, message: 'Authentication error' }, { status: 401 });
		}

		if (!user?.id) {
			return json({ success: false, message: 'No authenticated user found' }, { status: 401 });
		}

		const { job_id } = params;

		if (!job_id) {
			return json({ success: false, message: 'Export job ID is required' }, { status: 400 });
		}

		// Get the download URL for the export
		const downloadUrl = await ExportService.getExportDownloadUrl(job_id, user.id);

		if (!downloadUrl) {
			return json({ success: false, message: 'Export file not found or expired' }, { status: 404 });
		}

		// Redirect to the signed URL
		throw redirect(302, downloadUrl);
	} catch (error) {
		if (error instanceof Response) {
			throw error; // Re-throw redirect responses
		}

		console.error('Export download failed:', error);
		return json({ success: false, message: 'Failed to get download URL' }, { status: 500 });
	}
};
