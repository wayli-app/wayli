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

	import { sessionStore } from '$lib/stores/auth';
	import { get } from 'svelte/store';
	import type { Job } from '$lib/types/job-queue.types';
	import ExportJobs from '$lib/components/ExportJobs.svelte';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { jobCreationService } from '$lib/services/job-creation.service';
	import { createClient } from '@supabase/supabase-js';
	import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
	import { DatePicker } from '@svelte-plugins/datepicker';
	import { format } from 'date-fns';
	import { translate } from '$lib/i18n';

	// Use the reactive translation function
	let t = $derived($translate);

	// Import state
	let importFormat = $state<string | null>(null);
	let selectedFile = $state<File | null>(null);
	let includeLocationData = $state(true);
	let includeTripInfo = $state(true);
	let includeWantToVisit = $state(true);
	let includeTrips = $state(true);
	let isImporting = $state(false);
	let fileInputEl = $state<HTMLInputElement | null>(null);

	// Upload progress state
	let uploadProgress = $state(0);
	let isUploading = $state(false);

	// Last successful import date
	let lastSuccessfulImport = $state<string | null>(null);

	// Export state
	let exportFormat = $state('JSON');
	let exportStartDate = $state<Date | null>(null);
	let exportEndDate = $state<Date | null>(null);
	let isExportDatePickerOpen = $state(false);
	let includeLocationDataExport = $state(true);
	let includeTripInfoExport = $state(true);
	let includeWantToVisitExport = $state(true);
	let includeTripsExport = $state(true);



	// Track which jobs we've already shown toasts for (to prevent duplicates on navigation)
	// Use localStorage to persist across page navigation
	let completedJobIds = $state(new Set<string>());

	// Load previously completed job IDs from localStorage
	if (typeof window !== 'undefined') {
		try {
			const stored = localStorage.getItem('wayli_completed_jobs');
			if (stored) {
				const jobIds = JSON.parse(stored);
				completedJobIds = new Set(jobIds);
			}
		} catch (error) {
			console.warn('Failed to load completed job IDs from localStorage:', error);
		}
	}

	// Save completed job IDs to localStorage
	function saveCompletedJobIds() {
		if (typeof window !== 'undefined') {
			try {
				localStorage.setItem('wayli_completed_jobs', JSON.stringify([...completedJobIds]));
			} catch (error) {
				console.warn('Failed to save completed job IDs to localStorage:', error);
			}
		}
	}

	// Clean up old completed job IDs periodically
	setInterval(() => {
		// Keep only jobs from the last 5 minutes
		const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
		// Note: We can't easily clean up the Set without job timestamps,
		// but it's small enough that it won't cause memory issues

		// Clean up localStorage periodically (every 5 minutes)
		if (typeof window !== 'undefined' && completedJobIds.size > 100) {
			// If we have too many job IDs, clear them all and start fresh
			completedJobIds.clear();
			localStorage.removeItem('wayli_completed_jobs');
		}
	}, 5 * 60 * 1000); // Clean up every 5 minutes

	let exportJobsComponent: ExportJobs;
	const autoStart = true;



	let importFormats = $derived([
		{
			value: 'GeoJSON',
			label: 'GeoJSON',
			icon: MapPin,
			description: t('importExport.geoJsonDescription')
		},
		{ value: 'GPX', label: 'GPX', icon: Route, description: t('importExport.gpxDescription')},
		{
			value: 'OwnTracks',
			label: 'OwnTracks (.REC)',
			icon: Route,
			description: t('importExport.ownTracksDescription')
		}
	]);

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
        const next = !isExportDatePickerOpen;
        isExportDatePickerOpen = next;
        if (next) {
            // clear previous selection to prevent immediate close on mount
            exportStartDate = null;
            exportEndDate = null;
        }
    }

	function closeExportDatePicker() {
		isExportDatePickerOpen = false;
	}

		// Handle date changes
	function handleDateChange() {
		// Since we're using binding, the dates are automatically updated
		// We just need to close the picker when both dates are selected
		if (exportStartDate && exportEndDate) {
			setTimeout(() => {
				isExportDatePickerOpen = false;
			}, 500);
		}
	}



	let formattedExportStartDate = $derived(exportStartDate ? format(exportStartDate, 'MMM dd, yyyy') : '');
	let formattedExportEndDate = $derived(exportEndDate ? format(exportEndDate, 'MMM dd, yyyy') : '');

	// Custom presets for date range selection
	let datePresets = $derived([
		{ label: t('datePicker.today'), startDate: new Date(), endDate: new Date() },
		{ label: t('datePicker.last7Days'), startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), endDate: new Date() },
		{ label: t('datePicker.last30Days'), startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), endDate: new Date() },
		{ label: t('datePicker.last60Days'), startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), endDate: new Date() },
		{ label: t('datePicker.last90Days'), startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), endDate: new Date() },
		{ label: t('datePicker.lastYear'), startDate: new Date(new Date().getFullYear() - 1, 0, 1), endDate: new Date(new Date().getFullYear() - 1, 11, 31) }
	]);





	// Import functions
	async function handleImport() {
		if (!selectedFile || !importFormat) {
			toast.error(t('importExport.pleaseSelectFile'));
			return;
		}

		try {
			isImporting = true;
			isUploading = true;
			uploadProgress = 0;

			await jobCreationService.createImportJob(selectedFile, {
				format: importFormat,
				includeLocationData,
				includeTripInfo,
				includeWantToVisit,
				includeTrips
			}, (progress: number) => {
				uploadProgress = progress;
				console.log('📤 Upload progress:', progress + '%');
			});

			// Reset form
			selectedFile = null;
			importFormat = null;
			includeLocationData = true;
			includeTripInfo = true;
			includeWantToVisit = true;
			includeTrips = true;

			// Clear file input
			if (fileInputEl) {
				fileInputEl.value = '';
			}
		} catch (error) {
			console.error('Import error:', error);
		} finally {
			isImporting = false;
			isUploading = false;
			uploadProgress = 0;
		}

		// Refresh the last successful import date after a successful import
		await fetchLastSuccessfulImport();
	}

	// Fetch last successful import date
	async function fetchLastSuccessfulImport() {
		try {
			const session = get(sessionStore);
			if (!session) return;

			const serviceAdapter = new ServiceAdapter({ session });
			const jobsResponse = await serviceAdapter.getJobs({ type: 'data_import' }) as any;
			const jobs = Array.isArray(jobsResponse) ? jobsResponse : (jobsResponse?.data || []);

			// Find the most recent completed import job
			const lastCompletedImport = jobs
				.filter((job: any) => job.status === 'completed')
				.sort((a: any, b: any) => new Date(b.completed_at || b.updated_at).getTime() - new Date(a.completed_at || a.updated_at).getTime())[0];

			if (lastCompletedImport) {
				const date = new Date(lastCompletedImport.completed_at || lastCompletedImport.updated_at);
				lastSuccessfulImport = date.toLocaleString('en-US', {
					year: 'numeric',
					month: 'short',
					day: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				});
			}
		} catch (error) {
			console.error('Error fetching last successful import:', error);
		}
	}



	// Fetch last successful import date on mount
	onMount(async () => {
		await fetchLastSuccessfulImport();
	});

	// Export functions
	async function handleExport() {
		if (!exportStartDate || !exportEndDate) {
			toast.error(t('importExport.pleaseSelectDates'));
			return;
		}

		// Convert Date objects to ISO strings for the API
		// Always ensure we have proper Date objects, regardless of what the DatePicker returns
		let startDate: Date;
		let endDate: Date;

		try {
			// Convert to Date objects if they're not already
			startDate = exportStartDate instanceof Date ? exportStartDate : new Date(exportStartDate);
			endDate = exportEndDate instanceof Date ? exportEndDate : new Date(exportEndDate);

			// Validate the dates
			if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
				toast.error('Invalid date format. Please select valid start and end dates.');
				return;
			}
		} catch (error) {
			toast.error('Invalid date format. Please select valid start and end dates.');
			return;
		}

		const startDateStr = startDate.toISOString().split('T')[0];
		const endDateStr = endDate.toISOString().split('T')[0];

		try {
			await jobCreationService.createExportJob({
				format: exportFormat,
				includeLocationData: includeLocationDataExport,
				includeTripInfo: includeTripInfoExport,
				includeWantToVisit: includeWantToVisitExport,
				includeTrips: includeTripsExport,
				startDate: startDate,
				endDate: endDate
			});

			// Reset form
			exportFormat = 'JSON';
			exportStartDate = null;
			exportEndDate = null;
			includeLocationDataExport = true;
			includeTripInfoExport = true;
			includeWantToVisitExport = true;
			includeTripsExport = true;
		} catch (error) {
			console.error('Export error:', error);
		}


	}


	function getJobFileName(job: Job | null): string {
		if (!job) return 'Unknown file';
		if (job.data?.fileName) return job.data.fileName as string;
		if (job.data?.original_filename) return job.data.original_filename as string;
		if (job.data?.filename) return job.data.filename as string;
		return 'Unknown file';
	}

	function getJobStatus(job: Job | null): string {
		if (!job) return 'Unknown';

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
		console.log('📊 getJobProgress called for job:', job.id, 'progress:', job.progress);
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
				{t('importExport.title')}
			</h1>
		</div>
	</div>





	<div class="grid gap-8 md:grid-cols-2">
		<!-- Import Section -->
		<div
			class="flex flex-col rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="mb-6 flex items-center gap-3">
				<FileDown class="h-5 w-5 text-gray-400" />
				<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('importExport.importData')}</h2>
			</div>
			<p class="mb-6 text-sm text-gray-600 dark:text-gray-300">
				{t('importExport.importDescription')}
			</p>
			{#if lastSuccessfulImport}
				<div class="mb-4 text-xs text-gray-500 dark:text-gray-400">
					{t('importExport.lastSuccessfulImport', { date: lastSuccessfulImport })}
				</div>
			{/if}

			<div class="flex-1 space-y-4">
					<div>
						<label
							for="fileInput"
							class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100"
							>{t('importExport.selectFile')}</label
						>
						<div class="relative">
							<label for="fileInput" class="absolute inset-0 z-10 cursor-pointer"></label>
                            <input
								type="file"
								id="fileInput"
								bind:this={fileInputEl}
								accept=".geojson,.json,.gpx,.rec"
								class="block w-full cursor-pointer rounded-md border border-gray-300 text-sm text-gray-500 file:mr-4 file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100 dark:border-gray-600 dark:text-gray-300 dark:file:bg-gray-700 dark:file:text-blue-400 dark:hover:file:bg-gray-600"
                                onchange={handleFileSelect}
							/>
						</div>
						{#if selectedFile}
							<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
								{t('importExport.selectedFile', { filename: selectedFile.name })}
								{#if importFormat}
									| {t('importExport.detectedFormat', { format: importFormat })}
								{/if}
							</p>
						{/if}
					</div>

					<div class="mt-6">
						<h3 class="mb-3 text-sm font-medium text-gray-900 dark:text-gray-100">
							{t('importExport.supportedFormats')}
						</h3>
						<div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
							{#each importFormats as format}
								<div class="flex items-center gap-2">
                                    <format.icon class="h-4 w-4" />
									<span>{format.label} - {format.description}</span>
								</div>
							{/each}
						</div>
					</div>

					<!-- Upload Progress Bar -->
					{#if isUploading}
						<div class="mt-4">
							<div class="mb-2 flex justify-between text-sm text-gray-600 dark:text-gray-400">
								<span>{t('importExport.uploadingFile')}</span>
								<span>{uploadProgress}%</span>
							</div>
							<div class="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
								<div
									class="h-2 rounded-full bg-green-600 transition-all duration-300"
									style="width: {uploadProgress}%"
								></div>
							</div>
						</div>
					{/if}

					<!-- Import button only shown if no active job -->
                    <button
						type="button"
                        onclick={handleImport}
						disabled={isImporting || !selectedFile}
						class="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if isImporting}
							<div class="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
							{t('importExport.importing')}
						{:else}
							<Import class="h-4 w-4" />
							{t('importExport.importDataButton')}
						{/if}
					</button>
				</div>
		</div>

		<!-- Export Section -->
		<div
			class="flex flex-col rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="mb-6 flex items-center gap-3">
				<FileDown class="h-5 w-5 text-gray-400" />
				<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('importExport.exportData')}</h2>
			</div>
			<p class="mb-6 text-sm text-gray-600 dark:text-gray-300">
				{t('importExport.exportDescription')}
			</p>

			<div class="flex-1 space-y-4">
				<div>
					<label
						class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100"
						for="includeLocationData">{t('importExport.include')}</label
					>
					<div class="space-y-2">
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={includeLocationData}
								class="h-4 w-4 rounded border-gray-300 text-[rgb(37,140,244)] focus:ring-[rgb(37,140,244)]"
							/>
							<span class="text-sm text-gray-600 dark:text-gray-300">{t('importExport.locationData')}</span>
						</label>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={includeTripInfo}
								class="h-4 w-4 rounded border-gray-300 text-[rgb(37,140,244)] focus:ring-[rgb(37,140,244)]"
							/>
							<span class="text-sm text-gray-600 dark:text-gray-300">{t('importExport.tripInformation')}</span>
						</label>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={includeWantToVisit}
								class="h-4 w-4 rounded border-gray-300 text-[rgb(37,140,244)] focus:ring-[rgb(37,140,244)]"
							/>
							<span class="text-sm text-gray-600 dark:text-gray-300">{t('importExport.wantToVisit')}</span>
						</label>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={includeTrips}
								class="h-4 w-4 rounded border-gray-300 text-[rgb(37,140,244)] focus:ring-[rgb(37,140,244)]"
							/>
							<span class="text-sm text-gray-600 dark:text-gray-300">{t('importExport.trips')}</span>
						</label>
					</div>
				</div>
				<div class="mt-4">
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('importExport.dateRange')}</label>
					<div class="relative">
                        <button
							type="button"
							class="date-field flex w-full cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-left text-sm shadow border border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                            onclick={toggleExportDatePicker}
                            onkeydown={(e) => e.key === 'Enter' && toggleExportDatePicker()}
							class:open={isExportDatePickerOpen}
							aria-label="Select export date range"
							aria-expanded={isExportDatePickerOpen}
						>
							<svg class="h-4 w-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
							</svg>
							<div class="date">
								{#if exportStartDate && exportEndDate}
									{formattedExportStartDate} - {formattedExportEndDate}
								{:else}
									{t('importExport.pickDateRange')}
								{/if}
							</div>
						</button>
						{#if isExportDatePickerOpen}
							<div class="date-picker-container absolute right-0 mt-2 z-50">
                                <DatePicker
                                    isOpen={isExportDatePickerOpen}
                                    bind:startDate={exportStartDate}
                                    bind:endDate={exportEndDate}
                                    isRange
                                    showPresets
                                    presets={datePresets}
                                    presetLabels={[t('datePicker.today'), t('datePicker.last7Days'), t('datePicker.last30Days'), t('datePicker.last60Days'), t('datePicker.last90Days'), t('datePicker.lastYear')]}
                                    dowLabels={t('datePicker.dowLabels')}
                                    monthLabels={t('datePicker.monthLabels')}
                                    align="right"
                                    onclose={() => {
                                        isExportDatePickerOpen = false;
                                    }}
                                    onchange={handleDateChange}
                                />
							</div>
						{/if}
					</div>
				</div>
			</div>

            <button
                onclick={handleExport}
				class="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90"
			>
				<FileDown class="h-4 w-4" />
				{t('importExport.exportDataButton')}
			</button>
		</div>
	</div>

	<!-- Export Jobs Section -->
	<div class="mt-8">
		<ExportJobs />
	</div>
</div>

<style>
	/* No custom styles needed - using SVG icon */
</style>

