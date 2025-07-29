<script lang="ts">
	import {
		Import,
		FileDown,
		MapPin,
		Route,
		Upload,
	} from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { onMount, onDestroy } from 'svelte';
	import { tick } from 'svelte';
	import { writable } from 'svelte/store';
	import { sessionStore } from '$lib/stores/auth';
	import { get } from 'svelte/store';
	import type { Job } from '$lib/types/job-queue.types';
	import ExportJobs from '$lib/components/ExportJobs.svelte';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { createClient } from '@supabase/supabase-js';
	import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
	import { DatePicker } from '@svelte-plugins/datepicker';
	import { format } from 'date-fns';

	// Import state
	let importFormat: string | null = null;
	let selectedFile: File | null = null;
	let includeLocationData = true;
	let includeTripInfo = true;
	let includeWantToVisit = true;
	let includeTrips = true;
	const isImporting = writable(false);
	let fileInputEl: HTMLInputElement | null = null;

	// Export state
	let exportFormat = 'JSON';
	let exportStartDate: Date | null = null;
	let exportEndDate: Date | null = null;
	let isExportDatePickerOpen = false;
	let includeLocationDataExport = true;
	let includeTripInfoExport = true;
	let includeWantToVisitExport = true;
	let includeTripsExport = true;

	// Progress tracking - simplified
	let activeImportJob: Job | null = null;
	let activeExportJob: Job | null = null;
	let pollingInterval: ReturnType<typeof setInterval> | null = null;
	let backgroundCheckInterval: ReturnType<typeof setInterval> | null = null;
	let importJobNotified = false;
	let exportJobNotified = false;

	const importFormats = [
		{
			value: 'GeoJSON',
			label: 'GeoJSON',
			icon: MapPin,
			description: 'Geographic data in JSON format'
		},
		{ value: 'GPX', label: 'GPX', icon: Route, description: 'GPS Exchange Format' },
		{
			value: 'OwnTracks',
			label: 'OwnTracks (.REC)',
			icon: Route,
			description: 'OwnTracks recording files'
		}
	];

	function getAcceptedFileTypes(format: string): string {
		switch (format) {
			case 'GeoJSON':
				return '.geojson,.json';
			case 'GPX':
				return '.gpx';
			case 'OwnTracks':
				return '.rec';
			default:
				return '*';
		}
	}

	function getFormatDescription(format: string): string {
		const formatInfo = importFormats.find((f) => f.value === format);
		return formatInfo?.description || '';
	}

	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			selectedFile = target.files[0];
			// Auto-detect format
			detectImportFormat(selectedFile).then((detected) => {
				importFormat = detected;
			});
		}
	}

	async function detectImportFormat(file: File): Promise<string> {
		const name = file.name.toLowerCase();
		if (name.endsWith('.geojson') || name.endsWith('.json')) return 'GeoJSON';
		if (name.endsWith('.gpx')) return 'GPX';
		if (name.endsWith('.rec')) return 'OwnTracks';
		return 'GeoJSON'; // Default
	}

	// Date range helper functions
	function toggleExportDatePicker() {
		isExportDatePickerOpen = !isExportDatePickerOpen;
	}

	function closeExportDatePicker() {
		isExportDatePickerOpen = false;
	}

	$: formattedExportStartDate = exportStartDate ? format(exportStartDate, 'MMM dd, yyyy') : '';
	$: formattedExportEndDate = exportEndDate ? format(exportEndDate, 'MMM dd, yyyy') : '';

	// Simple progress tracking functions
	async function checkForActiveJobs() {
		try {
			const session = get(sessionStore);
			if (!session) return;

			const serviceAdapter = new ServiceAdapter({ session });

			// Check for active import jobs
			const importJobsResponse = await serviceAdapter.getJobs({ type: 'data_import' }) as any;
			const importJobs = Array.isArray(importJobsResponse) ? importJobsResponse :
							  (importJobsResponse?.data || []);

			console.log('🔍 All import jobs:', importJobs);

			const activeImport = importJobs.find((job: Job) =>
				(job.status === 'queued' && job.progress < 100) ||
				(job.status === 'running')
			);

			// Also check for recently completed jobs (within last 5 minutes)
			const recentCompletedImport = importJobs.find((job: Job) => {
				if (job.status !== 'completed') return false;
				const completedAt = job.completed_at ? new Date(job.completed_at).getTime() : 0;
				const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
				return completedAt > fiveMinutesAgo;
			});

			if (activeImport && !activeImportJob) {
				console.log('🚀 Found active import job:', activeImport);
				console.log('🔍 Full job object:', JSON.stringify(activeImport, null, 2));
				activeImportJob = activeImport;
				importJobNotified = false; // Reset notification flag for new job
				isImporting.set(true);
				startPolling();
			} else if (recentCompletedImport && !activeImportJob) {
				console.log('✅ Found recently completed import job:', recentCompletedImport);
				// Don't set activeImportJob for completed jobs - just show notification
				isImporting.set(false); // Ensure import button is enabled for completed jobs
				// Don't start polling for completed jobs
				if (!importJobNotified) {
					toast.success('Import completed successfully!', {
						description: 'Your file has been processed and imported.'
					});
					importJobNotified = true;
				}
			} else if (!activeImport && !recentCompletedImport && activeImportJob) {
				// No active or recent import jobs found, reset state
				console.log('🔄 No active import jobs found, resetting state');
				activeImportJob = null;
				importJobNotified = false; // Reset notification flag
				isImporting.set(false);
			}

			// Check for active export jobs
			const exportJobsResponse = await serviceAdapter.getJobs({ type: 'data_export' }) as any;
			const exportJobs = Array.isArray(exportJobsResponse) ? exportJobsResponse :
							  (exportJobsResponse?.data || []);

			const activeExport = exportJobs.find((job: Job) =>
				(job.status === 'queued' && job.progress < 100) ||
				(job.status === 'running')
			);

			// Also check for recently completed jobs (within last 5 minutes)
			const recentCompletedExport = exportJobs.find((job: Job) => {
				if (job.status !== 'completed') return false;
				const completedAt = job.completed_at ? new Date(job.completed_at).getTime() : 0;
				const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
				return completedAt > fiveMinutesAgo;
			});

			if (activeExport && !activeExportJob) {
				console.log('🚀 Found active export job:', activeExport);
				activeExportJob = activeExport;
				exportJobNotified = false; // Reset notification flag for new job
				startPolling();
			} else if (recentCompletedExport && !activeExportJob) {
				console.log('✅ Found recently completed export job:', recentCompletedExport);
				// Don't set activeExportJob for completed jobs - just show notification
				// Don't start polling for completed jobs
				if (!exportJobNotified) {
					toast.success('Export completed successfully!', {
						description: 'Your data has been exported and is ready for download.'
					});
					exportJobNotified = true;
				}
			}

			// If we found any active jobs, ensure polling is running
			if ((activeImport || activeExport) && !pollingInterval) {
				console.log('🔄 Starting polling for active jobs');
				startPolling();
			}
		} catch (error) {
			console.error('❌ Error checking for active jobs:', error);
		}
	}

	function startPolling() {
		if (pollingInterval) {
			clearInterval(pollingInterval);
		}

		pollingInterval = setInterval(async () => {
			await updateJobProgress();
		}, 2000);
	}

	function startBackgroundChecking() {
		if (backgroundCheckInterval) {
			clearInterval(backgroundCheckInterval);
		}

		// Check for new jobs every 10 seconds
		backgroundCheckInterval = setInterval(async () => {
			await checkForActiveJobs();
		}, 10000);
	}

	// Update job progress
	async function updateJobProgress() {
		try {
			const session = get(sessionStore);
			if (!session) {
				return;
			}

			const serviceAdapter = new ServiceAdapter({ session });
			let hasActiveJobs = false;

			// Update import job progress
			if (activeImportJob && activeImportJob.id) {
				console.log('🔄 Polling import job:', activeImportJob.id);
				let job: Job | null = null;

				try {
					const jobData = await serviceAdapter.getJobProgress(activeImportJob.id) as any;
					console.log('🔍 Raw job progress response:', jobData);

					// Handle different response structures
					if (jobData.success && jobData.data) {
						// Standard API response format
						job = jobData.data;
					} else if (jobData.id) {
						// Direct job object
						job = jobData;
					} else {
						// Fallback
						job = jobData.data || jobData;
					}

					console.log('🔍 Processed job object:', job);
				} catch (error) {
					console.error('❌ Error polling import job:', error);
					// If there's an error, try to get the job from the database directly
					try {
						const jobsResponse = await serviceAdapter.getJobs({ type: 'data_import' }) as any;
						const jobs = Array.isArray(jobsResponse) ? jobsResponse : (jobsResponse?.data || []);
						const currentJob = jobs.find((j: Job) => j.id === activeImportJob?.id);
						if (currentJob) {
							console.log('🔍 Found job in jobs list:', currentJob);
							activeImportJob = currentJob;
							job = currentJob;
						}
					} catch (fallbackError) {
						console.error('❌ Error in fallback job lookup:', fallbackError);
					}
					return;
				}

				if (job) {
					activeImportJob = job;
					hasActiveJobs = true;

					if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled' || (job.progress === 100 && job.status === 'queued')) {
						console.log('✅ Import job finished:', job.status);
						activeImportJob = null;
						isImporting.set(false);

						if ((job.status === 'completed' || (job.progress === 100 && job.status === 'queued')) && !importJobNotified) {
							toast.success('Import completed successfully!');
							importJobNotified = true;
						} else if (job.status === 'failed') {
							toast.error('Import failed', {
								description: job.error || 'Unknown error occurred'
							});
						}
					} else {
						// Job is still active, update the display
						activeImportJob = job;
					}
				}
			}

			// Update export job progress
			if (activeExportJob && activeExportJob.id) {
				console.log('🔄 Polling export job:', activeExportJob.id);
				let job: Job | null = null;

				try {
					const jobData = await serviceAdapter.getJobProgress(activeExportJob.id) as any;
					console.log('🔍 Raw job progress response:', jobData);

					// Handle different response structures
					if (jobData.success && jobData.data) {
						// Standard API response format
						job = jobData.data;
					} else if (jobData.id) {
						// Direct job object
						job = jobData;
					} else {
						// Fallback
						job = jobData.data || jobData;
					}

					console.log('🔍 Processed job object:', job);
				} catch (error) {
					console.error('❌ Error polling export job:', error);
					// If there's an error, try to get the job from the database directly
					try {
						const jobsResponse = await serviceAdapter.getJobs({ type: 'data_export' }) as any;
						const jobs = Array.isArray(jobsResponse) ? jobsResponse : (jobsResponse?.data || []);
						const currentJob = jobs.find((j: Job) => j.id === activeExportJob?.id);
						if (currentJob) {
							console.log('🔍 Found job in jobs list:', currentJob);
							activeExportJob = currentJob;
							job = currentJob;
						}
					} catch (fallbackError) {
						console.error('❌ Error in fallback job lookup:', fallbackError);
					}
					return;
				}

				if (job) {
					activeExportJob = job;
					hasActiveJobs = true;

					if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled' || (job.progress === 100 && job.status === 'queued')) {
						console.log('✅ Export job finished:', job.status);
						activeExportJob = null;

						if ((job.status === 'completed' || (job.progress === 100 && job.status === 'queued')) && !exportJobNotified) {
							toast.success('Export completed successfully!');
							exportJobNotified = true;
						} else if (job.status === 'failed') {
							toast.error('Export failed', {
								description: job.error || 'Unknown error occurred'
							});
						}
									} else {
					// Job is still active, update the display
					activeExportJob = job;
				}
			}
		}

		// Check for new active jobs (but don't restart polling if we already have active jobs)
		if (!hasActiveJobs) {
			await checkForActiveJobs();
		}

		// Stop polling if no active jobs
		if (!hasActiveJobs && !activeImportJob && !activeExportJob && pollingInterval) {
			clearInterval(pollingInterval);
			pollingInterval = null;
		}
	} catch (error) {
		console.error('❌ Error updating job progress:', error);
	}
}

	// Import functions
	async function handleImport() {
		if (!selectedFile || !importFormat) {
			toast.error('Please select a file and format');
			return;
		}

		try {
			isImporting.set(true);
			const session = get(sessionStore);
			if (!session) {
				toast.error('Not authenticated');
				return;
			}

			const serviceAdapter = new ServiceAdapter({ session });

			// Create import job
			const result = await serviceAdapter.createImportJob(selectedFile, importFormat);

			if (result.jobId) {
				console.log('🚀 Import job created:', result.jobId);

				// Set the active job and start polling
				activeImportJob = {
					id: result.jobId,
					type: 'data_import',
					status: 'queued',
					progress: 0,
					data: {
						fileName: selectedFile.name,
						format: importFormat
					},
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					created_by: session.user.id,
					priority: 'normal'
				} as Job;

				importJobNotified = false; // Reset notification flag for new job
				startPolling();

				// Trigger immediate progress update
				await tick();

				// Get initial job status immediately
				await updateJobProgress();

				toast.success('Import job created successfully!', {
					description: 'Your file is being processed. You can track progress below.'
				});
			} else {
				toast.error('Failed to create import job', {
					description: 'Unknown error occurred'
				});
			}
		} catch (error) {
			console.error('Import error:', error);
			toast.error('Failed to create import job', {
				description: error instanceof Error ? error.message : 'Unknown error occurred'
			});
		} finally {
			isImporting.set(false);
		}
	}

	// Export functions
	async function handleExport() {
		if (!exportStartDate || !exportEndDate) {
			toast.error('Please select start and end dates');
			return;
		}

		// Convert Date objects to ISO strings for the API
		const startDateStr = exportStartDate.toISOString().split('T')[0];
		const endDateStr = exportEndDate.toISOString().split('T')[0];

		try {
			const session = get(sessionStore);
			if (!session) {
				toast.error('Not authenticated');
				return;
			}

			const serviceAdapter = new ServiceAdapter({ session });

			// Create export job
			const result = await serviceAdapter.createExportJob({
				startDate: startDateStr,
				endDate: endDateStr,
				format: exportFormat,
				options: {
					includeLocationData: includeLocationDataExport,
					includeTripInfo: includeTripInfoExport,
					includeWantToVisit: includeWantToVisitExport,
					includeTrips: includeTripsExport
				}
			}) as any;

			if (result.success && result.data?.jobId) {
				console.log('🚀 Export job created:', result.data.jobId);

				// Set the active job and start polling
				activeExportJob = {
					id: result.data.jobId,
					type: 'data_export',
					status: 'queued',
					progress: 0,
					data: {
						format: exportFormat,
						startDate: exportStartDate,
						endDate: exportEndDate
					},
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					created_by: session.user.id,
					priority: 'normal'
				} as Job;

				exportJobNotified = false; // Reset notification flag for new job
				startPolling();

				toast.success('Export job created successfully!', {
					description: 'Your export is being processed. You can track progress below.'
				});
			} else {
				toast.error('Failed to create export job', {
					description: result.message || 'Unknown error occurred'
				});
			}
		} catch (error) {
			console.error('Export error:', error);
			toast.error('Failed to create export job', {
				description: error instanceof Error ? error.message : 'Unknown error occurred'
			});
		}
	}

	// Lifecycle
	onMount(async () => {
		await checkForActiveJobs();
		startBackgroundChecking();
	});

	onDestroy(() => {
		if (pollingInterval) {
			clearInterval(pollingInterval);
		}
		if (backgroundCheckInterval) {
			clearInterval(backgroundCheckInterval);
		}
	});

	// Helper functions for UI
	function getJobFileName(job: Job | null): string {
		if (!job) return 'Unknown file';
		console.log('🔍 Job data for filename:', job.data);
		if (job.data?.fileName) return job.data.fileName as string;
		if (job.data?.original_filename) return job.data.original_filename as string;
		if (job.data?.filename) return job.data.filename as string;
		return 'Unknown file';
	}

	function getJobStatus(job: Job | null): string {
		if (!job) return 'Unknown';
		console.log('🔍 Job status:', job.status, 'Job result:', job.result);

		// Check for detailed status from job result
		if (job.result?.status) return job.result.status as string;
		if (job.result?.message) return job.result.message as string;

		// Check for processing details
		if (job.result?.processedCount && job.result?.totalCount) {
			return `Processing ${job.result.processedCount} of ${job.result.totalCount} items...`;
		}

		// Handle case where job is completed but status wasn't updated
		if (job.progress === 100 && job.status === 'queued') {
			return 'Completed';
		}

		// Basic status mapping
		if (job.status === 'queued') return 'Queued for processing...';
		if (job.status === 'running') return 'Processing...';
		if (job.status === 'completed') return 'Completed';
		if (job.status === 'failed') return 'Failed';
		if (job.status === 'cancelled') return 'Cancelled';

		return job.status || 'Unknown';
	}

	function getJobProgress(job: Job | null): number {
		if (!job) return 0;
		return job.progress || 0;
	}

			function getJobETA(job: Job | null): string | null {
		if (!job) return null;

		// Check various possible ETA fields in the result
		const etaValue = job.result?.eta || job.result?.estimatedTimeRemaining || job.result?.timeRemaining;

		if (etaValue) {
			// Handle the case where ETA is stored as "1024s" format
			if (typeof etaValue === 'string' && etaValue.endsWith('s')) {
				const seconds = parseInt(etaValue);
				if (!isNaN(seconds)) {
					return formatTime(seconds);
				}
			}

			// If it's just a number (seconds), format it
			if (!isNaN(Number(etaValue))) {
				return formatTime(Number(etaValue));
			}
			return etaValue as string;
		}

		// Calculate ETA based on progress
		if (job.progress && job.progress > 0 && job.progress < 100 && job.started_at) {
			const elapsed = (Date.now() - new Date(job.started_at).getTime()) / 1000;
			const estimatedTotal = elapsed / (job.progress / 100);
			const remaining = estimatedTotal - elapsed;
			if (remaining > 0) {
				return `${formatTime(remaining)} remaining`;
			}
		}
		return null;
	}

	function formatTime(seconds: number): string {
		if (seconds < 60) {
			return `${Math.round(seconds)}s`;
		} else if (seconds < 3600) {
			const mins = Math.floor(seconds / 60);
			const secs = Math.round(seconds % 60);
			return `${mins}m ${secs}s`;
		} else {
			const hours = Math.floor(seconds / 3600);
			const mins = Math.floor((seconds % 3600) / 60);
			const secs = Math.round(seconds % 60);
			return `${hours}h ${mins}m ${secs}s`;
		}
	}
