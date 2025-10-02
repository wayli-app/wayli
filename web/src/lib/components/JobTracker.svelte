<!-- web/src/lib/components/JobTracker.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { JobRealtimeService, type JobUpdate } from '$lib/services/job-realtime.service';
	import { updateJobInStore, removeJobFromStore, getActiveJobsMap, fetchAndPopulateJobs } from '$lib/stores/job-store';

	// Helper function to get job type info for notifications
	function getJobTypeInfo(type: string) {
		switch (type) {
			case 'data_import':
				return { title: 'Data Import' };
			case 'data_export':
				return { title: 'Data Export' };
			case 'reverse_geocoding_missing':
				return { title: 'Reverse Geocoding' };
			case 'trip_generation':
				return { title: 'Trip Generation' };
			default:
				return { title: 'Background Job' };
		}
	}

	let {
		jobType = null,
		autoStart = true,
		showToasts = true,
		onJobUpdate = null as ((jobs: JobUpdate[]) => void) | null,
		onJobCompleted = null as ((jobs: JobUpdate[]) => void) | null
	} = $props();

	let realtimeService = $state<JobRealtimeService | null>(null);
	let completedJobIds = $state(new Set<string>()); // Track completed jobs to prevent duplicate toasts

	// Expose methods for parent components
	export async function startMonitoring() {
		console.log('🔗 JobTracker: Starting monitoring...');

		// Disconnect any existing service
		if (realtimeService) {
			await realtimeService.disconnect();
			realtimeService = null;
		}

		// Step 1: Immediately fetch current active jobs
		console.log('📥 JobTracker: Fetching initial jobs...');
		try {
			await fetchAndPopulateJobs();
			const jobCount = getActiveJobsMap().size;
			console.log(`✅ JobTracker: Initial jobs loaded (${jobCount} jobs)`);
		} catch (error) {
			console.error('❌ JobTracker: Error fetching initial jobs:', error);
		}

		// Step 2: Connect to realtime
		console.log('🔗 JobTracker: Connecting to Realtime...');
		try {
			await startRealtimeMonitoring();
		} catch (error) {
			console.error('❌ JobTracker: Realtime connection failed:', error);
		}
	}

	// Helper functions for handling job updates
	function handleJobUpdate(job: JobUpdate) {
		// Update the global store
		updateJobInStore(job);

		// Show toast notifications for status changes
		const previousJob = getActiveJobsMap().get(job.id);
		if (previousJob && previousJob.status !== job.status) {
			if (showToasts) {
				const jobTypeInfo = getJobTypeInfo(job.type);
				if (job.status === 'completed') {
					toast.success(`${jobTypeInfo.title} completed successfully!`);
				} else if (job.status === 'failed') {
					toast.error(`${jobTypeInfo.title} failed`);
				} else if (job.status === 'cancelled') {
					toast.info(`${jobTypeInfo.title} was cancelled`);
				}
			}
		}

		// Notify parent component
		if (onJobUpdate) {
			try {
				onJobUpdate([job]);
			} catch (error) {
				console.error('❌ JobTracker: Error calling onJobUpdate callback:', error);
			}
		}

		// Clean up old completed jobs (older than 30 seconds)
		cleanupOldJobs();
	}

	function handleJobCompleted(job: JobUpdate) {
		// Mark as completed in our tracking
		completedJobIds.add(job.id);

		// Immediately update the job status in the store
		updateJobInStore(job);

		// Remove from active jobs after a delay
		setTimeout(() => {
			removeJobFromStore(job.id);
		}, 5000); // 5 second delay

		// Notify parent component
		onJobCompleted?.([job]);
	}

	function cleanupOldJobs() {
		const now = Date.now();
		const currentJobs = getActiveJobsMap();
		for (const [jobId, job] of currentJobs.entries()) {
			if (
				job.status === 'completed' ||
				job.status === 'failed' ||
				job.status === 'cancelled'
			) {
				const jobTime = new Date(job.updated_at).getTime();
				if (now - jobTime > 30000) {
					// 30 seconds
					removeJobFromStore(jobId);
				}
			}
		}
	}

	async function startRealtimeMonitoring() {
		realtimeService = new JobRealtimeService({
			onConnected: () => {
				console.log('✅ JobTracker: Realtime connected');
			},
			onDisconnected: () => {
				console.log('🔌 JobTracker: Realtime disconnected');
			},
			onError: (error: string) => {
				console.error('❌ JobTracker: Realtime error:', error);
			},
			onJobUpdate: (job: JobUpdate) => {
				// Filter by job type if specified
				if (jobType && job.type !== jobType) {
					return;
				}
				handleJobUpdate(job);
			},
			onJobCompleted: (job: JobUpdate) => {
				// Filter by job type if specified
				if (jobType && job.type !== jobType) {
					return;
				}
				handleJobCompleted(job);
			}
		});

		await realtimeService.connect();
	}

	export async function stopMonitoring() {
		if (realtimeService) {
			await realtimeService.disconnect();
			realtimeService = null;
		}
	}

	export function getActiveJobs(): JobUpdate[] {
		return Array.from(getActiveJobsMap().values());
	}

	export function getJobUpdate(jobId: string): JobUpdate | undefined {
		return getActiveJobsMap().get(jobId);
	}

	export function getLatestJobUpdate(jobId: string): JobUpdate | undefined {
		return getActiveJobsMap().get(jobId);
	}

	export function isJobActive(jobId: string): boolean {
		return getActiveJobsMap().has(jobId);
	}

	export function addJob(job: JobUpdate): void {
		if (jobType && job.type !== jobType) {
			return; // Skip if we're filtering by job type
		}
		updateJobInStore(job);
	}

	export function updateParentState(jobs: JobUpdate[]): void {
		if (onJobUpdate) {
			onJobUpdate(jobs);
		}
	}

	// Auto-start monitoring if enabled
	onMount(() => {
		if (autoStart) {
			startMonitoring();
		}
	});

	onDestroy(() => {
		stopMonitoring();
		// Clear completed job tracking
		completedJobIds.clear();
	});
</script>

<!-- This component doesn't render anything visible, it just provides job tracking functionality -->
