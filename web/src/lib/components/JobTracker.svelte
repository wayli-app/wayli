<!-- web/src/lib/components/JobTracker.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { SSEService, type JobUpdate } from '$lib/services/sse.service';
	import { updateJobInStore, removeJobFromStore, getActiveJobsMap } from '$lib/stores/job-store';

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

	let sseService = $state<SSEService | null>(null);
	let completedJobIds = $state(new Set<string>()); // Track completed jobs to prevent duplicate toasts
	let pollingInterval = $state<NodeJS.Timeout | null>(null); // Fallback polling

	// Expose methods for parent components
	export function startMonitoring() {
		console.log('🔗 JobTracker: Starting monitoring...');
		if (sseService) {
			console.log('🔗 JobTracker: Disconnecting existing SSE service');
			sseService.disconnect();
			sseService = null;
		}

		console.log('🔗 JobTracker: About to create SSE service...');

		// Create a new SSE service instance
		sseService = new SSEService({
			onConnected: () => {
				console.log('🔗 JobTracker: Connected to job stream');
				// Immediately fetch any existing jobs to ensure we don't miss any
				setTimeout(async () => {
					try {
						const { fetchAndPopulateJobs } = await import('$lib/stores/job-store');
						await fetchAndPopulateJobs();
					} catch (error) {
						console.error('❌ JobTracker: Error fetching initial jobs:', error);
					}
				}, 100);
			},
			onDisconnected: () => {
				console.log('🔌 JobTracker: Disconnected from job stream');
			},
			onError: (error: string) => {
				console.error('❌ JobTracker: SSE error:', error);
			},
			onJobUpdate: (jobs: JobUpdate[]) => {
				// Update active jobs
				for (const job of jobs) {
					// Update the global store
					updateJobInStore(job);
				}

				// Clean up old completed jobs (older than 30 seconds)
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

				// Show toast notifications for status changes
				for (const job of jobs) {
					const previousJob = currentJobs.get(job.id);
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
				}

				// Notify parent component
				if (onJobUpdate) {
					try {
						onJobUpdate(jobs);
					} catch (error) {
						console.error('❌ JobTracker: Error calling onJobUpdate callback:', error);
					}
				}
			},
			onJobCompleted: (jobs: JobUpdate[]) => {
				// Handle completed jobs
				for (const job of jobs) {
					// Mark as completed in our tracking
					completedJobIds.add(job.id);

					// Immediately update the job status in the store so UI reflects the change
					updateJobInStore(job);

					// Remove from active jobs after a delay
					setTimeout(() => {
						removeJobFromStore(job.id);
					}, 5000); // 5 second delay
				}

				// Notify parent component
				onJobCompleted?.(jobs);
			}
		}, jobType);

		// Connect to the SSE service
		sseService.connect();

		// Start fallback polling in case SSE fails
		startPollingFallback();
	}

	// Fallback polling function for when SSE is not available
	async function startPollingFallback() {
		// Clear any existing polling interval
		if (pollingInterval) {
			clearInterval(pollingInterval);
		}

		// Poll every 2 seconds to catch progress updates
		pollingInterval = setInterval(async () => {
			try {
				const { fetchAndPopulateJobs } = await import('$lib/stores/job-store');
				await fetchAndPopulateJobs();
			} catch (error) {
				console.error('❌ JobTracker: Error in fallback polling:', error);
			}
		}, 2000);
	}

	export function stopMonitoring() {
		if (sseService) {
			sseService.disconnect();
			sseService = null;
		}

		// Clear polling interval
		if (pollingInterval) {
			clearInterval(pollingInterval);
			pollingInterval = null;
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

		// Clear polling interval
		if (pollingInterval) {
			clearInterval(pollingInterval);
			pollingInterval = null;
		}
	});
</script>

<!-- This component doesn't render anything visible, it just provides job tracking functionality -->
