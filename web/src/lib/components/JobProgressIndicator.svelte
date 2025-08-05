<script lang="ts">
	import { Clock, Download, Upload, MapPin, Route, FileDown, X } from 'lucide-svelte';
	import { getActiveJobsMap, subscribe, fetchAndPopulateJobs } from '$lib/stores/job-store';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/core/supabase/client';

	// State
	let activeJobs = $state(getActiveJobsMap());
	let visibleJobs = $state<any[]>([]);
	let showCompletedJobs = $state<any[]>([]);
	let completedJobTimers = $state(new Map<string, NodeJS.Timeout>());
	let showCancelConfirm = $state(false);
	let jobToCancel = $state<any>(null);
	let completedExportJobs = $state<any[]>([]);
	let exportJobTimers = $state(new Map<string, NodeJS.Timeout>());

	// Subscribe to store changes
	onMount(() => {
		// Fetch and populate jobs on page load
		fetchAndPopulateJobs().catch(error => {
			console.error('❌ JobProgressIndicator: Error fetching jobs on mount:', error);
		});

		const unsubscribeJobs = subscribe(() => {
			const newJobs = getActiveJobsMap();
			activeJobs = newJobs;
		});

		return () => {
			unsubscribeJobs();
			// Clear all timers
			completedJobTimers.forEach(timer => clearTimeout(timer));
			completedJobTimers.clear();
			exportJobTimers.forEach(timer => clearTimeout(timer));
			exportJobTimers.clear();
		};
	});

	// Get job type icon
	function getJobTypeIcon(type: string) {
		switch (type) {
			case 'data_import':
				return FileDown;
			case 'data_export':
				return Upload;
			case 'reverse_geocoding':
			case 'reverse_geocoding_missing':
				return MapPin;
			case 'trip_generation':
				return Route;
			default:
				return Clock;
		}
	}

	// Get job type display name
	function getJobTypeDisplayName(type: string) {
		switch (type) {
			case 'data_import':
				return 'Import';
			case 'data_export':
				return 'Export';
			case 'reverse_geocoding':
			case 'reverse_geocoding_missing':
				return 'Geocoding';
			case 'trip_generation':
				return 'Trip Generation';
			default:
				return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
		}
	}

	// Get job type title
	function getJobTypeTitle(type: string) {
		switch (type) {
			case 'data_import':
				return 'Import';
			case 'data_export':
				return 'Export';
			case 'reverse_geocoding':
			case 'reverse_geocoding_missing':
				return 'Geocoding';
			case 'trip_generation':
				return 'Trip Generation';
			default:
				return 'Job';
		}
	}

	// Get ETA display
	function getETADisplay(job: any): string {
		if (job.status !== 'running' && job.status !== 'queued') {
			return '';
		}

		// Show "Queued..." for queued jobs
		if (job.status === 'queued') {
			return 'Queued...';
		}

		// Use server-provided ETA from result.estimatedTimeRemaining if available
		if (job.result?.estimatedTimeRemaining) {
			return job.result.estimatedTimeRemaining;
		}

		// Fallback to job.eta if available
		if (job.eta) {
			return job.eta;
		}

		// For data import/export, calculate ETA based on progress
		if (job.type === 'data_import' || job.type === 'data_export') {
			if (job.progress === 0) return 'Calculating...';
			if (job.progress === 100) return 'Complete';

			// Simple ETA calculation (could be improved with actual timing data)
			const remaining = 100 - job.progress;
			const estimatedMinutes = Math.ceil(remaining / 10); // Rough estimate
			return `${estimatedMinutes}m remaining`;
		}

		// For reverse geocoding jobs, calculate based on progress
		if (job.type === 'reverse_geocoding' || job.type === 'reverse_geocoding_missing') {
			if (job.progress === 0) return 'Calculating...';
			if (job.progress === 100) return 'Complete';

			// Simple ETA calculation for reverse geocoding
			const remaining = 100 - job.progress;
			const estimatedMinutes = Math.ceil(remaining / 5); // Reverse geocoding is typically slower
			return `${estimatedMinutes}m remaining`;
		}

		return 'In progress';
	}

	// Get status color
	function getStatusColor(status: string) {
		switch (status) {
			case 'queued':
				return 'text-yellow-600';
			case 'running':
				return 'text-blue-600';
			case 'completed':
				return 'text-green-600';
			case 'failed':
				return 'text-red-600';
			default:
				return 'text-gray-600';
		}
	}

	// Cancel job function
	async function handleCancelJob(job: any) {
		jobToCancel = job;
		showCancelConfirm = true;
	}

	// Confirm cancel job
	async function confirmCancelJob() {
		if (!jobToCancel) return;

		try {
			const { data: { session } } = await supabase.auth.getSession();
			if (!session) {
				toast.error('❌ Not authenticated');
				return;
			}

			// Call the cancel job Edge Function
			const { data, error } = await supabase.functions.invoke('jobs', {
				method: 'DELETE',
				body: { jobId: jobToCancel.id }
			});

			if (error) {
				throw new Error(error.message || 'Failed to cancel job');
			}

			toast.success('✅ Job cancelled successfully');
		} catch (error) {
			console.error('❌ Error cancelling job:', error);
			toast.error('❌ Failed to cancel job');
		} finally {
			showCancelConfirm = false;
			jobToCancel = null;
		}
	}

	// Cancel the confirmation
	function cancelConfirmation() {
		showCancelConfirm = false;
		jobToCancel = null;
	}

	// Download export job result
	async function handleDownloadExport(job: any) {
		try {
			const { data: { session } } = await supabase.auth.getSession();
			if (!session) {
				toast.error('❌ Not authenticated');
				return;
			}

			// Get download URL from Edge Function
			const { data, error } = await supabase.functions.invoke(`export-download/${job.id}`);

			if (error) {
				throw new Error(error.message || 'Failed to get download URL');
			}

			if (data?.downloadUrl) {
				// Create a temporary link and click it
				const link = document.createElement('a');
				link.href = data.downloadUrl;
				link.download = data.fileName || `export-${job.id}.zip`;
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);

				toast.success('✅ Download started');

				// Remove the job from the completed export jobs list
				completedExportJobs = completedExportJobs.filter(j => j.id !== job.id);
				if (exportJobTimers.has(job.id)) {
					clearTimeout(exportJobTimers.get(job.id));
					exportJobTimers.delete(job.id);
				}
			} else {
				throw new Error('No download URL available');
			}
		} catch (error) {
			console.error('❌ Error downloading export:', error);
			toast.error('❌ Failed to download export');
		}
	}

		// Watch for active jobs and show all active/queued jobs
	$effect(() => {
		const jobs = Array.from(activeJobs.values());

		// Get all active and queued jobs
		const activeJobsList = jobs.filter(job => job.status === 'queued' || job.status === 'running');

		// Get recently completed jobs (within 5 seconds)
		const recentlyCompletedJobs = jobs.filter(job =>
			job.status === 'completed' &&
			(Date.now() - new Date(job.updated_at).getTime()) < 5000
		);

		// Get completed export jobs (within 1 minute)
		const recentlyCompletedExportJobs = jobs.filter(job =>
			job.type === 'data_export' &&
			job.status === 'completed' &&
			(Date.now() - new Date(job.updated_at).getTime()) < 60000
		);

		// Update visible jobs
		visibleJobs = activeJobsList;

		// Handle recently completed jobs
		recentlyCompletedJobs.forEach(job => {
			if (!showCompletedJobs.find(j => j.id === job.id)) {
				showCompletedJobs = [...showCompletedJobs, job];

				// Set timer to remove this completed job after 5 seconds
				const timer = setTimeout(() => {
					showCompletedJobs = showCompletedJobs.filter(j => j.id !== job.id);
					completedJobTimers.delete(job.id);
				}, 5000);

				completedJobTimers.set(job.id, timer);
			}
		});

		// Handle completed export jobs
		recentlyCompletedExportJobs.forEach(job => {
			if (!completedExportJobs.find(j => j.id === job.id)) {
				completedExportJobs = [...completedExportJobs, job];

				// Set timer to remove this completed export job after 1 minute
				const timer = setTimeout(() => {
					completedExportJobs = completedExportJobs.filter(j => j.id !== job.id);
					exportJobTimers.delete(job.id);
				}, 60000);

				exportJobTimers.set(job.id, timer);
			}
		});

		// Clean up timers for jobs that are no longer in recently completed
		completedJobTimers.forEach((timer, jobId) => {
			if (!recentlyCompletedJobs.find(job => job.id === jobId)) {
				clearTimeout(timer);
				completedJobTimers.delete(jobId);
			}
		});

		// Clean up timers for export jobs that are no longer in recently completed
		exportJobTimers.forEach((timer, jobId) => {
			if (!recentlyCompletedExportJobs.find(job => job.id === jobId)) {
				clearTimeout(timer);
				exportJobTimers.delete(jobId);
			}
		});
	});
