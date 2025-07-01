<script lang="ts">
	import { Import, FileDown, Database, Image, FileText, MapPin, Route, Upload, Clock } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { supabase } from '$lib/supabase';
	import { onMount, onDestroy } from 'svelte';
	import { Upload as UploadIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { tick } from 'svelte';
	import { writable } from 'svelte/store';
	import { createClient } from '@supabase/supabase-js';
	import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
	import { sessionStore } from '$lib/stores/auth';
	import { get } from 'svelte/store';
	import type { Job } from '$lib/types/job-queue.types';

	let importFormat: string | null = null;
	let exportFormat = 'GeoJSON';
	let dateRange = 'All Time';
	let selectedFile: File | null = null;
	let includeLocationData = true;
	let includeTripInfo = true;
	let includeStatistics = false;
	const isImporting = writable(false);
	const importStatus = writable('');
	let importProgress = 0;
	let importedCount = 0;
	let totalCount = 0;
	let fileInputEl: HTMLInputElement | null = null;
	let importStartTime: number | null = null;
	let eta: string | null = null;

	// Active import job tracking
	let activeImportJob: Job | null = null;
	let jobPollingInterval: NodeJS.Timeout | null = null;

	const importFormats = [
		{ value: 'GeoJSON', label: 'GeoJSON', icon: MapPin, description: 'Geographic data in JSON format' },
		{ value: 'GPX', label: 'GPX', icon: Route, description: 'GPS Exchange Format' },
		{ value: 'OwnTracks', label: 'OwnTracks (.REC)', icon: Route, description: 'OwnTracks recording files' }
	];

	const exportFormats = ['GeoJSON', 'GPX', 'OwnTracks'];

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
		const formatInfo = importFormats.find(f => f.value === format);
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

		// Content-based detection
		const text = await file.text();
		const trimmed = text.trim();
		if (trimmed.startsWith('{')) {
			try {
				const json = JSON.parse(trimmed);
				if (json.type === 'FeatureCollection' || json.type === 'Feature') return 'GeoJSON';
			} catch {}
		}
		if (trimmed.startsWith('<') && trimmed.includes('<gpx')) return 'GPX';
		if (/^\d{10,},-?\d+\.\d+,-?\d+\.\d+/.test(trimmed.split('\n')[0])) return 'OwnTracks';
		return 'Unknown';
	}

	async function handleImport() {
		if (!selectedFile) {
			toast.error('Please select a file to import');
			return;
		}
		if (!importFormat || importFormat === 'Unknown') {
			toast.error('Could not detect import format. Please use a supported file.');
			return;
		}

		const file = selectedFile;
		console.log('🚀 Starting import process...', { fileName: file.name, fileSize: file.size, format: importFormat });
		isImporting.set(true);
		importProgress = 0;
		importStatus.set('Creating import job...');
		importedCount = 0;
		totalCount = 0;
		importStartTime = Date.now();
		eta = null;

		toast.info('Starting import process...', {
			description: `Processing ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`
		});

		let jobId: string | null = null;
		let progressInterval: NodeJS.Timeout | null = null;

		try {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('format', importFormat);

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout

			importStatus.set('Uploading file and creating job...');
			importProgress = 0;

			const response = await fetch('/api/v1/import', {
				method: 'POST',
				body: formData,
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
			}

			const result = await response.json();
			console.log('✅ Import job created successfully:', result);

			if (result.success && result.data?.jobId) {
				jobId = result.data.jobId;
				importStatus.set('Job created, waiting for worker to start...');

				// Create a job object for tracking
				activeImportJob = {
					id: jobId!,
					type: 'data_import',
					status: 'queued',
					data: {
						fileName: file.name,
						format: importFormat,
						fileSize: file.size
					},
					progress: 0,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					created_by: '',
					priority: 'normal'
				};

				// Start polling for job updates
				startJobPolling();

				toast.success(`Import job created successfully!`, {
					description: `Job ID: ${jobId}. Check the Jobs page for detailed progress.`
				});

				// Continue polling until job is completed or failed
				await new Promise<void>((resolve, reject) => {
					const checkInterval = setInterval(async () => {
						try {
							const session = get(sessionStore);
							const headers: Record<string, string> = {};
							if (session?.access_token) {
								headers['Authorization'] = `Bearer ${session.access_token}`;
							}

							const jobResponse = await fetch(`/api/v1/jobs/${jobId}`, { headers });
							if (jobResponse.ok) {
								const jobData = await jobResponse.json();
								const job = jobData.data?.job || jobData.job;

								if (job && (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled')) {
									clearInterval(checkInterval);

									if (job.status === 'completed') {
										const result = job.result as Record<string, unknown> || {};
										importedCount = (result.importedCount as number) || 0;
										totalCount = (result.totalItems as number) || importedCount;
										importStatus.set('Import completed successfully!');

										toast.success(`Import completed successfully!`, {
											description: `Imported ${importedCount} items`
										});
									} else if (job.status === 'failed') {
										importStatus.set('Import failed');
										toast.error('Import failed', {
											description: job.error || 'Unknown error occurred'
										});
									} else {
										importStatus.set('Import cancelled');
										toast.info('Import was cancelled');
									}

									// Clear the active job
									activeImportJob = null;
									stopJobPolling();

									resolve();
								}
							}
						} catch (error) {
							console.error('Error checking job status:', error);
						}
					}, 2000); // Check every 2 seconds
				});

			} else {
				throw new Error(result.message || 'Failed to create import job');
			}
		} catch (error) {
			console.error('❌ Import failed:', error);
			importStatus.set('Import failed');
			toast.error(error instanceof Error ? error.message : 'Failed to import data');
		} finally {
			if (progressInterval) {
				clearInterval(progressInterval);
			}
			isImporting.set(false);
			await tick();
			if (fileInputEl) fileInputEl.value = '';
		}
	}



	async function handleExport() {
		toast.promise(
			new Promise((resolve) => setTimeout(resolve, 2000)),
			{
				loading: 'Exporting data...',
				success: 'Data exported successfully',
				error: 'Failed to export data'
			}
		);
	}

	async function handleQuickAction(action: string) {
		toast.promise(
			new Promise((resolve) => setTimeout(resolve, 2000)),
			{
				loading: `${action} in progress...`,
				success: `${action} completed successfully`,
				error: `Failed to ${action.toLowerCase()}`
			}
		);
	}

	onMount(() => {
		checkForActiveImportJob();
	});

	onDestroy(() => {
		if (jobPollingInterval) {
			clearInterval(jobPollingInterval);
		}
	});

	async function checkForActiveImportJob() {
		try {
			const session = get(sessionStore);
			const headers: Record<string, string> = {};
			if (session?.access_token) {
				headers['Authorization'] = `Bearer ${session.access_token}`;
			}

			const response = await fetch('/api/v1/jobs?status=queued&status=running', { headers });
			const data = await response.json();

			if (data.success && data.data?.jobs) {
				const activeJobs = data.data.jobs.filter((job: Job) =>
					job.type === 'data_import' &&
					(job.status === 'queued' || job.status === 'running')
				);

				if (activeJobs.length > 0) {
					activeImportJob = activeJobs[0]; // Get the most recent active job
					console.log('Found active import job:', activeImportJob);

					// Start polling for job updates
					startJobPolling();

					// Set the import state to show progress
					isImporting.set(true);
					importStartTime = Date.now();

					// Update progress from job data
					if (activeImportJob) {
						updateProgressFromJob(activeImportJob);
					}
				}
			}
		} catch (error) {
			console.error('Error checking for active import jobs:', error);
		}
	}

	function startJobPolling() {
		if (jobPollingInterval) {
			clearInterval(jobPollingInterval);
		}

		jobPollingInterval = setInterval(async () => {
			if (!activeImportJob) return;

			try {
				const session = get(sessionStore);
				const headers: Record<string, string> = {};
				if (session?.access_token) {
					headers['Authorization'] = `Bearer ${session.access_token}`;
				}

				const response = await fetch(`/api/v1/jobs/${activeImportJob.id}`, { headers });
				const data = await response.json();

				if (data.success && data.data?.job) {
					const job = data.data.job;
					activeImportJob = job;
					updateProgressFromJob(job);

					// Check if job is completed
					if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
						stopJobPolling();
						isImporting.set(false);

						if (job.status === 'completed') {
							const result = job.result as Record<string, unknown> || {};
							importedCount = (result.importedCount as number) || 0;
							totalCount = (result.totalItems as number) || importedCount;
							importStatus.set('Import completed successfully!');

							toast.success(`Import completed successfully!`, {
								description: `Imported ${importedCount} items`
							});
						} else if (job.status === 'failed') {
							importStatus.set('Import failed');
							toast.error('Import failed', {
								description: job.error || 'Unknown error occurred'
							});
						} else {
							importStatus.set('Import cancelled');
							toast.info('Import was cancelled');
						}
					}
				}
			} catch (error) {
				console.error('Error polling job status:', error);
			}
		}, 2000); // Poll every 2 seconds
	}

	function stopJobPolling() {
		if (jobPollingInterval) {
			clearInterval(jobPollingInterval);
			jobPollingInterval = null;
		}
	}

	function updateProgressFromJob(job: Job) {
		importProgress = job.progress || 0;

		const result = job.result as Record<string, unknown> || {};
		importStatus.set(result.message as string || job.status);
		importedCount = (result.totalProcessed as number) || 0;
		totalCount = (result.totalItems as number) || 0;

		// ETA calculation
		if (importProgress > 0 && importProgress < 100 && importStartTime) {
			const elapsed = (Date.now() - importStartTime) / 1000; // seconds
			const estimatedTotal = elapsed / (importProgress / 100);
			const remaining = estimatedTotal - elapsed;
			if (remaining > 0) {
				const mins = Math.floor(remaining / 60);
				const secs = Math.round(remaining % 60);
				eta = `${mins > 0 ? mins + 'm ' : ''}${secs}s remaining`;
			} else {
				eta = null;
			}
		} else {
			eta = null;
		}
	}
</script>

<div>
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<Import class="h-8 w-8 text-blue-600 dark:text-gray-400" />
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Import/Export</h1>
		</div>
	</div>

	<div class="grid gap-8 md:grid-cols-2">
		<!-- Import Section -->
		<div class="rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6 flex flex-col">
			<div class="mb-6 flex items-center gap-3">
				<FileDown class="h-5 w-5 text-gray-400" />
				<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Import Data</h2>
			</div>
			<p class="mb-6 text-sm text-gray-600 dark:text-gray-300">
				Import your travel data from various sources. Imports are processed in the background by workers and you can track progress on the Jobs page.
			</p>

			<div class="flex-1 space-y-4">
				<div>
					<label for="fileInput" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">Select File</label>
					<div class="relative">
						<label for="fileInput" class="absolute inset-0 z-10 cursor-pointer"></label>
						<input
							type="file"
							id="fileInput"
							bind:this={fileInputEl}
							accept=".geojson,.json,.gpx,.rec"
							class="block w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#23232a] text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:border-0 file:bg-[rgb(37,140,244)]/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-[rgb(37,140,244)] hover:file:bg-[rgb(37,140,244)]/20 cursor-pointer"
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
					<h3 class="mb-3 text-sm font-medium text-gray-900 dark:text-gray-100">Supported Formats</h3>
					<div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
						{#each importFormats as format}
							<div class="flex items-center gap-2">
								<svelte:component this={format.icon} class="h-4 w-4" />
								<span>{format.label} - {format.description}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<button
				type="button"
				on:click={handleImport}
				disabled={$isImporting || !selectedFile || activeImportJob !== null}
				class="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
			>
				{#if $isImporting}
					<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
					Importing... (This may take a few minutes for large files)
				{:else if activeImportJob}
					<Clock class="h-4 w-4" />
					Import in Progress
				{:else}
					<Import class="h-4 w-4" />
					Import Data
				{/if}
			</button>

			{#if activeImportJob}
				<div class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
					<p class="text-sm text-blue-800 dark:text-blue-200 mb-2">
						📤 Active import job detected: {activeImportJob.data?.fileName || 'Unknown file'}
					</p>
					<div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
						<div
							class="bg-blue-600 h-2 rounded-full transition-all duration-300"
							style="width: {importProgress}%"
						></div>
					</div>
					<p class="text-xs text-blue-600 dark:text-blue-400 mb-2">
						Progress: {importProgress}%
						{#if importedCount > 0}
							({importedCount} items processed)
						{/if}
					</p>
					{#if eta}
						<p class="text-xs text-blue-600 dark:text-blue-400 mt-1">ETA: {eta}</p>
					{/if}
					<p class="text-xs text-blue-600 dark:text-blue-400 mb-2">
						Job ID: {activeImportJob.id} | Status: {activeImportJob.status}
					</p>
					<p class="text-xs text-blue-600 dark:text-blue-400">
						<a href="/dashboard/jobs" class="underline hover:no-underline">
							View detailed progress on Jobs page →
						</a>
					</p>
				</div>
			{:else if $isImporting}
				<div class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
					<p class="text-sm text-blue-800 dark:text-blue-200 mb-2">
						📤 {$importStatus}
					</p>
					<div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
						<div
							class="bg-blue-600 h-2 rounded-full transition-all duration-300"
							style="width: {importProgress}%"
						></div>
					</div>
					<p class="text-xs text-blue-600 dark:text-blue-400">
						Progress: {importProgress}%
						{#if importedCount > 0}
							({importedCount} items processed)
						{/if}
					</p>
					{#if eta}
						<p class="text-xs text-blue-600 dark:text-blue-400 mt-1">ETA: {eta}</p>
					{/if}
					<p class="text-xs text-blue-600 dark:text-blue-400 mt-2">
						<a href="/dashboard/jobs" class="underline hover:no-underline">
							View detailed progress on Jobs page →
						</a>
					</p>
				</div>
			{:else if importedCount > 0}
				<div class="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
					<p class="text-sm text-green-800 dark:text-green-200 mb-2">
						✅ Import completed successfully!
					</p>
					<p class="text-xs text-green-600 dark:text-green-400 mb-3">
						Imported {importedCount} items (track points → Tracking Data).
						<a href="/dashboard/points-of-interest" class="underline hover:no-underline">
							View Tracking Data →
						</a>
					</p>
					<p class="text-xs text-green-600 dark:text-green-400">
						<a href="/dashboard/jobs" class="underline hover:no-underline">
							View job history →
						</a>
					</p>
				</div>
			{/if}
		</div>

		<!-- Export Section -->
		<div class="rounded-xl border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-6 flex flex-col">
			<div class="mb-6 flex items-center gap-3">
				<FileDown class="h-5 w-5 text-gray-400" />
				<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Export Data</h2>
			</div>
			<p class="mb-6 text-sm text-gray-600 dark:text-gray-300">Export your travel data to various formats</p>

			<div class="flex-1 space-y-4">
				<div>
					<label for="exportFormat" class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100">Export Format</label>
					<select
						id="exportFormat"
						bind:value={exportFormat}
						class="w-full rounded-md border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-[rgb(37,140,244)] focus:outline-none focus:ring-1 focus:ring-[rgb(37,140,244)]"
					>
						{#each exportFormats as format}
							<option value={format}>{format}</option>
						{/each}
					</select>
				</div>

				<div>
					<label class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100" for="includeLocationData">Include</label>
					<div class="space-y-2">
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={includeLocationData}
								class="h-4 w-4 rounded border-gray-300 text-[rgb(37,140,244)] focus:ring-[rgb(37,140,244)]"
							/>
							<span class="text-sm text-gray-600 dark:text-gray-300">Location data</span>
						</label>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={includeTripInfo}
								class="h-4 w-4 rounded border-gray-300 text-[rgb(37,140,244)] focus:ring-[rgb(37,140,244)]"
							/>
							<span class="text-sm text-gray-600 dark:text-gray-300">Trip information</span>
						</label>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={includeStatistics}
								class="h-4 w-4 rounded border-gray-300 text-[rgb(37,140,244)] focus:ring-[rgb(37,140,244)]"
							/>
							<span class="text-sm text-gray-600 dark:text-gray-300">Statistics</span>
						</label>
					</div>
				</div>
			</div>

			<button
				on:click={handleExport}
				class="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-[rgb(37,140,244)] px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(37,140,244)]/90 cursor-pointer"
			>
				<FileDown class="h-4 w-4" />
				Export Data
			</button>
		</div>
	</div>
</div>