<script lang="ts">
	import { onMount } from 'svelte';
	import { Download, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	interface ExportJob {
		id: string;
		status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
		format: string;
		include_location_data: boolean;
		include_trip_info: boolean;
		include_want_to_visit: boolean;
		include_trips: boolean;
		file_path?: string;
		file_size?: number;
		expires_at: string;
		progress: number;
		result?: Record<string, unknown>;
		error?: string;
		created_at: string;
		updated_at: string;
		started_at?: string;
		completed_at?: string;
	}

	let exportJobs: ExportJob[] = [];
	let loading = true;
	let pollingInterval: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		loadExportJobs();
		startPolling();
	});

	onMount(() => {
		return () => {
			if (pollingInterval) {
				clearInterval(pollingInterval);
			}
		};
	});

	async function loadExportJobs() {
		try {
			const response = await fetch('/api/v1/export');
			const result = await response.json();

			if (result.success) {
				exportJobs = result.data;
			} else {
				console.error('Failed to load export jobs:', result.message);
			}
		} catch (error) {
			console.error('Error loading export jobs:', error);
		} finally {
			loading = false;
		}
	}

	function startPolling() {
		pollingInterval = setInterval(() => {
			// Only poll if there are active jobs
			const hasActiveJobs = exportJobs.some(
				(job) => job.status === 'queued' || job.status === 'running'
			);
			if (hasActiveJobs) {
				loadExportJobs();
			}
		}, 5000); // Poll every 5 seconds
	}

	async function downloadExport(jobId: string) {
		try {
			window.open(`/api/v1/export/${jobId}/download`, '_blank');
		} catch (error) {
			console.error('Download error:', error);
			toast.error('Failed to download export', {
				description: error instanceof Error ? error.message : 'Unknown error occurred'
			});
		}
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'completed':
				return CheckCircle;
			case 'failed':
				return XCircle;
			case 'cancelled':
				return AlertCircle;
			case 'running':
			case 'queued':
				return Clock;
			default:
				return Clock;
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
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Export History</h3>
		<button
			on:click={loadExportJobs}
			disabled={loading}
			class="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
		>
			Refresh
		</button>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-8">
			<div class="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600"></div>
		</div>
	{:else if exportJobs.length === 0}
		<div class="py-8 text-center text-gray-500 dark:text-gray-400">
			<p>No export jobs found</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each exportJobs as job}
				<div
					class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
				>
					<div class="mb-3 flex items-center justify-between">
						<div class="flex items-center gap-3">
							<svelte:component
								this={getStatusIcon(job.status)}
								class="h-5 w-5 {getStatusColor(job.status)}"
							/>
							<div>
								<h4 class="font-medium text-gray-900 dark:text-gray-100">
									Export ({job.format})
								</h4>
								<p class="text-sm text-gray-500 dark:text-gray-400">
									Created: {formatDate(job.created_at)}
								</p>
							</div>
						</div>
						<div class="text-right">
							<div class="text-sm font-medium text-gray-900 capitalize dark:text-gray-100">
								{job.status}
							</div>
							{#if job.status === 'completed' && job.expires_at}
								<div class="text-xs text-gray-500 dark:text-gray-400">
									{getTimeUntilExpiry(job.expires_at)}
								</div>
							{/if}
						</div>
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
					<div class="mb-3">
						<div class="mb-1 text-sm text-gray-600 dark:text-gray-400">Included data:</div>
						<div class="flex flex-wrap gap-2">
							{#if job.include_location_data}
								<span
									class="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200"
								>
									Location data
								</span>
							{/if}
							{#if job.include_trip_info}
								<span
									class="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs text-green-800 dark:bg-green-900 dark:text-green-200"
								>
									Trip info
								</span>
							{/if}
							{#if job.include_want_to_visit}
								<span
									class="inline-flex items-center rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-800 dark:bg-purple-900 dark:text-purple-200"
								>
									Want to visit
								</span>
							{/if}
							{#if job.include_trips}
								<span
									class="inline-flex items-center rounded-full bg-orange-100 px-2 py-1 text-xs text-orange-800 dark:bg-orange-900 dark:text-orange-200"
								>
									Trips
								</span>
							{/if}
						</div>
					</div>

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
							{#if job.result.totalFiles}
								<span class="mr-4">Files: {job.result.totalFiles}</span>
							{/if}
							{#if job.file_size}
								<span class="mr-4">Size: {formatFileSize(job.file_size)}</span>
							{/if}
							{#if job.result.exportedAt}
								<span>Exported: {formatDate(job.result.exportedAt as string)}</span>
							{/if}
						</div>
					{/if}

					<!-- Download button -->
					{#if job.status === 'completed' && job.file_path}
						<div class="flex justify-end">
							<button
								on:click={() => downloadExport(job.id)}
								class="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
							>
								<Download class="h-4 w-4" />
								Download
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