</script>

{#if visibleJobs.length > 0 || showCompletedJobs.length > 0 || completedExportJobs.length > 0}
	<!-- Active Jobs -->
	{#each visibleJobs as job (job.id)}
		{@const JobIcon = getJobTypeIcon(job.type)}
		{@const statusColor = getStatusColor(job.status)}
		{@const eta = getETADisplay(job)}
		{@const jobTypeName = getJobTypeDisplayName(job.type)}

		<div class="mb-3 flex items-center gap-3">
			<!-- Job Icon -->
			<div class="flex-shrink-0">
				<JobIcon class="h-5 w-5 {statusColor}" />
			</div>

			<!-- Progress and ETA -->
			<div class="flex-1 min-w-0">
				<!-- Job Type Label -->
				<div class="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">
					{jobTypeName}
				</div>

				{#if job.status === 'running' || job.status === 'queued'}
					<!-- Progress Bar with percentage inside -->
					<div class="mb-1 relative">
						<div class="h-4 w-full rounded-full bg-gray-200 dark:bg-gray-700">
							<div
								class="h-4 rounded-full bg-blue-600 transition-all duration-300 relative"
								style="width: {job.progress}%"
							>
								<!-- Percentage text inside progress bar -->
								{#if job.progress > 10}
									<div class="absolute inset-0 flex items-center justify-center">
										<span class="text-xs font-medium text-white drop-shadow-sm">
											{job.progress}%
										</span>
									</div>
								{/if}
							</div>
						</div>
					</div>
					<!-- ETA -->
					{#if eta}
						<div class="text-xs text-gray-500 dark:text-gray-400">
							{eta}
						</div>
					{/if}
				{:else if job.status === 'completed'}
					<div class="text-xs text-green-600 dark:text-green-400">
						✅ Complete
					</div>
				{:else if job.status === 'failed'}
					<div class="text-xs text-red-600 dark:text-red-400">
						❌ Failed
					</div>
				{/if}
			</div>

			<!-- Cancel Button (only for running/queued jobs) -->
			{#if job.status === 'running' || job.status === 'queued'}
				<button
					on:click={() => handleCancelJob(job)}
					class="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-700 dark:hover:text-red-400"
					title="Cancel job"
					aria-label="Cancel job"
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
		</div>
	{/each}

	<!-- Recently Completed Jobs -->
	{#each showCompletedJobs as job (job.id)}
		{@const JobIcon = getJobTypeIcon(job.type)}
		{@const statusColor = getStatusColor(job.status)}
		{@const jobTypeName = getJobTypeDisplayName(job.type)}

		<div class="mb-3 flex items-center gap-3">
			<!-- Job Icon -->
			<div class="flex-shrink-0">
				<JobIcon class="h-5 w-5 {statusColor}" />
			</div>

			<!-- Progress and ETA -->
			<div class="flex-1 min-w-0">
				<!-- Job Type Label -->
				<div class="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">
					{jobTypeName}
				</div>

				<div class="text-xs text-green-600 dark:text-green-400">
					✅ Complete
				</div>
			</div>
		</div>
	{/each}

	<!-- Completed Export Jobs -->
	{#each completedExportJobs as job (job.id)}
		{@const JobIcon = getJobTypeIcon(job.type)}
		{@const statusColor = getStatusColor(job.status)}
		{@const jobTypeName = getJobTypeDisplayName(job.type)}

		<div class="mb-3 flex items-center gap-3">
			<!-- Job Icon -->
			<div class="flex-shrink-0">
				<JobIcon class="h-5 w-5 {statusColor}" />
			</div>

			<!-- Progress and Download -->
			<div class="flex-1 min-w-0">
				<!-- Job Type Label -->
				<div class="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">
					{jobTypeName}
				</div>

				<div class="text-xs text-green-600 dark:text-green-400">
					✅ Complete - Ready to download
				</div>
			</div>

			<!-- Download Button -->
			<button
				on:click={() => handleDownloadExport(job)}
				class="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-500 dark:hover:bg-gray-700 dark:hover:text-blue-400"
				title="Download export"
				aria-label="Download export"
			>
				<Download class="h-4 w-4" />
			</button>
		</div>
	{/each}
{/if}

<!-- Cancel Confirmation Modal -->
{#if showCancelConfirm && jobToCancel}
	<div class="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div class="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-gray-800 p-6">
			<div class="mb-4">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
					Cancel Job
				</h3>
				<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
					Are you sure you want to cancel the {getJobTypeDisplayName(jobToCancel.type).toLowerCase()} job? This action cannot be undone.
				</p>
			</div>
			<div class="flex justify-end gap-3">
				<button
					on:click={cancelConfirmation}
					class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
				>
					Keep Running
				</button>
				<button
					on:click={confirmCancelJob}
					class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
				>
					Cancel Job
				</button>
			</div>
		</div>
	</div>
{/if}