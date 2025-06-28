<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		ListTodo,
		Play,
		MapPin,
		Image,
		BarChart,
		Database,
		Trash2,
		Users,
		Settings,
		Zap,
		Clock,
		AlertCircle
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/button/index.svelte';
	import Card from '$lib/components/ui/card/index.svelte';
	import type { Job } from '$lib/types/job-queue.types';
	import { toast } from 'svelte-sonner';
	import { get } from 'svelte/store';

	interface JobField {
		name: string;
		label: string;
		type: 'select' | 'checkbox';
		description: string;
		default?: string | boolean;
		options?: string[];
	}

	interface JobTemplate {
		type: string;
		title: string;
		description: string;
		icon: typeof ListTodo;
		estimatedTime: string;
		fields: JobField[];
	}

	let jobs: Job[] = [];
	let loading = false;
	let error = '';
	let eventSource: EventSource | null = null;
	let isConnected = false;
	let initialLoadComplete = false;

	// Track previous job statuses for toast notifications
	let previousJobStatuses: Record<string, Job['status']> = {};

	const jobTemplates: JobTemplate[] = [
		{
			type: 'reverse_geocoding_missing',
			title: 'Reverse geocoding: missing points',
			description: 'Only processes points with missing location data.',
			icon: MapPin,
			estimatedTime: '2-5 minutes',
			fields: []
		},
		{
			type: 'trip_cover_generation',
			title: 'Generate trip cover photos',
			description: 'Automatically generates cover photos for trips that are missing them.',
			icon: Image,
			estimatedTime: '3-8 minutes',
			fields: []
		},
		{
			type: 'statistics_update',
			title: 'Update statistics',
			description: 'Calculates travel summary, graphs, and reports. Updates all user statistics.',
			icon: BarChart,
			estimatedTime: '2-4 minutes',
			fields: []
		}
	];

	onMount(() => {
		loadJobs();
		startEventSource();

		// Reduced polling frequency and only as fallback when SSE is not connected
		const interval = setInterval(() => {
			if (!isConnected) {
				console.log('SSE not connected, falling back to polling');
				loadJobs();
			}
		}, 30000); // Increased to 30 seconds

		return () => {
			clearInterval(interval);
			stopEventSource();
		};
	});

	onDestroy(() => {
		stopEventSource();
	});

	function startEventSource() {
		try {
			// Create EventSource for real-time job updates
			eventSource = new EventSource('/api/v1/jobs/stream');

			eventSource.onopen = () => {
				console.log('🔗 Connected to job updates stream');
				isConnected = true;
			};

			eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					updateJobStatus(data);
				} catch (err) {
					console.error('Error parsing SSE data:', err);
				}
			};

			eventSource.onerror = (error) => {
				console.error('SSE connection error:', error);
				isConnected = false;
				// Reconnect after 5 seconds, but only if the connection is actually closed
				setTimeout(() => {
					if (eventSource?.readyState === EventSource.CLOSED) {
						console.log('Attempting to reconnect SSE...');
						startEventSource();
					}
				}, 5000);
			};
		} catch (error) {
			console.error('Failed to start EventSource:', error);
			isConnected = false;
		}
	}

	function stopEventSource() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
			isConnected = false;
		}
	}

	function updateJobStatus(update: any) {
		console.log('[updateJobStatus] Received update:', update);
		if (!update || (typeof update === 'object' && Object.keys(update).length === 0)) {
			console.warn('[updateJobStatus] Ignored empty or falsy update:', update);
			return;
		}

		// Ignore non-job events
		if (!update.job_id && update.type !== 'job_created' && update.type !== 'job_update') {
			console.info('[updateJobStatus] No action needed for update:', update);
			return;
		}

		if (!initialLoadComplete) {
			initialLoadComplete = true;
		}

		const jobIndex = jobs.findIndex((job) => job.id === update.job_id);

		// Always prefer update.job_type, then update.job?.type, then fallback
		const resolvedType = update.job_type || update.job?.type || (typeof update.type === 'string' ? update.type : 'unknown');

		if (jobIndex !== -1) {
			const prevStatus = jobs[jobIndex].status;
			jobs[jobIndex] = { ...jobs[jobIndex], ...update, type: resolvedType };
			jobs = [...jobs]; // Trigger reactivity

			// Toast notification for status change
			if (update.status && update.status !== prevStatus) {
				showJobStatusToast(jobs[jobIndex], prevStatus);
			}
			previousJobStatuses[update.job_id] = update.status;
		} else if (update.type === 'job_created') {
			jobs = [update.job, ...jobs];
			showJobStatusToast(update.job, undefined);
			previousJobStatuses[update.job.id] = update.job.status;
		} else if (update.type === 'job_update' && update.job_id) {
			// If a job_update is received for a job not in the list, add it as a new job
			if (update.job) {
				jobs = [update.job, ...jobs];
				previousJobStatuses[update.job.id] = update.job.status;
			} else {
				jobs = [
					{
						id: update.job_id,
						type: resolvedType,
						data: {},
						created_at: update.created_at || '',
						created_by: update.created_by || '',
						priority: update.priority || 'normal',
						status: update.status || 'queued',
						progress: update.progress || 0,
						error: update.error || null,
						result: update.result || null,
						updated_at: update.updated_at || '',
						started_at: update.started_at || '',
						completed_at: update.completed_at || ''
					},
					...jobs
				];
				previousJobStatuses[update.job_id] = update.status;
			}
		}
	}

	function showJobStatusToast(job: Job, prevStatus?: Job['status']) {
		const title = getJobTitle(job.type);
		if (job.status === 'queued' && prevStatus !== 'queued') {
			toast.info(`${title} job queued.`);
		} else if (job.status === 'running' && prevStatus !== 'running') {
			toast(`${title} job started.`);
		} else if (job.status === 'completed' && prevStatus !== 'completed') {
			if (job.error) {
				toast.error(`${title} job failed.`, { description: job.error });
			} else {
				toast.success(`${title} job completed successfully!`);
			}
		} else if (job.status === 'failed' && prevStatus !== 'failed') {
			toast.error(`${title} job failed.`, { description: job.error });
		} else if (job.status === 'cancelled' && prevStatus !== 'cancelled') {
			toast(`${title} job was cancelled.`);
		}
	}

	async function loadJobs() {
		try {
			loading = true;
			const response = await fetch('/api/v1/jobs');
			const data = await response.json();
			const serverJobs = Array.isArray(data.jobs) ? data.jobs : [];
			console.log('[loadJobs] Server jobs:', serverJobs);

			// Smart merge: preserve existing job data and only update what's changed
			if (initialLoadComplete) {
				// Merge server data with existing data, preserving any local updates
				const mergedJobs = serverJobs.map((serverJob: Job) => {
					const existingJob = jobs.find(job => job.id === serverJob.id);
					if (existingJob) {
						// Preserve existing job data but update with server changes
						return { ...existingJob, ...serverJob };
					}
					return serverJob;
				});

				// Add any new jobs that weren't in the server response
				const existingJobIds = new Set(serverJobs.map((job: Job) => job.id));
				const newJobs = jobs.filter((job: Job) => !existingJobIds.has(job.id));

				jobs = [...mergedJobs, ...newJobs];
			} else {
				// Initial load - just set the jobs
				jobs = serverJobs;
				if (serverJobs.length > 0) {
					initialLoadComplete = true;
				}
			}

			// Sort jobs by creation date (newest first)
			jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

		} catch (err) {
			console.error('Failed to load jobs:', err);
			if (!initialLoadComplete) {
				jobs = [];
				error = 'Failed to load jobs';
			}
		} finally {
			loading = false;
		}
	}

	function hasActiveJob(jobType: string): boolean {
		console.log('[hasActiveJob] Checking for job type:', jobType);
		const jobArr = Array.isArray(jobs) ? jobs : [];
		return jobArr.some(
			(job) =>
				job &&
				typeof job.type === 'string' &&
				job.type === jobType &&
				(job.status === 'queued' || job.status === 'running')
		);
	}

	function getActiveJob(jobType: string): Job | undefined {
		const jobArr = Array.isArray(jobs) ? jobs : [];
		return jobArr.find(
			(job) =>
				job &&
				typeof job.type === 'string' &&
				job.type === jobType &&
				(job.status === 'queued' || job.status === 'running')
		);
	}

	async function triggerJob(template: JobTemplate) {
		// Check if there's already an active job of this type
		if (hasActiveJob(template.type)) {
			const activeJob = getActiveJob(template.type);
			toast.error(
				`A ${template.title} job is already ${activeJob?.status}. Please wait for it to complete.`
			);
			return;
		}

		loading = true;
		error = '';

		try {
			// Prepare job data with default values
			const jobData: Record<string, any> = {};
			template.fields.forEach((field) => {
				if (field.default !== undefined) {
					jobData[field.name] = field.default;
				}
			});

			const response = await fetch('/api/v1/jobs', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					type: template.type,
					data: jobData
				})
			});

			const data = await response.json();
			const job = data?.data?.job || data?.job;
			if (job) {
				jobs = [job, ...jobs];
				showJobStatusToast(job, undefined);
				previousJobStatuses[job.id] = job.status;
				toast.success(`${template.title} job has been queued successfully!`);
			} else {
				console.error('Failed to trigger job: job is undefined in response', data);
				toast.error(`Failed to trigger ${template.title} job: job is undefined in response`);
			}
		} catch (err: any) {
			const errorMessage = err?.message || 'Failed to trigger job';
			toast.error(`Failed to trigger ${template.title} job: ${errorMessage}`);
			console.error('Failed to trigger job:', err);
		} finally {
			loading = false;
		}
	}

	async function cancelJob(jobId: string) {
		// Optimistically remove the job from the jobs array
		jobs = jobs.filter((job) => job.id !== jobId);
		try {
			await fetch(`/api/v1/jobs/${jobId}`, {
				method: 'DELETE'
			});
			// The job will be updated via SSE or next poll, but we already removed it for instant feedback
		} catch (err) {
			console.error('Failed to cancel job:', err);
		}
	}

	function getStatusColor(status: Job['status']) {
		switch (status) {
			case 'completed':
				return 'bg-green-100 text-green-700';
			case 'running':
				return 'bg-blue-100 text-blue-700';
			case 'failed':
				return 'bg-red-100 text-red-700';
			case 'cancelled':
				return 'bg-gray-100 text-gray-700';
			default:
				return 'bg-yellow-100 text-yellow-700';
		}
	}

	function getJobIcon(type: string) {
		const template = jobTemplates.find((t) => t.type === type);
		return template?.icon || ListTodo;
	}

	function formatDate(dateString: string | null | undefined): string {
		if (!dateString) return 'N/A';
		try {
			return new Intl.DateTimeFormat('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			}).format(new Date(dateString));
		} catch (e) {
			return 'Invalid Date';
		}
	}

	function getJobTitle(type: string) {
		if (!type || type === 'job_update' || type === 'job_created') {
			return 'Unknown Job';
		}
		const template = jobTemplates.find((t) => t.type === type);
		return template ? template.title : 'Unknown Job';
	}

	function getLastRunDate(jobType: string): string | null {
		// Find the most recent completed job of this type
		const lastJob = jobs
			.filter((job) => job.type === jobType && job.status === 'completed')
			.sort(
				(a, b) =>
					new Date(b.completed_at || b.updated_at).getTime() -
					new Date(a.completed_at || a.updated_at).getTime()
			)[0];

		return lastJob ? formatDate(lastJob.completed_at || lastJob.updated_at) : null;
	}

	function getStatusIcon(status: Job['status']) {
		switch (status) {
			case 'running':
				return Clock;
			case 'queued':
				return '...';
			case 'completed':
				return '✅';
			case 'failed':
				return AlertCircle;
			case 'cancelled':
				return '❌';
			default:
				return Clock;
		}
	}

	function renderStatusIcon(status: Job['status']) {
		const icon = getStatusIcon(status);
		if (typeof icon === 'string') {
			return null; // Return null for string icons
		} else {
			return icon;
		}
	}

	function isStatusIconComponent(status: Job['status']) {
		const icon = getStatusIcon(status);
		return typeof icon !== 'string';
	}

	function getStatusIconText(status: Job['status']) {
		const icon = getStatusIcon(status);
		if (typeof icon === 'string') {
			return icon;
		}
		return '';
	}

	let expandedJobId: string | null = null;
	function toggleJobDetails(jobId: string) {
		if (expandedJobId === jobId) {
			expandedJobId = null;
		} else {
			expandedJobId = jobId;
		}
	}
</script>

<div>
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<ListTodo class="h-8 w-8 text-blue-600 dark:text-gray-400" />
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Jobs</h1>
		</div>
	</div>

	{#if error}
		<div class="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">
			{error}
		</div>
	{/if}

	<!-- Job Templates -->
	<div class="mb-8">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Available Jobs</h2>
			<div class="flex items-center gap-2 text-sm">
				<div class="flex items-center gap-1">
					<div class="h-2 w-2 rounded-full {isConnected ? 'bg-green-500' : 'bg-red-500'}"></div>
					<span class="text-gray-600 dark:text-gray-400">
						{isConnected ? 'Live Updates' : 'Polling'}
					</span>
				</div>
			</div>
		</div>
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each jobTemplates as template}
				{@const activeJob = getActiveJob(template.type)}
				{@const hasActive = hasActiveJob(template.type)}
				<Card
					class="bg-white p-6 dark:bg-gray-800 {hasActive
						? 'bg-blue-50 ring-2 ring-blue-200 dark:bg-blue-900/20'
						: ''}"
				>
					<div class="mb-4 flex items-center justify-between">
						<div class="flex items-center gap-2">
							<svelte:component this={template.icon} class="h-5 w-5 text-gray-400" />
							<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
								{template.title}
							</h3>
						</div>
					</div>
					<div class="mb-4">
						<p class="mb-2 text-sm text-gray-600 dark:text-gray-300">{template.description}</p>
						<div class="flex items-center gap-2 text-xs text-gray-500">
							<Zap class="h-3 w-3" />
							<span>~{template.estimatedTime}</span>
						</div>
						{#if getLastRunDate(template.type)}
							<div class="mt-2 flex items-center gap-2 text-xs text-gray-500">
								<Clock class="h-3 w-3" />
								<span>Last run: {getLastRunDate(template.type)}</span>
							</div>
						{/if}
					</div>

					{#if hasActive && activeJob}
						<div class="mb-4 rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
							<div class="mb-2 flex items-center gap-2">
								{#if activeJob.status === 'running'}
									<Clock class="h-4 w-4 text-blue-600" />
								{:else if activeJob.status === 'queued'}
									<span class="text-blue-600">...</span>
								{:else if activeJob.status === 'completed'}
									<span class="text-blue-600">✅</span>
								{:else if activeJob.status === 'failed'}
									<AlertCircle class="h-4 w-4 text-blue-600" />
								{:else if activeJob.status === 'cancelled'}
									<span class="text-blue-600">❌</span>
								{:else}
									<Clock class="h-4 w-4 text-blue-600" />
								{/if}
								<span class="text-sm font-medium text-blue-800 dark:text-blue-200">
									{activeJob.status === 'running' ? 'Currently Running' : 'Queued'}
								</span>
							</div>
							{#if activeJob.status === 'running' && activeJob.progress !== undefined}
								<div class="mb-2">
									<div class="mb-1 flex justify-between text-xs text-blue-700 dark:text-blue-300">
										<span>Progress</span>
										<span>{Math.round(activeJob.progress)}%</span>
									</div>
									<div class="h-1.5 w-full rounded-full bg-blue-200">
										<div
											class="h-1.5 rounded-full bg-blue-600 transition-all duration-300"
											style="width: {activeJob.progress}%"
										></div>
									</div>
								</div>

								<!-- Detailed Progress Information -->
								{#if activeJob.result && typeof activeJob.result === 'object'}
									{@const progressData = activeJob.result}
									<div class="space-y-2 text-xs text-blue-700 dark:text-blue-300">
										{#if progressData.message}
											<p class="font-medium">{progressData.message}</p>
										{/if}

										{#if progressData.estimatedTimeRemaining}
											<p class="font-medium">ETA: {progressData.estimatedTimeRemaining}</p>
										{/if}
									</div>
								{/if}
							{/if}
							<div class="text-xs text-blue-700 dark:text-blue-300">
								Started: {formatDate(activeJob.started_at || activeJob.created_at)}
							</div>
						</div>
					{/if}

					<Button
						on:click={() => triggerJob(template)}
						disabled={loading || hasActive}
						class="flex w-full cursor-pointer items-center gap-2 {hasActive
							? ''
							: 'dark:text-white'}"
						variant={hasActive ? 'outline' : 'default'}
					>
						{#if hasActive}
							<Clock class="h-4 w-4" />
							{activeJob?.status === 'running' ? 'Running...' : 'Queued...'}
						{:else}
							<Play class="h-4 w-4" />
							Trigger Job
						{/if}
					</Button>
				</Card>
			{/each}
		</div>
	</div>

	<!-- Job History -->
	<div class="mb-8">
		<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">Job History</h2>
		{#if loading || !initialLoadComplete}
			<div class="flex justify-center items-center py-8">
				<Clock class="animate-spin h-6 w-6 text-blue-500" />
				<span class="ml-2 text-blue-500">Loading jobs...</span>
			</div>
		{:else if jobs.filter(job => getJobTitle(job.type) !== 'Unknown Job').length === 0}
			<div class="text-center text-gray-500 dark:text-gray-400 py-8">No jobs found.</div>
		{:else}
			<div class="space-y-4">
				{#each jobs.filter(job => getJobTitle(job.type) !== 'Unknown Job')
					.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
					.slice(0, 5) as job}
					<Card class="p-4">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<svelte:component this={getJobIcon(job.type)} class="h-5 w-5 text-gray-400" />
								<div>
									<h3 class="font-medium text-gray-900 dark:text-gray-100">
										{getJobTitle(job.type)}
									</h3>
									<p class="text-sm text-gray-500">
										Submitted: {formatDate(job.created_at)}
										{#if job.completed_at}
											Completed: {formatDate(job.completed_at)}
										{/if}
									</p>
								</div>
							</div>
							<div class="flex items-center gap-2">
								<span
									class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border border-transparent"
									class:bg-green-100={job.status === 'completed'}
									class:text-green-700={job.status === 'completed'}
									class:border-green-200={job.status === 'completed'}
									class:bg-blue-100={job.status === 'running'}
									class:text-blue-700={job.status === 'running'}
									class:border-blue-200={job.status === 'running'}
									class:bg-yellow-100={job.status === 'queued'}
									class:text-yellow-700={job.status === 'queued'}
									class:border-yellow-200={job.status === 'queued'}
									class:bg-red-100={job.status === 'failed'}
									class:text-red-700={job.status === 'failed'}
									class:border-red-200={job.status === 'failed'}
									class:bg-gray-100={job.status === 'cancelled'}
									class:text-gray-700={job.status === 'cancelled'}
									class:border-gray-200={job.status === 'cancelled'}>
									{#if isStatusIconComponent(job.status)}
										<svelte:component
											this={renderStatusIcon(job.status)}
											class="mr-1 inline h-3 w-3"
										/>
									{/if}
									{job.status.charAt(0).toUpperCase() + job.status.slice(1)}
								</span>
								{#if job.status === 'running' || job.status === 'queued'}
									<button
										on:click={() => cancelJob(job.id)}
										class="ml-2 rounded border border-red-200 bg-white p-1 text-red-600 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 cursor-pointer"
										title="Cancel job"
										aria-label="Cancel job"
										type="button"
									>
										<Trash2 class="h-4 w-4" />
									</button>
								{/if}
							</div>
						</div>
						{#if job.error}
							<div
								class="mt-2 rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
							>
								Error: {job.error}
							</div>
						{/if}

						<!-- Detailed Progress Information for Completed Jobs -->
						{#if job.status === 'completed' && job.result && typeof job.result === 'object'}
							{@const progressData = job.result}
							<div class="mt-2 rounded bg-green-50 p-2 dark:bg-green-900/20">
								{#if job.progress !== undefined}
									<div class="mb-2">
										<div class="mb-1 flex justify-between text-xs text-green-700 dark:text-green-300">
											<span>Final Progress</span>
											<span>{Math.round(job.progress)}%</span>
										</div>
										<div class="h-1.5 w-full rounded-full bg-green-200">
											<div
												class="h-1.5 rounded-full bg-green-600 transition-all duration-300"
												style="width: {job.progress}%"
											></div>
										</div>
									</div>
								{/if}
								<div class="space-y-1 text-xs text-green-700 dark:text-green-300">
									{#if progressData.message}
										<p class="font-medium">{progressData.message}</p>
									{/if}

									{#if progressData.totalProcessed !== undefined && progressData.totalProcessed !== null && progressData.totalPoints !== undefined && progressData.totalPoints !== null}
										<p>
											Processed: {progressData.totalProcessed.toLocaleString()}/{progressData.totalPoints.toLocaleString()} points
										</p>
									{/if}

									{#if progressData.totalSuccess !== undefined && progressData.totalSuccess !== null && progressData.totalErrors !== undefined && progressData.totalErrors !== null}
										<p>
											Success: {progressData.totalSuccess.toLocaleString()} |
											Errors: {progressData.totalErrors.toLocaleString()}
										</p>
									{/if}

									{#if progressData.currentBatch !== undefined && progressData.totalBatches !== undefined}
										<p>
											Batches: {progressData.currentBatch}/{progressData.totalBatches}
										</p>
									{/if}
								</div>
							</div>
						{/if}
					</Card>
				{/each}
			</div>
		{/if}
	</div>
</div>
