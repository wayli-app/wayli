<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { sessionStore } from '$lib/stores/auth';
	import { toast } from 'svelte-sonner';
	import { MapPin, RefreshCw } from 'lucide-svelte';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';

	// Props
	export let showProgress = true;
	export let showButton = true;

	// State
	let activeReverseGeocodingJob: any = null;
	let reverseGeocodingProgress = 0;
	let reverseGeocodingStatus = '';
	let reverseGeocodingPollingInterval: ReturnType<typeof setInterval> | null = null;
	let geocodingStats = { total: 0, geocoded: 0, percentage: 0, missing: 0 };
	let isLoading = false;

	// Check for active reverse geocoding job on component mount
	async function checkForActiveReverseGeocodingJob() {
		try {
			const session = get(sessionStore);
			if (!session) {
				return;
			}

			const serviceAdapter = new ServiceAdapter({ session });
			const jobs = await serviceAdapter.getJobs({ type: 'reverse_geocoding_missing' }) as any;

			// Handle both array and paginated response formats
			let jobsData: any[] = [];
			if (Array.isArray(jobs)) {
				jobsData = jobs;
			} else if (jobs.jobs) {
				jobsData = jobs.jobs;
			}

			const activeJobs = jobsData.filter(
				(job: any) => job.status === 'queued' || job.status === 'running'
			);

			if (activeJobs.length > 0) {
				activeReverseGeocodingJob = activeJobs[0]; // Get the most recent active job
				startReverseGeocodingPolling(activeReverseGeocodingJob.id);
				updateReverseGeocodingProgressFromJob(activeReverseGeocodingJob);
			}
		} catch (error) {
			console.error('Error checking for active reverse geocoding jobs:', error);
		}
	}

	function startReverseGeocodingPolling(jobId: string) {
		if (!jobId) return;
		if (reverseGeocodingPollingInterval) {
			clearInterval(reverseGeocodingPollingInterval);
		}

		reverseGeocodingPollingInterval = setInterval(async () => {
			if (!activeReverseGeocodingJob) {
				stopReverseGeocodingPolling();
				return;
			}

			try {
				const session = get(sessionStore);
				if (!session) {
					stopReverseGeocodingPolling();
					return;
				}

				const serviceAdapter = new ServiceAdapter({ session });
				const job = await serviceAdapter.getJobProgress(jobId) as any;

				if (job) {
					activeReverseGeocodingJob = job;
					updateReverseGeocodingProgressFromJob(job);

					// Stop polling if job is finished
					if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
						stopReverseGeocodingPolling();

						// Show completion message
						if (job.status === 'completed') {
							toast.success('Reverse geocoding completed successfully!');
						} else if (job.status === 'failed') {
							toast.error('Reverse geocoding failed');
						}

						// Refresh geocoding stats after a short delay
						setTimeout(() => {
							activeReverseGeocodingJob = null;
							loadGeocodingStats();
						}, 2000);
					}
				} else {
					// If job is not found, stop polling and reset
					activeReverseGeocodingJob = null;
					stopReverseGeocodingPolling();
				}
			} catch (error) {
				console.error('Error polling reverse geocoding job status:', error);
			}
		}, 2000);
	}

	function stopReverseGeocodingPolling() {
		if (reverseGeocodingPollingInterval) {
			clearInterval(reverseGeocodingPollingInterval);
			reverseGeocodingPollingInterval = null;
		}
	}

			function updateReverseGeocodingProgressFromJob(job: any) {
		const result = (job.result as Record<string, unknown>) || {};

		// Calculate progress from detailed result data
		if (result.totalCount && result.processedCount !== undefined) {
			const totalCount = Number(result.totalCount);
			const processedCount = Number(result.processedCount);

			if (totalCount > 0) {
				// Use more precise calculation without rounding to avoid mismatch with status text
				reverseGeocodingProgress = Math.floor((processedCount / totalCount) * 100);
			} else {
				reverseGeocodingProgress = 0;
			}
		} else {
			// Fallback to job.progress if detailed data not available
			reverseGeocodingProgress = job.progress || 0;
		}

		// Build status message with processed/total counts
		if (result.totalCount && result.processedCount !== undefined) {
			const totalCount = Number(result.totalCount);
			const processedCount = Number(result.processedCount);
			const errorCount = Number(result.errorCount || 0);

			reverseGeocodingStatus = `Processed ${processedCount.toLocaleString()}/${totalCount.toLocaleString()} points`;
			if (errorCount > 0) {
				reverseGeocodingStatus += ` (${errorCount} errors)`;
			} else {
				reverseGeocodingStatus += ` (0 errors)`;
			}
		} else {
			reverseGeocodingStatus = (result.message as string) || job.status;
		}

		// Extract ETA from the result
		if (result.estimatedTimeRemaining) {
			reverseGeocodingStatus += ` • ETA: ${result.estimatedTimeRemaining}`;
		}
	}

	// Load geocoding statistics
	async function loadGeocodingStats() {
		try {
			const session = get(sessionStore);
			if (!session) return;

			const serviceAdapter = new ServiceAdapter({ session });
			const stats = await serviceAdapter.getGeocodingStats() as any;

			if (stats) {
				geocodingStats = {
					total: stats.total_points || 0,
					geocoded: stats.geocoded_count || 0,
					percentage: stats.success_rate || 0,
					missing: stats.failed_count || 0
				};
			}
		} catch (error) {
			console.error('Error loading geocoding stats:', error);
		}
	}

	// Start reverse geocoding job
	async function startReverseGeocodingJob() {
		if (isLoading) return;

		isLoading = true;
		try {
			const session = get(sessionStore);
			if (!session) {
				toast.error('Not authenticated');
				return;
			}

			const serviceAdapter = new ServiceAdapter({ session });
			const result = await serviceAdapter.createJob({
					type: 'reverse_geocoding_missing',
					data: {}
			}) as any;

				toast.success('Reverse geocoding job started!');

				// Start tracking the job progress
			if (result.job?.id) {
				activeReverseGeocodingJob = result.job;
				startReverseGeocodingPolling(result.job.id);
			}
		} catch (error) {
			console.error('Error starting reverse geocoding job:', error);
			toast.error('Failed to start reverse geocoding job');
		} finally {
			isLoading = false;
		}
	}

	// Refresh geocoding stats
	async function refreshStats() {
		await loadGeocodingStats();
	}

	onMount(async () => {
		await checkForActiveReverseGeocodingJob();
		await loadGeocodingStats();
	});

	onDestroy(() => {
		stopReverseGeocodingPolling();
	});