</script>

<div>
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<Import class="h-8 w-8 text-blue-600 dark:text-gray-400" />
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
				Import/Export
			</h1>
		</div>
	</div>



	<!-- Active Import Job Progress Display -->
	{#if activeImportJob}
		<div class="mb-8">
			<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">Active Import Job</h2>
			<div
				class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
			>
				<div class="mb-3 flex items-center justify-between">
					<div class="flex items-center gap-3">
						<div class="rounded-lg bg-blue-50 p-2 dark:bg-blue-900/20">
							<Upload class="h-5 w-5 text-blue-600 dark:text-blue-400" />
						</div>
						<div>
							<h3 class="font-semibold text-gray-900 dark:text-gray-100">
								{getJobFileName(activeImportJob)}
							</h3>
							<p class="text-sm text-gray-500 dark:text-gray-400">
								Job ID: {activeImportJob.id}
							</p>
						</div>
					</div>
					<div class="text-right">
						<div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
							{getJobProgress(activeImportJob)}%
						</div>
						{#if getJobETA(activeImportJob)}
							<div class="text-sm text-gray-500 dark:text-gray-400">{getJobETA(activeImportJob)}</div>
						{/if}
					</div>
				</div>

				<!-- Progress Bar -->
				<div class="mb-3">
					<div class="mb-1 flex justify-between text-sm text-gray-600 dark:text-gray-400">
						<span>Progress</span>
					</div>
					<div class="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700">
						<div
							class="h-3 rounded-full bg-blue-600 transition-all duration-300 ease-out"
							style="width: {getJobProgress(activeImportJob)}%"
						></div>
					</div>
				</div>

				<!-- Status Message -->
				{#if getJobStatus(activeImportJob)}
					<div class="mb-3 text-sm text-gray-600 dark:text-gray-400">
						{getJobStatus(activeImportJob)}
					</div>
				{/if}

				<!-- Job Details -->
				<div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
					<div class="flex items-center gap-4">
						<span>Format: {activeImportJob.data?.format || 'Unknown'}</span>
						{#if activeImportJob.data?.fileSize && typeof activeImportJob.data.fileSize === 'number'}
							<span>Size: {(activeImportJob.data.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
						{:else if activeImportJob.data?.file_size && typeof activeImportJob.data.file_size === 'number'}
							<span>Size: {(activeImportJob.data.file_size / (1024 * 1024)).toFixed(1)} MB</span>
						{/if}
					</div>
					<div class="text-xs text-gray-400">
						Created: {activeImportJob.created_at ? new Date(activeImportJob.created_at).toLocaleString() : 'Unknown'}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Active Export Job Progress Display -->
	{#if activeExportJob}
		<div class="mb-8">
			<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">Active Export Job</h2>
			<div
				class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
			>
				<div class="mb-3 flex items-center justify-between">
					<div class="flex items-center gap-3">
						<div class="rounded-lg bg-green-50 p-2 dark:bg-green-900/20">
							<FileDown class="h-5 w-5 text-green-600 dark:text-green-400" />
						</div>
						<div>
							<h3 class="font-semibold text-gray-900 dark:text-gray-100">
								Export
							</h3>
							<p class="text-sm text-gray-500 dark:text-gray-400">
								Job ID: {activeExportJob.id}
							</p>
						</div>
					</div>
					<div class="text-right">
						<div class="text-2xl font-bold text-green-600 dark:text-green-400">
							{getJobProgress(activeExportJob)}%
						</div>
						{#if getJobETA(activeExportJob)}
							<div class="text-sm text-gray-500 dark:text-gray-400">{getJobETA(activeExportJob)}</div>
						{/if}
					</div>
				</div>

				<!-- Progress Bar -->
				<div class="mb-3">
					<div class="mb-1 flex justify-between text-sm text-gray-600 dark:text-gray-400">
						<span>Progress</span>
					</div>
					<div class="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700">
						<div
							class="h-3 rounded-full bg-green-600 transition-all duration-300 ease-out"
							style="width: {getJobProgress(activeExportJob)}%"
						></div>
					</div>
				</div>

				<!-- Status Message -->
				{#if getJobStatus(activeExportJob)}
					<div class="mb-3 text-sm text-gray-600 dark:text-gray-400">
						{getJobStatus(activeExportJob)}
					</div>
				{/if}

				<!-- Job Details -->
				<div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
					<div class="flex items-center gap-4">
						<span>Format: {activeExportJob.data?.format || 'Unknown'}</span>
						<span>Period: {activeExportJob.data?.startDate} to {activeExportJob.data?.endDate}</span>
					</div>
					<div class="text-xs text-gray-400">
						Created: {activeExportJob.created_at ? new Date(activeExportJob.created_at).toLocaleString() : 'Unknown'}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<div class="grid gap-8 md:grid-cols-2">
		<!-- Import Section -->
		<div
			class="flex flex-col rounded-xl border border-[rgb(218,218,221)] bg-white p-6 dark:border-[#23232a] dark:bg-[#23232a]"
		>
			<div class="mb-6 flex items-center gap-3">
				<FileDown class="h-5 w-5 text-gray-400" />
				<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Import Data</h2>
			</div>
			<p class="mb-6 text-sm text-gray-600 dark:text-gray-300">
				Import your travel data from various sources. Imports are processed in the background by
				workers and progress will be shown on this page.
			</p>

			{#if !activeImportJob}
				<!-- Show file upload UI and import button only if no active import job -->
				<div class="flex-1 space-y-4">
					<div>
						<label
							for="fileInput"
							class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100"
							>Select File</label
						>
						<div class="relative">
							<label for="fileInput" class="absolute inset-0 z-10 cursor-pointer"></label>
							<input
								type="file"
								id="fileInput"
								bind:this={fileInputEl}
								accept=".geojson,.json,.gpx,.rec"
								class="block w-full cursor-pointer rounded-md border border-[rgb(218,218,221)] text-sm text-gray-500 file:mr-4 file:border-0 file:bg-[rgb(37,140,244)]/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-[rgb(37,140,244)] hover:file:bg-[rgb(37,140,244)]/20 dark:border-[#23232a] dark:text-gray-400"
								on:change={handleFileSelect}
							/>
						</div>
						{#if selectedFile}
							<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
								Selected: {selectedFile.name}
								{#if importFormat}
									| Detected format: <span class="font-semibold">{importFormat}</span>
								{/if}
							</p>
						{/if}
					</div>

					<div class="mt-6">
						<h3 class="mb-3 text-sm font-medium text-gray-900 dark:text-gray-100">
							Supported Formats
						</h3>
						<div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
							{#each importFormats as format}
								<div class="flex items-center gap-2">
									<svelte:component this={format.icon} class="h-4 w-4" />
									<span>{format.label} - {format.description}</span>
								</div>
							{/each}
						</div>
					</div>
					<!-- Import button only shown if no active job -->
					<button
						type="button"
						on:click={handleImport}
						disabled={$isImporting || !selectedFile}
						class="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if $isImporting}
							<div class="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
							Importing... (This may take a few minutes for large files)
						{:else}
							<Import class="h-4 w-4" />
							Import Data
						{/if}
					</button>
				</div>
			{/if}
		</div>

		<!-- Export Section -->
		<div
			class="flex flex-col rounded-xl border border-[rgb(218,218,221)] bg-white p-6 dark:border-[#23232a] dark:bg-[#23232a]"
		>
			<div class="mb-6 flex items-center gap-3">
				<FileDown class="h-5 w-5 text-gray-400" />
				<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Export Data</h2>
			</div>
			<p class="mb-6 text-sm text-gray-600 dark:text-gray-300">
				Export your travel data to various formats
			</p>

			<div class="flex-1 space-y-4">
				<div>
					<label
						class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100"
						for="includeLocationData">Include</label
					>
					<div class="space-y-2">
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={includeLocationData}
								class="h-4 w-4 rounded border-gray-300 text-[rgb(37,140,244)] focus:ring-[rgb(37,140,244)]"
							/>
							<span class="text-sm text-gray-600 dark:text-gray-300">Location data (GeoJSON)</span>
						</label>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={includeTripInfo}
								class="h-4 w-4 rounded border-gray-300 text-[rgb(37,140,244)] focus:ring-[rgb(37,140,244)]"
							/>
							<span class="text-sm text-gray-600 dark:text-gray-300">Trip information (JSON)</span>
						</label>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={includeWantToVisit}
								class="h-4 w-4 rounded border-gray-300 text-[rgb(37,140,244)] focus:ring-[rgb(37,140,244)]"
							/>
							<span class="text-sm text-gray-600 dark:text-gray-300">Want to visit (JSON)</span>
						</label>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={includeTrips}
								class="h-4 w-4 rounded border-gray-300 text-[rgb(37,140,244)] focus:ring-[rgb(37,140,244)]"
							/>
							<span class="text-sm text-gray-600 dark:text-gray-300">Trips (JSON)</span>
						</label>
					</div>
				</div>
				<div class="mt-4">
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date Range</label>
					<div class="relative">
						<button
							type="button"
							class="date-field flex w-full cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-left text-sm shadow border border-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
							on:click={toggleExportDatePicker}
							on:keydown={(e) => e.key === 'Enter' && toggleExportDatePicker()}
							class:open={isExportDatePickerOpen}
							aria-label="Select export date range"
							aria-expanded={isExportDatePickerOpen}
						>
							<i class="icon-calendar"></i>
							<div class="date">
								{#if exportStartDate && exportEndDate}
									{formattedExportStartDate} - {formattedExportEndDate}
								{:else}
									Pick a date range
								{/if}
							</div>
						</button>
						{#if isExportDatePickerOpen}
							<div class="date-picker-container absolute right-0 mt-2 z-50">
								<DatePicker
									bind:isOpen={isExportDatePickerOpen}
									bind:startDate={exportStartDate}
									bind:endDate={exportEndDate}
									isRange
									showPresets
									align="right"
								/>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Only disable if there is an active export job that is not completed/failed/cancelled -->
			<button
				on:click={handleExport}
				disabled={activeExportJob && !['completed','failed','cancelled'].includes(activeExportJob.status)}
				class="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if activeExportJob && !['completed','failed','cancelled'].includes(activeExportJob.status)}
					<div class="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
					Export in Progress...
				{:else}
					<FileDown class="h-4 w-4" />
					Export Data
				{/if}
			</button>
		</div>
	</div>

	<!-- Export Jobs Section -->
	<div class="mt-8">
		<ExportJobs />
	</div>
</div>
