// web/src/lib/stores/job-store.ts
import type { JobUpdate } from '$lib/services/sse.service';

// Simple variable for active jobs
let _activeJobs = new Map<string, JobUpdate>();

// Callback system to notify subscribers of changes
let _subscribers: Array<() => void> = [];

function notifySubscribers() {
	_subscribers.forEach((callback) => callback());
}

export function subscribe(callback: () => void) {
	_subscribers.push(callback);
	return () => {
		_subscribers = _subscribers.filter((cb) => cb !== callback);
	};
}

// Getter function to access the current state
export function getActiveJobsMap(): Map<string, JobUpdate> {
	return _activeJobs;
}

// Helper functions to manage the store
export function addJobToStore(job: JobUpdate) {
	try {
		const newJobs = new Map(_activeJobs);
		newJobs.set(job.id, job);
		_activeJobs = newJobs;
		notifySubscribers();
	} catch (error) {
		console.error('❌ Store: Error in addJobToStore:', error);
	}
}

export function updateJobInStore(job: JobUpdate) {
	try {
		const newJobs = new Map(_activeJobs);
		newJobs.set(job.id, job);
		_activeJobs = newJobs;
		notifySubscribers();
	} catch (error) {
		console.error('❌ Store: Error in updateJobInStore:', error);
	}
}

export function removeJobFromStore(jobId: string) {
	try {
		const newJobs = new Map(_activeJobs);
		newJobs.delete(jobId);
		_activeJobs = newJobs;
		notifySubscribers();
	} catch (error) {
		console.error('❌ Store: Error in removeJobFromStore:', error);
	}
}

export function getJobFromStore(jobId: string): JobUpdate | undefined {
	return _activeJobs.get(jobId);
}

export function clearCompletedJobs() {
	try {
		const newJobs = new Map();
		const now = Date.now();

		for (const [jobId, job] of _activeJobs.entries()) {
			// Keep jobs that are still active or recently completed (within 30 seconds)
			if (
				job.status === 'queued' ||
				job.status === 'running' ||
				now - new Date(job.updated_at).getTime() < 30000
			) {
				newJobs.set(jobId, job);
			}
		}

		_activeJobs = newJobs;
		notifySubscribers();
	} catch (error) {
		console.error('❌ Store: Error in clearCompletedJobs:', error);
	}
}

// Fetch and populate jobs from the server
export async function fetchAndPopulateJobs() {
	try {
		const { supabase } = await import('$lib/supabase');
		const {
			data: { session }
		} = await supabase.auth.getSession();

		if (!session) {
			return;
		}

		// Get all active jobs (queued and running)
		const { data: activeJobs, error: activeError } = await supabase
			.from('jobs')
			.select('*')
			.eq('created_by', session.user.id)
			.in('status', ['queued', 'running'])
			.order('created_at', { ascending: false });

		if (activeError) {
			console.error('❌ Store: Error fetching active jobs:', activeError);
			return;
		}

		// Get recently completed jobs (within last 5 minutes)
		const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
		const { data: recentCompletedJobs, error: completedError } = await supabase
			.from('jobs')
			.select('*')
			.eq('created_by', session.user.id)
			.in('status', ['completed', 'failed', 'cancelled'])
			.gte('updated_at', fiveMinutesAgo)
			.order('created_at', { ascending: false });

		if (completedError) {
			console.error('❌ Store: Error fetching completed jobs:', completedError);
			return;
		}

		// Combine all jobs
		const allJobs = [...(activeJobs || []), ...(recentCompletedJobs || [])];

		// Clear current store and populate with fetched jobs
		const newJobs = new Map();
		for (const job of allJobs) {
			// Convert to JobUpdate format
			const jobUpdate: JobUpdate = {
				id: job.id,
				type: job.type,
				status: job.status,
				progress: job.progress || 0,
				created_at: job.created_at,
				updated_at: job.updated_at,
				result: job.result,
				error: job.error
			};
			newJobs.set(job.id, jobUpdate);
		}

		_activeJobs = newJobs;
		notifySubscribers();
	} catch (error) {
		console.error('❌ Store: Error in fetchAndPopulateJobs:', error);
	}
}