</script>

<div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
	<div class="flex items-center gap-2">
		<MapPin class="h-5 w-5 text-blue-500" />
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Geocoding Progress</span>
		<button
			on:click={refreshStats}
			class="ml-auto rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
			title="Refresh stats"
		>
			<RefreshCw class="h-4 w-4" />
		</button>
	</div>

	<div class="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
		{#if activeReverseGeocodingJob}
			{reverseGeocodingProgress}%
		{:else}
			{geocodingStats.geocoded?.toLocaleString() ?? 0} / {geocodingStats.total?.toLocaleString() ?? 0}
		{/if}
	</div>

	<!-- Progress bar for active jobs -->
	{#if showProgress && activeReverseGeocodingJob && reverseGeocodingProgress !== undefined}
		<div class="mt-3">
			<div class="mb-1 flex justify-between text-sm text-gray-600 dark:text-gray-400">
				<span>Progress</span>
				<span>{reverseGeocodingProgress}%</span>
			</div>
			<div class="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
				<div
					class="h-2 rounded-full bg-orange-600 transition-all duration-300 ease-out"
					style="width: {reverseGeocodingProgress}%"
				></div>
			</div>
			{#if reverseGeocodingStatus}
				<div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
					{reverseGeocodingStatus}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Action button -->
	{#if showButton && !activeReverseGeocodingJob}
		<div class="mt-3">
			<button
				on:click={startReverseGeocodingJob}
				disabled={isLoading || geocodingStats.missing === 0 || geocodingStats.percentage === 100}
				class="w-full rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if isLoading}
					<RefreshCw class="mr-2 inline h-4 w-4 animate-spin" />
					Starting...
				{:else if geocodingStats.missing === 0 || geocodingStats.percentage === 100}
					✅ All Points Geocoded
				{:else}
					Start Geocoding
				{/if}
			</button>
		</div>
	{/if}

	<!-- Additional stats -->
	{#if !activeReverseGeocodingJob && geocodingStats.total > 0}
		<div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
			{geocodingStats.percentage}% complete • {geocodingStats.missing.toLocaleString()} points remaining
		</div>
	{/if}
</div>