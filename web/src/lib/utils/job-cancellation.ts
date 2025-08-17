// web/src/lib/utils/job-cancellation.ts
import { createWorkerClient } from '$lib/core/supabase/worker';

/**
 * Check if a job has been cancelled
 * @param jobId - The job ID to check
 * @throws Error if the job has been cancelled
 */
export async function checkJobCancellation(jobId?: string): Promise<void> {
	if (!jobId) return;

	const supabase = createWorkerClient();
	const { data: job, error } = await supabase
		.from('jobs')
		.select('status')
		.eq('id', jobId)
		.single();

	if (error || !job) {
		console.error('🔍 Error checking job status:', error);
		return;
	}

	if (job.status === 'cancelled') {
		console.log(`🛑 Job ${jobId} was cancelled`);
		throw new Error('Job was cancelled');
	}
}
