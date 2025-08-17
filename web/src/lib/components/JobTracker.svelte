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
			case 'reverse_geocoding':
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

	// Debug: Log the callback when component is created

	let sseService = $state<SSEService | null>(null);
	let completedJobIds = $state(new Set<string>()); // Track completed jobs to prevent duplicate toasts

	// Expose methods for parent components
	export function startMonitoring() {
		if (sseService) {
			sseService.disconnect();
		}

		sseService = new SSEService(
			{
				onConnected: () => {
					// Connection established
				},
				onDisconnected: () => {
					// Connection lost
				},
				onError: (error) => {
					if (showToasts) {
						toast.error('Job monitoring error', {
							description: error
						});
					}
				},
				onJobUpdate: (jobs) => {
					// Update active jobs
					for (const job of jobs) {
						if (jobType && job.type !== jobType) {
							continue; // Skip if we're filtering by job type
						}

						// Update the global store
						updateJobInStore(job);
					}

					// Don't remove completed jobs immediately - let the page handle it after delay
					// Keep completed jobs in active list for a short time so pages can show final state

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

					// Show toast notifications for status changes (not progress updates)
					for (const job of jobs) {
						// Get the previous job state to detect status changes
						const previousJob = currentJobs.get(job.id);

						if (previousJob && previousJob.status !== job.status) {
							// Status changed - show toast notification
							const jobTypeInfo = getJobTypeInfo(job.type);

							if (job.status === 'completed') {
								toast.success(`${jobTypeInfo.title} completed successfully!`, {
									description: job.result?.message || 'Your job has finished processing.'
								});
							} else if (job.status === 'failed') {
								toast.error(`${jobTypeInfo.title} failed`, {
									description: job.error || 'An error occurred while processing your job.'
								});
							} else if (job.status === 'cancelled') {
								toast.info(`${jobTypeInfo.title} cancelled`, {
									description: 'Your job was cancelled.'
								});
							}
						}
					}

					// Notify parent component

					// Try calling the registered parent method
					if (onJobUpdate) {
						try {
							onJobUpdate(jobs);
						} catch (error) {
							console.error('❌ JobTracker: Error calling onJobUpdate callback:', error);
						}
					}
				},
				onJobCompleted: (jobs) => {
					// Remove from active jobs
					for (const job of jobs) {
						removeJobFromStore(job.id);
					}

					// Show completion toasts with specific messages based on job type
					if (showToasts) {
						for (const job of jobs) {
							// Only show toast if we haven't already shown one for this job
							// AND if the job completed very recently (within last 5 seconds)
							const jobCompletionTime = new Date(job.updated_at).getTime();
							const now = Date.now();
							const isRecentCompletion = now - jobCompletionTime < 5000; // 5 seconds

							if (
								job.status === 'completed' &&
								!completedJobIds.has(job.id) &&
								isRecentCompletion
							) {
								// Mark this job as completed to prevent duplicate toasts
								completedJobIds.add(job.id);

								// Show specific messages based on job type
								if (job.type === 'data_export') {
									toast.success('Export completed successfully!', {
										description: 'Your export file is ready for download.'
									});
								} else if (job.type === 'data_import') {
									toast.success('Import completed successfully!', {
										description: 'Your data has been imported successfully.'
									});
								} else if (job.type === 'trip_generation') {
									toast.success('Trip generation completed!', {
										description: 'New trip suggestions are ready for review.'
									});
								} else {
									// Generic fallback
									toast.success('Job completed successfully!', {
										description: job.result?.message || 'Your job has finished processing.'
									});
								}
							} else if (
								job.status === 'failed' &&
								!completedJobIds.has(job.id) &&
								isRecentCompletion
							) {
								// Mark this job as failed to prevent duplicate toasts
								completedJobIds.add(job.id);

								// Show specific error messages based on job type
								if (job.type === 'data_export') {
									toast.error('Export failed', {
										description: job.error || 'Failed to create export file.'
									});
								} else if (job.type === 'data_import') {
									toast.error('Import failed', {
										description: job.error || 'Failed to import data.'
									});
								} else if (job.type === 'trip_generation') {
									toast.error('Trip generation failed', {
										description: job.error || 'Failed to generate trip suggestions.'
									});
								} else {
									toast.error('Job failed', {
										description: job.error || 'An error occurred while processing your job.'
									});
								}
							}
						}
					}

					// Notify parent component
					onJobCompleted?.(jobs);
				},
				onHeartbeat: () => {
					// Keep connection alive
				}
			},
			jobType || undefined
		);

		// Add a small delay to allow session to be available
		setTimeout(() => {
			sseService?.connect();
		}, 100);
	}

	export function stopMonitoring() {
		if (sseService) {
			sseService.disconnect();
			sseService = null;
		}
		// activeJobs.clear(); // This line is no longer needed as activeJobs is now a store
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

	// Reactive statement to expose active jobs count
</script>

<!-- This component doesn't render anything visible, it just provides job tracking functionality -->
