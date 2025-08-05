<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Download, Clock, CheckCircle, XCircle, AlertCircle, Check } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/core/supabase/client';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { sessionStore } from '$lib/stores/auth';
	import { get } from 'svelte/store';
	import { SSEService, type JobUpdate } from '$lib/services/sse.service';

	interface ExportJob {
		id: string;
		status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
		type: string;
		progress: number;
		data?: {
			format: string;
			includeLocationData: boolean;
			includeTripInfo: boolean;
			includeWantToVisit: boolean;
			includeTrips: boolean;
			dateRange?: string;
			startDate?: string;
			endDate?: string;
		};
		result?: {
			file_path?: string;
			file_size?: number;
		};
		error?: string;
		created_at: string;
		updated_at: string;
		started_at?: string;
		completed_at?: string;
	}

	let exportJobs = $state<ExportJob[]>([]);
	let filteredExportJobs = $state<ExportJob[]>([]);
	let loading = $state(true);
	let sseService = $state<SSEService | null>(null);

	onMount(async () => {
		// Small delay to ensure session is available
		setTimeout(async () => {
			await loadExportJobs();
			// Only start SSE monitoring if there are active export jobs
			const hasActiveJobs = exportJobs.some(job =>
				job.status === 'queued' || job.status === 'running'
			);
			if (hasActiveJobs) {

				startSSEMonitoring();
			} else {

			}
		}, 100);
	});

	onDestroy(() => {
		if (sseService) {
			sseService.disconnect();
		}
	});

	async function loadExportJobs() {
		try {
			const session = get(sessionStore);
			if (!session) {
				console.warn('No session available for loading export jobs');
				return;
			}

			const serviceAdapter = new ServiceAdapter({ session });
			const result = await serviceAdapter.getExportJobs() as any;

			// The service adapter returns the data directly, not wrapped in a success object
			if (Array.isArray(result)) {
				exportJobs = result;
				updateFilteredJobs();
			} else {
				console.error('Failed to load export jobs: Invalid response format', result);
			}
		} catch (error) {
			console.error('Error loading export jobs:', error);
		} finally {
			loading = false;
		}
	}

	// Expose the function for external use
	export { loadExportJobs };

	function updateFilteredJobs() {
		// Filter: only last 7 days, then take 5 most recent
		const now = new Date();
		filteredExportJobs = exportJobs
			.filter(job => {
				const created = new Date(job.created_at);
				return (now.getTime() - created.getTime()) <= 7 * 24 * 60 * 60 * 1000;
			})
			.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
			.slice(0, 5);
	}

	function startSSEMonitoring() {
		// Create SSE service for export job monitoring
		sseService = new SSEService({
			onConnected: () => {

			},
			onDisconnected: () => {

			},
			onJobUpdate: (jobs: JobUpdate[]) => {
				console.log('📡 Export jobs update received:', jobs);
				updateJobsFromSSE(jobs);
			},
			onJobCompleted: (jobs: JobUpdate[]) => {
				console.log('✅ Export jobs completed:', jobs);
				updateJobsFromSSE(jobs);

				// Don't show toasts here - the parent page handles them
			},
			onError: (error: string) => {
				console.error('❌ Export jobs SSE error:', error);
				toast.error(`Export monitoring error: ${error}`);
			}
		}, 'data_export');

		sseService.connect();
	}

	function updateJobsFromSSE(jobs: JobUpdate[]) {
		jobs.forEach(update => {
			const existingJobIndex = exportJobs.findIndex(job => job.id === update.id);

			if (existingJobIndex >= 0) {
				// Update existing job
				exportJobs[existingJobIndex] = {
					...exportJobs[existingJobIndex],
					status: update.status as any,
					progress: update.progress,
					error: update.error,
					result: update.result,
					updated_at: update.updated_at
				};
			} else {
				// Add new job
				exportJobs.push({
					id: update.id,
					status: update.status as any,
					type: update.type,
					progress: update.progress,
					error: update.error,
					result: update.result,
					created_at: update.created_at,
					updated_at: update.updated_at
				});
			}
		});

		updateFilteredJobs();

		// Check if we need to start SSE monitoring for new active jobs
		const hasActiveJobs = exportJobs.some(job =>
			job.status === 'queued' || job.status === 'running'
		);
		if (hasActiveJobs && !sseService) {
			console.log('🔄 New active export jobs detected, starting SSE monitoring');
			startSSEMonitoring();
		} else if (!hasActiveJobs && sseService) {
			console.log('🔄 No active export jobs, disconnecting SSE');
			sseService.disconnect();
			sseService = null;
		}
	}

	async function downloadExport(jobId: string) {
		try {
			const session = get(sessionStore);
			if (!session) {
				toast.error('No session available');
				return;
			}

			const serviceAdapter = new ServiceAdapter({ session });
			const result = await serviceAdapter.getExportDownloadUrl(jobId) as any;

			// The service adapter returns the data directly, not wrapped in a success object
			if (result && result.downloadUrl) {
				window.open(result.downloadUrl, '_blank');
			} else {
				console.error('Download URL not available:', result);
				toast.error('Download URL not available');
			}
		} catch (error) {
			console.error('Error downloading export:', error);
			toast.error('Failed to download export');
		}
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'completed':
				return CheckCircle;
			case 'running':
				return Clock;
			case 'failed':
				return XCircle;
			case 'cancelled':
				return XCircle;
			default:
				return AlertCircle;
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'completed':
				return 'text-green-600 dark:text-green-400';
			case 'failed':
				return 'text-red-600 dark:text-red-400';
			case 'cancelled':
				return 'text-yellow-600 dark:text-yellow-400';
			case 'running':
				return 'text-blue-600 dark:text-blue-400';
			case 'queued':
				return 'text-gray-600 dark:text-gray-400';
			default:
				return 'text-gray-600 dark:text-gray-400';
		}
	}

	function formatFileSize(bytes?: number): string {
		if (!bytes) return 'Unknown';
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleString();
	}

	function getTimeUntilExpiry(expiresAt: string): string {
		const now = new Date();
		const expiry = new Date(expiresAt);
		const diff = expiry.getTime() - now.getTime();

		if (diff <= 0) return 'Expired';

		const days = Math.floor(diff / (1000 * 60 * 60 * 24));
		const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

		if (days > 0) return `${days}d ${hours}h remaining`;
		return `${hours}h remaining`;
	}

	function getFormatLabel(format: string): string {
		if (format === 'GeoJSON' || format === 'GPX' || format === 'OwnTracks') return format;
		return 'JSON';
	}

	function getExpiryDate(job: ExportJob): Date {
		return new Date(new Date(job.created_at).getTime() + 7 * 24 * 60 * 60 * 1000);
	}

	function formatDateRange(job: ExportJob): string {
		if (!job.data?.startDate || !job.data?.endDate) {
			return 'All data';
		}

		const startDate = new Date(job.data.startDate);
		const endDate = new Date(job.data.endDate);

		// Format dates as YYYY-MM-DD
		const startFormatted = startDate.toISOString().split('T')[0];
		const endFormatted = endDate.toISOString().split('T')[0];

		return `${startFormatted} to ${endFormatted}`;
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Export History</h3>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-8">
			<div class="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600"></div>
		</div>
	{:else if filteredExportJobs.length === 0}
		<div class="py-8 text-center text-gray-500 dark:text-gray-400">
			<p>No export jobs found</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each filteredExportJobs as job}
				<div
					class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
				>
					<div class="mb-3 flex items-center justify-between">
						<div class="flex items-center gap-3">
							<!-- Status icon -->
							<div class="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
								<Check class="h-4 w-4 text-green-600 dark:text-green-400" />
							</div>

							<!-- Job info -->
							<div class="flex-1">
								<h4 class="font-medium text-gray-900 dark:text-gray-100">
									Created: {formatDate(job.created_at)}
								</h4>
								<div class="text-xs text-gray-500 dark:text-gray-400">
									Date range: {formatDateRange(job)}
								</div>
								{#if job.status === 'completed'}
									<div class="text-xs text-gray-500 dark:text-gray-400">
										{#if getExpiryDate(job) > new Date()}
											Link valid until: {formatDate(getExpiryDate(job).toISOString())}
										{:else}
											Link expired
										{/if}
									</div>
								{/if}
							</div>
						</div>

						<!-- Download button -->
						{#if job.status === 'completed' && getExpiryDate(job) > new Date()}
							<button
								on:click={() => downloadExport(job.id)}
								class="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
							>
								<Download class="h-4 w-4" />
								Download
							</button>
						{/if}
					</div>

					<!-- Progress bar for running jobs -->
					{#if job.status === 'running' || job.status === 'queued'}
						<div class="mb-3">
							<div class="mb-1 flex justify-between text-sm text-gray-600 dark:text-gray-400">
								<span>Progress</span>
								<span>{job.progress}%</span>
							</div>
							<div class="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
								<div
									class="h-2 rounded-full bg-blue-600 transition-all duration-300"
									style="width: {job.progress}%"
								></div>
							</div>
						</div>
					{/if}

					<!-- Export options -->
					{#if job.data}
						<div class="mb-3">
							<div class="flex flex-wrap gap-2">
								{#if job.data.includeLocationData}
									<span
										class="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200"
									>
										Location data
									</span>
								{/if}
								{#if job.data.includeTripInfo}
									<span
										class="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs text-green-800 dark:bg-green-900 dark:text-green-200"
									>
										Trip info
									</span>
								{/if}
								{#if job.data.includeWantToVisit}
									<span
										class="inline-flex items-center rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-800 dark:bg-purple-900 dark:text-purple-200"
									>
										Want to visit
									</span>
								{/if}
								{#if job.data.includeTrips}
									<span
										class="inline-flex items-center rounded-full bg-orange-100 px-2 py-1 text-xs text-orange-800 dark:bg-orange-900 dark:text-orange-200"
									>
										Trips
									</span>
								{/if}
								{#if job.data.format}
									<span
										class="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200"
									>
										{getFormatLabel(job.data.format)}
									</span>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Error message -->
					{#if job.error}
						<div
							class="mb-3 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20"
						>
							<p class="text-sm text-red-700 dark:text-red-300">{job.error}</p>
						</div>
					{/if}

					<!-- Result info -->
					{#if job.result && job.status === 'completed'}
						<div class="mb-3 text-sm text-gray-600 dark:text-gray-400">
							{#if job.result.file_size}
								<span class="mr-4">Size: {formatFileSize(job.result.file_size)}</span>
							{/if}
							{#if job.completed_at}
								<span>Completed: {formatDate(job.completed_at)}</span>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
