<script lang="ts">
	import { MapPin, RefreshCw } from 'lucide-svelte';
	import { onMount, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { SSEService, type JobUpdate } from '$lib/services/sse.service';
	import { sessionStore } from '$lib/stores/auth';

	// Props
	export let showProgress = true;
	export let showButton = true;

	// State
	interface ServiceJob {
		id: string;
		status: string;
		progress: number;
		error?: string | null;
		result?: Record<string, unknown>;
		created_at: string;
		updated_at: string;
	}

	interface GeocodingStatsResponse {
		total_points?: number;
		processed_count?: number;
		geocoded_count?: number;
		points_needing_geocoding?: number;
		retryable_errors?: number;
		non_retryable_errors?: number;
	}

	let activeReverseGeocodingJob: ServiceJob | null = null;
	let reverseGeocodingProgress = 0;
	let reverseGeocodingStatus = '';
	let sseService: SSEService | null = null;
	let geocodingStats: {
		total: number;
		geocoded: number;
		percentage: number;
		missing: number;
		pointsNeedingGeocoding: number;
		retryableErrors: number;
		nonRetryableErrors: number;
	} = {
		total: 0,
		geocoded: 0,
		percentage: 0,
		missing: 0,
		pointsNeedingGeocoding: 0,
		retryableErrors: 0,
		nonRetryableErrors: 0
	};
	let isLoading = false;
	let isInitializing = true;
	let isStatsLoading = false;
	let hasInitialized = false;
	let previousJobState: ServiceJob | null = null;

	onMount(async () => {
		await checkForActiveReverseGeocodingJob();
		// Load initial stats
		await loadGeocodingStats();
		hasInitialized = true;
		isInitializing = false;

		// Only start SSE monitoring if there's an active job
		if (activeReverseGeocodingJob) {
			startSSEMonitoring();
		}
	});

	onDestroy(() => {
		if (sseService) {
			sseService.disconnect();
		}
	});

	// Check for active reverse geocoding job on component mount
	async function checkForActiveReverseGeocodingJob() {
		try {
			const session = $sessionStore;
			if (!session) {
				return;
			}

			const serviceAdapter = new ServiceAdapter({ session });
			const jobs = (await serviceAdapter.getJobs({ type: 'reverse_geocoding_missing' })) as
				| ServiceJob[]
				| { jobs: ServiceJob[] };

			// Handle both array and paginated response formats
			let jobsData: ServiceJob[] = [];
			if (Array.isArray(jobs)) {
				jobsData = jobs;
			} else if (jobs.jobs) {
				jobsData = jobs.jobs;
			}

			const activeJobs = jobsData.filter(
				(job: ServiceJob) => job.status === 'queued' || job.status === 'running'
			);

			if (activeJobs.length > 0) {
				activeReverseGeocodingJob = activeJobs[0]; // Get the most recent active job
				updateReverseGeocodingProgressFromJob(activeReverseGeocodingJob);

				// Refresh statistics to show current state matching backend
				console.log('🔄 GeocodingProgress: Active job detected, refreshing stats to match backend');
				// Add a small delay to ensure cache is initialized by the job processor
				setTimeout(async () => {
					await loadGeocodingStatsFromAPI();
				}, 2000);
			}
		} catch (error) {
			console.error('Error checking for active reverse geocoding jobs:', error);
		}
	}

	function startSSEMonitoring() {
		// Only start SSE monitoring if there's an active job
		if (!activeReverseGeocodingJob) {
			return;
		}

		// Create SSE service for reverse geocoding job monitoring
		sseService = new SSEService(
			{
				onConnected: () => {},
				onDisconnected: () => {},
				onJobUpdate: (jobs: JobUpdate[]) => {
					console.log('📡 Geocoding job update received:', jobs);
					handleJobUpdates(jobs);
				},
				onJobCompleted: (jobs: JobUpdate[]) => {
					console.log('✅ Geocoding job completed:', jobs);
					handleJobUpdates(jobs);

					// Show completion toast
					jobs.forEach((job) => {
						if (job.status === 'completed') {
							toast.success('Reverse geocoding completed successfully!');
						} else if (job.status === 'failed') {
							toast.error(`Reverse geocoding failed: ${job.error || 'Unknown error'}`);
						}
					});
				},
				onError: (error: string) => {
					console.error('❌ Geocoding progress SSE error:', error);
				}
			},
			'reverse_geocoding_missing'
		);

		sseService.connect();
	}

	function handleJobUpdates(jobs: JobUpdate[]) {
		jobs.forEach((job) => {
			// Update active job if this is the one we're tracking
			if (activeReverseGeocodingJob && job.id === activeReverseGeocodingJob.id) {
				activeReverseGeocodingJob = {
					...activeReverseGeocodingJob,
					status: job.status,
					progress: job.progress,
					error: job.error,
					result: job.result,
					updated_at: job.updated_at
				};
				updateReverseGeocodingProgressFromJob(activeReverseGeocodingJob);
			} else if (
				!activeReverseGeocodingJob &&
				(job.status === 'queued' || job.status === 'running')
			) {
				// Set as active job if we don't have one
				activeReverseGeocodingJob = {
					id: job.id,
					status: job.status,
					progress: job.progress,
					error: job.error,
					result: job.result,
					created_at: job.created_at,
					updated_at: job.updated_at
				};
				updateReverseGeocodingProgressFromJob(activeReverseGeocodingJob);

				// Start SSE monitoring for this new job
				if (!sseService) {
					startSSEMonitoring();
				}
			}

			// Clear active job if it's completed or failed
			if (
				activeReverseGeocodingJob &&
				job.id === activeReverseGeocodingJob.id &&
				(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled')
			) {
				activeReverseGeocodingJob = null;
			}
		});
	}

	function updateReverseGeocodingProgressFromJob(job: ServiceJob) {
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
			isStatsLoading = true;
			const session = $sessionStore;
			if (!session) return;

			// Always use fresh API data instead of cached data

			await loadGeocodingStatsFromAPI();
			return;
		} catch (error) {
			console.error('Error loading geocoding stats:', error);
		} finally {
			isStatsLoading = false;
		}
	}

	// Fallback function to load stats from API
	async function loadGeocodingStatsFromAPI() {
		try {
			const session = $sessionStore;
			if (!session) return;

			const serviceAdapter = new ServiceAdapter({ session });

			// Force cache refresh by adding a timestamp parameter
			const stats = (await serviceAdapter.getGeocodingStats({
				forceRefresh: Date.now().toString()
			})) as GeocodingStatsResponse;

			console.log('📊 GeocodingProgress: API response:', stats);

			if (stats) {
				const total = stats.total_points || 0;
				const processed = stats.processed_count || stats.geocoded_count || 0; // Use processed_count if available, fallback to geocoded_count
				const pointsNeedingGeocoding = stats.points_needing_geocoding || 0;
				const retryableErrors = stats.retryable_errors || 0;
				const nonRetryableErrors = stats.non_retryable_errors || 0;

				console.log('📊 GeocodingProgress: Parsed stats:', {
					total,
					processed,
					pointsNeedingGeocoding,
					retryableErrors,
					nonRetryableErrors
				});

				// Calculate progress: processed points vs total points
				// This shows the real progress of processing, including both successful and failed geocoding
				const percentage = total > 0 ? (processed / total) * 100 : 0;

				geocodingStats = {
					total,
					geocoded: processed, // Show processed points (successful + failed)
					percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
					missing: pointsNeedingGeocoding,
					pointsNeedingGeocoding,
					retryableErrors,
					nonRetryableErrors
				};

				console.log('📊 GeocodingProgress: Final geocodingStats:', geocodingStats);

				// Force UI update by triggering reactivity
				geocodingStats = { ...geocodingStats };
			}
		} catch (error) {
			console.error('Error loading geocoding stats from API:', error);
		}
	}

	// Start reverse geocoding job
	async function startReverseGeocodingJob() {
		if (isLoading) return;

		isLoading = true;
		try {
			const session = $sessionStore;
			if (!session) {
				toast.error('Not authenticated');
				return;
			}

			const serviceAdapter = new ServiceAdapter({ session });
			const result = (await serviceAdapter.createJob({
				type: 'reverse_geocoding_missing',
				data: {}
			})) as ServiceJob;

			if (result && result.id) {
				activeReverseGeocodingJob = result;
				updateReverseGeocodingProgressFromJob(result);

				// Force refresh stats immediately after job starts
				console.log('🔄 GeocodingProgress: Job started, refreshing stats to match backend');
				// Add a small delay to ensure cache is initialized by the job processor
				setTimeout(async () => {
					await loadGeocodingStatsFromAPI();
				}, 2000);
			} else {
				toast.error('Failed to start reverse geocoding job');
			}
		} catch (error) {
			console.error('Error starting reverse geocoding job:', error);
			toast.error('Failed to start reverse geocoding job');
		} finally {
			isLoading = false;
		}
	}

	// Manual refresh function
	async function refreshStats() {
		console.log('🔄 GeocodingProgress: Manual refresh requested');
		// Force refresh the cache via API first, then load stats
		await refreshStatsFromAPI();
		await loadGeocodingStatsFromAPI();
	}

	// Force refresh cache via API
	async function refreshStatsFromAPI() {
		try {
			const session = $sessionStore;
			if (!session) return;

			const serviceAdapter = new ServiceAdapter({ session });
			// Call the statistics API to force cache refresh
			await serviceAdapter.getGeocodingStats();
			console.log('🔄 GeocodingProgress: Forced cache refresh via API');
		} catch (error) {
			console.error('Error refreshing cache via API:', error);
		}
	}

	// Watch for job state changes and update stats when needed
	$effect(() => {
		if (
			activeReverseGeocodingJob !== previousJobState &&
			!isInitializing &&
			!isStatsLoading &&
			hasInitialized
		) {
			console.log('🔄 GeocodingProgress: Job state changed, ensuring stats are up to date');
			previousJobState = activeReverseGeocodingJob;

			// Only refresh if job was cleared (completed/failed)
			if (activeReverseGeocodingJob === null) {
				// Force refresh stats when job completes to get updated cache
				// Use setTimeout to break the reactive cycle
				setTimeout(() => {
					loadGeocodingStats();
					// Also trigger a cache refresh via the statistics API to ensure consistency
					refreshStatsFromAPI();
				}, 0);
			}
		}
	});
</script>

<div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
	<div class="flex items-center gap-2">
		<MapPin class="h-5 w-5 text-blue-500" />
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Geocoding Progress</span>
		<button
			onclick={refreshStats}
			class="ml-auto rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
			title="Refresh stats"
		>
			<RefreshCw class="h-4 w-4" />
		</button>
	</div>

	<div class="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
		{#if isStatsLoading}
			<div class="flex items-center gap-2">
				<RefreshCw class="h-5 w-5 animate-spin text-blue-500" />
				<span class="text-gray-500">Loading...</span>
			</div>
		{:else if activeReverseGeocodingJob}
			{reverseGeocodingProgress}%
		{:else}
			{geocodingStats.geocoded?.toLocaleString() ?? 0} / {geocodingStats.total?.toLocaleString() ??
				0}
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
				onclick={startReverseGeocodingJob}
				disabled={isLoading || geocodingStats.geocoded >= geocodingStats.total}
				class="w-full rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if isLoading}
					<RefreshCw class="mr-2 inline h-4 w-4 animate-spin" />
					Starting...
				{:else if geocodingStats.geocoded >= geocodingStats.total}
					✅ All Points Geocoded
				{:else}
					Start Geocoding
				{/if}
			</button>
		</div>
	{/if}

	<!-- Additional stats -->
	{#if !activeReverseGeocodingJob && !isStatsLoading && geocodingStats.total > 0}
		<div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
			{geocodingStats.percentage}% complete • {geocodingStats.pointsNeedingGeocoding?.toLocaleString() ??
				0} points need geocoding
			{#if geocodingStats.retryableErrors > 0 || geocodingStats.nonRetryableErrors > 0}
				• {geocodingStats.retryableErrors?.toLocaleString() ?? 0} retryable errors • {geocodingStats.nonRetryableErrors?.toLocaleString() ??
					0} permanent errors
			{/if}
		</div>
	{:else if isStatsLoading}
		<div class="mt-2 text-xs text-gray-500 dark:text-gray-400">Loading geocoding statistics...</div>
	{/if}
</div>
