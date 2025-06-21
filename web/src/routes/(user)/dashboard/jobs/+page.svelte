<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { ListTodo, Play, MapPin, Image, BarChart, Database, Trash2, Users, Settings, Zap, Clock, AlertCircle } from 'lucide-svelte';
	import Button from '$lib/components/ui/button/index.svelte';
	import Card from '$lib/components/ui/card/index.svelte';
	import { apiClient } from '$lib/services/api.service';
	import type { Job, JobPriority } from '$lib/types/job-queue.types';
	import { toast } from 'svelte-sonner';

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
		priority: JobPriority;
		fields: JobField[];
	}

	let jobs: Job[] = [];
	let loading = false;
	let error = '';
	let showJobModal = false;
	let selectedJobTemplate: JobTemplate | null = null;
	let jobPriority: JobPriority = 'normal';
	let jobData: Record<string, any> = {};
	let eventSource: EventSource | null = null;
	let isConnected = false;

	// Track previous job statuses for toast notifications
	let previousJobStatuses: Record<string, Job['status']> = {};

	const jobTemplates: JobTemplate[] = [
		{
			type: 'reverse_geocoding_full',
			title: 'Reverse Geocoding: Full Refresh',
			description: 'Comprehensive location data refresh for all points. This will update all location data with fresh geocoding information.',
			icon: MapPin,
			estimatedTime: '5-10 minutes',
			priority: 'normal' as JobPriority,
			fields: []
		},
		{
			type: 'reverse_geocoding_missing',
			title: 'Reverse Geocoding: Missing Points',
			description: 'Only processes points with missing location data. Faster than full refresh.',
			icon: MapPin,
			estimatedTime: '2-5 minutes',
			priority: 'normal' as JobPriority,
			fields: []
		},
		{
			type: 'trip_cover_generation',
			title: 'Generate Trip Cover Photos',
			description: 'Automatically generates cover photos for trips that are missing them using AI.',
			icon: Image,
			estimatedTime: '3-8 minutes',
			priority: 'low' as JobPriority,
			fields: [
				{
					name: 'style',
					label: 'Cover Style',
					type: 'select',
					options: ['auto', 'landscape', 'portrait', 'minimal'],
					default: 'auto',
					description: 'Style preference for generated covers'
				}
			]
		},
		{
			type: 'statistics_update',
			title: 'Update Statistics',
			description: 'Calculates travel summary, graphs, and reports. Updates all user statistics.',
			icon: BarChart,
			estimatedTime: '2-4 minutes',
			priority: 'normal' as JobPriority,
			fields: [
				{
					name: 'include_charts',
					label: 'Include Charts',
					type: 'checkbox',
					default: true,
					description: 'Generate chart images for statistics'
				}
			]
		},
		{
			type: 'photo_import',
			title: 'Photo Import',
			description: 'Imports new photo data for location tagging and analysis.',
			icon: Database,
			estimatedTime: '5-15 minutes',
			priority: 'low' as JobPriority,
			fields: [
				{
					name: 'source',
					label: 'Import Source',
					type: 'select',
					options: ['auto', 'google_photos', 'icloud', 'local'],
					default: 'auto',
					description: 'Source to import photos from'
				}
			]
		},
		{
			type: 'data_cleanup',
			title: 'Data Cleanup',
			description: 'Cleans up old or invalid data, removes duplicates, and optimizes database.',
			icon: Trash2,
			estimatedTime: '3-7 minutes',
			priority: 'low' as JobPriority,
			fields: [
				{
					name: 'cleanup_level',
					label: 'Cleanup Level',
					type: 'select',
					options: ['light', 'normal', 'aggressive'],
					default: 'normal',
					description: 'How thorough the cleanup should be'
				}
			]
		},
		{
			type: 'user_analysis',
			title: 'User Behavior Analysis',
			description: 'Analyzes user behavior patterns and generates insights.',
			icon: Users,
			estimatedTime: '4-8 minutes',
			priority: 'low' as JobPriority,
			fields: [
				{
					name: 'analysis_period',
					label: 'Analysis Period',
					type: 'select',
					options: ['30_days', '90_days', '1_year', 'all_time'],
					default: '90_days',
					description: 'Time period to analyze'
				}
			]
		}
	];

	onMount(() => {
		loadJobs();
		startEventSource();

		// Fallback polling every 10 seconds if SSE fails
		const interval = setInterval(loadJobs, 10000);

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
				// Reconnect after 5 seconds
				setTimeout(() => {
					if (eventSource?.readyState === EventSource.CLOSED) {
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
		const jobIndex = jobs.findIndex(job => job.id === update.job_id);

		if (jobIndex !== -1) {
			const prevStatus = jobs[jobIndex].status;
			jobs[jobIndex] = { ...jobs[jobIndex], ...update };
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
		}
	}

	function showJobStatusToast(job: Job, prevStatus?: Job['status']) {
		const title = getJobTitle(job.type);
		if (job.status === 'queued' && prevStatus !== 'queued') {
			toast.info(`${title} job queued.`);
		} else if (job.status === 'running' && prevStatus !== 'running') {
			toast(`${title} job started.`, { icon: '🚀' });
		} else if (job.status === 'completed' && prevStatus !== 'completed') {
			if (job.error) {
				toast.error(`${title} job failed.`, { description: job.error });
			} else {
				toast.success(`${title} job completed successfully!`);
			}
		} else if (job.status === 'failed' && prevStatus !== 'failed') {
			toast.error(`${title} job failed.`, { description: job.error });
		} else if (job.status === 'cancelled' && prevStatus !== 'cancelled') {
			toast(`${title} job was cancelled.`, { icon: '❌' });
		}
	}

	async function loadJobs() {
		try {
			const response = await apiClient.get<{ jobs: Job[]; total: number }>('/jobs');
			jobs = response.jobs;
		} catch (err) {
			console.error('Failed to load jobs:', err);
			error = 'Failed to load jobs';
		}
	}

	function hasActiveJob(jobType: string): boolean {
		return jobs.some(job =>
			job.type === jobType &&
			(job.status === 'queued' || job.status === 'running')
		);
	}

	function getActiveJob(jobType: string): Job | undefined {
		return jobs.find(job =>
			job.type === jobType &&
			(job.status === 'queued' || job.status === 'running')
		);
	}

	function openJobModal(template: JobTemplate) {
		// Check if there's already an active job of this type
		if (hasActiveJob(template.type)) {
			const activeJob = getActiveJob(template.type);
			error = `A ${template.title} job is already ${activeJob?.status}. Please wait for it to complete.`;
			return;
		}

		selectedJobTemplate = template;
		jobPriority = template.priority;
		jobData = {};
		error = ''; // Clear any previous errors

		// Set default values for fields
		template.fields.forEach(field => {
			if (field.default !== undefined) {
				jobData[field.name] = field.default;
			}
		});

		showJobModal = true;
	}

	function closeJobModal() {
		showJobModal = false;
		selectedJobTemplate = null;
		jobData = {};
		error = '';
	}

	async function triggerJob() {
		if (!selectedJobTemplate) return;

		// Double-check that no active job exists
		if (hasActiveJob(selectedJobTemplate.type)) {
			error = `A ${selectedJobTemplate.title} job is already running. Please wait for it to complete.`;
			return;
		}

		loading = true;
		error = '';
		try {
			await apiClient.post('/jobs', {
				type: selectedJobTemplate.type,
				data: jobData,
				priority: jobPriority
			});
			closeJobModal();
		} catch (err) {
			error = 'Failed to trigger job';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	async function cancelJob(jobId: string) {
		try {
			await apiClient.delete(`/jobs/${jobId}`);
			// The job will be updated via SSE or next poll
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

	function getPriorityColor(priority: JobPriority) {
		switch (priority) {
			case 'urgent':
				return 'bg-red-100 text-red-700';
			case 'high':
				return 'bg-orange-100 text-orange-700';
			case 'normal':
				return 'bg-blue-100 text-blue-700';
			case 'low':
				return 'bg-gray-100 text-gray-700';
			default:
				return 'bg-blue-100 text-blue-700';
		}
	}

	function getJobIcon(type: string) {
		const template = jobTemplates.find(t => t.type === type);
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
		const template = jobTemplates.find(t => t.type === type);
		return template?.title || type;
	}

	function getLastRunDate(jobType: string): string | null {
		// Find the most recent completed job of this type
		const lastJob = jobs
			.filter(job => job.type === jobType && job.status === 'completed')
			.sort((a, b) => new Date(b.completed_at || b.updated_at).getTime() - new Date(a.completed_at || a.updated_at).getTime())[0];

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
			return icon;
		} else {
			return icon;
		}
	}

	function isStatusIconComponent(status: Job['status']) {
		const icon = getStatusIcon(status);
		return typeof icon !== 'string';
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
			<ListTodo class="h-7 w-7 text-[rgb(37,140,244)]" />
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Jobs</h1>
		</div>
	</div>

	{#if error}
		<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6">
			{error}
		</div>
	{/if}

	<!-- Job Templates -->
	<div class="mb-8">
		<div class="flex items-center justify-between mb-4">
			<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Available Jobs</h2>
			<div class="flex items-center gap-2 text-sm">
				<div class="flex items-center gap-1">
					<div class="w-2 h-2 rounded-full {isConnected ? 'bg-green-500' : 'bg-red-500'}"></div>
					<span class="text-gray-600 dark:text-gray-400">
						{isConnected ? 'Live Updates' : 'Polling'}
					</span>
				</div>
			</div>
		</div>
		<div class="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
			{#each jobTemplates as template}
				{@const activeJob = getActiveJob(template.type)}
				{@const hasActive = hasActiveJob(template.type)}
				<Card class="p-6 bg-white dark:bg-gray-800 {hasActive ? 'ring-2 ring-blue-200 bg-blue-50 dark:bg-blue-900/20' : ''}">
					<div class="flex items-center justify-between mb-4">
						<div class="flex items-center gap-2">
							<svelte:component this={template.icon} class="h-5 w-5 text-gray-400" />
							<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{template.title}</h3>
						</div>
					</div>
					<div class="mb-4">
						<p class="text-sm text-gray-600 dark:text-gray-300 mb-2">{template.description}</p>
						<div class="flex items-center gap-2 text-xs text-gray-500">
							<Zap class="h-3 w-3" />
							<span>~{template.estimatedTime}</span>
						</div>
						{#if getLastRunDate(template.type)}
							<div class="flex items-center gap-2 text-xs text-gray-500 mt-2">
								<Clock class="h-3 w-3" />
								<span>Last run: {getLastRunDate(template.type)}</span>
							</div>
						{/if}
					</div>

					{#if hasActive && activeJob}
						<div class="mb-4 p-3 bg-blue-100 dark:bg-blue-900/30 rounded-md">
							<div class="flex items-center gap-2 mb-2">
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
									<div class="flex justify-between text-xs text-blue-700 dark:text-blue-300 mb-1">
										<span>Progress</span>
										<span>{Math.round(activeJob.progress)}%</span>
									</div>
									<div class="w-full bg-blue-200 rounded-full h-1.5">
										<div
											class="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
											style="width: {activeJob.progress}%"
										></div>
									</div>
								</div>
							{/if}
							<div class="text-xs text-blue-700 dark:text-blue-300">
								Started: {formatDate(activeJob.started_at || activeJob.created_at)}
							</div>
						</div>
					{/if}

					<Button
						on:click={() => openJobModal(template)}
						disabled={loading || hasActive}
						class="flex items-center gap-2 w-full cursor-pointer {hasActive ? '' : 'dark:text-white'}"
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

	<!-- Job Creation Modal -->
	{#if showJobModal && selectedJobTemplate}
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
			<Card class="w-full max-w-md p-6">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
						Create Job: {selectedJobTemplate.title}
					</h3>
					<Button
						on:click={closeJobModal}
						variant="ghost"
						size="sm"
						class="h-8 w-8 p-0"
					>
						×
					</Button>
				</div>

				<div class="space-y-4">
					<!-- Priority Selection -->
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2" for="priority">
							Priority
						</label>
						<select
							bind:value={jobPriority}
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
							id="priority"
						>
							<option value="low">Low</option>
							<option value="normal">Normal</option>
							<option value="high">High</option>
							<option value="urgent">Urgent</option>
						</select>
					</div>

					<!-- Job-specific fields -->
					{#if selectedJobTemplate.fields.length > 0}
						<div class="space-y-3">
							<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">Configuration</h4>
							{#each selectedJobTemplate.fields as field}
								<div>
									<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" for={field.name}>
										{field.label}
									</label>
									{#if field.type === 'select'}
										<select
											bind:value={jobData[field.name]}
											class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
											id={field.name}
										>
											{#if field.options}
												{#each field.options as option}
													<option value={option}>{option.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</option>
												{/each}
											{/if}
										</select>
									{:else if field.type === 'checkbox'}
										<label class="flex items-center">
											<input
												type="checkbox"
												bind:checked={jobData[field.name]}
												class="mr-2"
											/>
											<span class="text-sm text-gray-600 dark:text-gray-400">{field.description}</span>
										</label>
									{/if}
									{#if field.description && field.type !== 'checkbox'}
										<p class="text-xs text-gray-500 mt-1">{field.description}</p>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					<!-- Job Info -->
					<div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
						<div class="flex items-center justify-between text-sm">
							<span class="text-gray-600 dark:text-gray-400">Estimated Time:</span>
							<span class="font-medium">{selectedJobTemplate.estimatedTime}</span>
						</div>
					</div>

					<!-- Action Buttons -->
					<div class="flex gap-2 pt-4">
						<Button
							on:click={closeJobModal}
							variant="outline"
							class="flex-1"
						>
							Cancel
						</Button>
						<Button
							on:click={triggerJob}
							disabled={loading}
							class="flex-1 flex items-center gap-2 cursor-pointer dark:text-white"
						>
							{#if loading}
								<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
							{:else}
								<Play class="h-4 w-4" />
							{/if}
							{loading ? 'Creating...' : 'Create Job'}
						</Button>
					</div>
				</div>
			</Card>
		</div>
	{/if}
</div>