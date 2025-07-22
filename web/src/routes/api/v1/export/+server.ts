import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ExportService } from '$lib/services/export.service';

export const POST: RequestHandler = async ({ request, locals }) => {
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

		const body = await request.json();
		const { format, includeLocationData, includeTripInfo, includeWantToVisit, includeTrips, startDate, endDate } = body;

		// Validate required fields
		if (!format) {
			return json({ success: false, message: 'Missing format' }, { status: 400 });
		}

		// Validate boolean fields
		if (typeof includeLocationData !== 'boolean') {
			return json({ success: false, message: 'includeLocationData must be a boolean' }, { status: 400 });
		}

		// Create the export job
		const job = await ExportService.createExportJob(user.id, {
			includeLocationData,
			includeTripInfo,
			includeWantToVisit,
			includeTrips,
			startDate,
			endDate
		});

		return json({
			success: true,
			data: {
				jobId: job.id,
				message: 'Export job created successfully. Your export is being processed.'
			}
		});
	} catch (error) {
		console.error('Export creation failed:', error);
		return json({ success: false, message: 'Failed to create export job' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ locals }) => {
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

		const exportJobs = await ExportService.getUserExportJobs(user.id);

		return json({
			success: true,
			data: exportJobs
		});
	} catch (error) {
		console.error('Failed to fetch export jobs:', error);
		return json({ success: false, message: 'Failed to fetch export jobs' }, { status: 500 });
	}
};
