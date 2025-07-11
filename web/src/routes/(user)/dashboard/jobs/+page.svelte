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
		AlertCircle,
		Upload,
		X,
		Route
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/button/index.svelte';
	import Card from '$lib/components/ui/card/index.svelte';
	import type { Job } from '$lib/types/job-queue.types';
	import { toast } from 'svelte-sonner';
	import { get } from 'svelte/store';
	import { sessionStore, sessionStoreReady } from '$lib/stores/auth';
	import { supabase } from '$lib/supabase';

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
		requiresFile?: boolean;
	}

	let jobs: Job[] = [];
	let loading = true;
	let error: string | null = null;
	let eventSource: EventSource | null = null;
	let isConnected = false;
	let initialLoadComplete = false;
	let connectionRetries = 0;
	const MAX_RETRIES = 5;

	// Track previous job statuses for toast notifications
	let previousJobStatuses: Record<string, Job['status']> = {};

	// Modal state for file import
	let showImportModal = false;
	let selectedFile: File | null = null;
	let importFormat: string | null = null;
	let fileInputEl: HTMLInputElement | null = null;

	// Modal state for trip generation
	let showTripGenerationModal = false;
	let tripGenerationData = {
		startDate: new Date().toISOString().split('T')[0],
		endDate: new Date().toISOString().split('T')[0],
		useCustomHomeAddress: false,
		customHomeAddress: ''
	};

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
			type: 'trip_generation',
			title: 'Generate trips automatically',
			description: 'Analyze GPS data to automatically detect and create trips based on overnight stays away from home.',
			icon: Route,
			estimatedTime: '5-15 minutes',
			fields: [
				{
					name: 'startDate',
					label: 'Start Date',
					type: 'select',
					description: 'Start date for trip analysis',
					default: new Date().toISOString().split('T')[0],
					options: []
				},
				{
					name: 'endDate',
					label: 'End Date',
					type: 'select',
					description: 'End date for trip analysis',
					default: new Date().toISOString().split('T')[0],
					options: []
				},
				{
					name: 'useCustomHomeAddress',
					label: 'Use Custom Home Address',
					type: 'checkbox',
					description: 'Temporarily use a different home address for this analysis',
					default: false
				}
			]
		},
		{
			type: 'data_import',
			title: 'Data import',
			description: 'Import data from GeoJSON, GPX, or OwnTracks files. Click to select a file.',
			icon: Database,
			estimatedTime: '1-10 minutes',
			fields: [],
			requiresFile: true
		}
	];

	onMount(() => {
		console.log('[Jobs] Component mounted');

		// Subscribe to session store changes for debugging
		const unsubscribeSession = sessionStore.subscribe((session) => {
			console.log('[Jobs] Session store updated:', session ? 'session present' : 'no session');
		});

				// Always try to get session and load jobs immediately
		const loadJobsWithSession = async () => {
			try {
				console.log('[Jobs] Using session from store instead of fetching from Supabase...');

				// Get session from store (which should be populated by the auth store)
				const session = get(sessionStore);
				console.log('[Jobs] Session from store:', session ? 'present' : 'not present');

				if (session?.access_token) {
					console.log('[Jobs] User is authenticated, loading jobs...');
				} else {
					console.log('[Jobs] No session found, will try to load jobs anyway...');
				}

				console.log('[Jobs] About to call loadJobs()...');
				await loadJobs();
				console.log('[Jobs] loadJobs() completed');
			} catch (err) {
				console.error('[Jobs] Failed to load jobs:', err);
				console.error('[Jobs] Error details:', {
					name: err instanceof Error ? err.name : 'Unknown',
					message: err instanceof Error ? err.message : String(err)
				});
			}
		};

		console.log('[Jobs] Calling loadJobsWithSession()...');
		loadJobsWithSession();

		// Delay SSE connection to ensure session is ready
		setTimeout(() => {
			console.log('[Jobs] Starting SSE connection after delay...');
			startEventSource();
		}, 1000);

		// Set a timeout to prevent loading state from getting stuck
		const loadingTimeout = setTimeout(() => {
			if (!initialLoadComplete) {
				console.warn('[Jobs] Loading timeout reached, forcing initialLoadComplete');
				initialLoadComplete = true;
				loading = false;
			}
		}, 15000); // Increased to 15 seconds

		// Reduced polling frequency and only as fallback when SSE is not connected
		const interval = setInterval(() => {
			if (!isConnected) {
				console.log('[Jobs] SSE not connected, falling back to polling');
				loadJobs();
			}
		}, 30000); // 30 seconds

		return () => {
			unsubscribeSession();
			clearTimeout(loadingTimeout);
			clearInterval(interval);
			stopEventSource();
		};
	});

	onDestroy(() => {
		console.log('[Jobs] Component destroyed');
		stopEventSource();
	});

	function startEventSource() {
		try {
			console.log('[Jobs] Starting EventSource connection...');

			// Get the current session to include in the SSE request
			const session = get(sessionStore);
			let sseUrl = '/api/v1/jobs/stream';

			// If we have a session, include the token in the URL (EventSource doesn't support custom headers)
			if (session?.access_token) {
				sseUrl += `?token=${encodeURIComponent(session.access_token)}`;
				console.log('[Jobs] Including token in SSE URL');
			} else {
				console.log('[Jobs] No session token available for SSE');
			}

			// Create EventSource for real-time job updates
			eventSource = new EventSource(sseUrl);
			console.log('[Jobs] EventSource created with URL:', eventSource.url);
			console.log('[Jobs] EventSource readyState:', eventSource.readyState);

			eventSource.onopen = () => {
				console.log('[Jobs] 🔗 Connected to job updates stream');
				console.log('[Jobs] SSE connection established successfully');
				isConnected = true;
				connectionRetries = 0; // Reset retry counter on successful connection
			};

			eventSource.onmessage = (event) => {
				try {
					console.log('[Jobs] SSE message received:', event.data);
					const data = JSON.parse(event.data);
					updateJobStatus(data);
				} catch (err) {
					console.error('[Jobs] Error parsing SSE data:', err);
				}
			};

			eventSource.onerror = (error) => {
				console.error('[Jobs] SSE connection error:', error);
				console.error('[Jobs] SSE error details:', {
					readyState: eventSource?.readyState,
					url: eventSource?.url,
					withCredentials: eventSource?.withCredentials
				});
				isConnected = false;

				// Increment retry counter
				connectionRetries++;

				if (connectionRetries <= MAX_RETRIES) {
					console.log(`[Jobs] Attempting to reconnect SSE (${connectionRetries}/${MAX_RETRIES})...`);
					// Exponential backoff: 1s, 2s, 4s, 8s, 16s
					const delay = Math.min(1000 * Math.pow(2, connectionRetries - 1), 10000);
					setTimeout(() => {
						if (eventSource?.readyState === EventSource.CLOSED) {
							startEventSource();
						}
					}, delay);
				} else {
					console.error('[Jobs] Max SSE retries reached, falling back to polling only');
				}
			};
		} catch (error) {
			console.error('[Jobs] Failed to start EventSource:', error);
			isConnected = false;
		}
	}

	function stopEventSource() {
		if (eventSource) {
			console.log('[Jobs] Stopping EventSource');
			eventSource.close();
			eventSource = null;
			isConnected = false;
		}
	}

	function updateJobStatus(update: any) {
		console.log('[Jobs] [updateJobStatus] Received update:', update);
		if (!update || (typeof update === 'object' && Object.keys(update).length === 0)) {
			console.warn('[Jobs] [updateJobStatus] Ignored empty or falsy update:', update);
			return;
		}

		// Ignore non-job events
		if (!update.job_id && update.type !== 'job_created' && update.type !== 'job_update') {
			console.info('[Jobs] [updateJobStatus] No action needed for update:', update);
			return;
		}

		if (!initialLoadComplete) {
			initialLoadComplete = true;
			console.log('[Jobs] [updateJobStatus] Set initialLoadComplete to true');
		}

		const jobIndex = jobs.findIndex((job) => job.id === update.job_id);

		// Always prefer update.job_type, then update.job?.type, then fallback
		const resolvedType = update.job_type || update.job?.type || (typeof update.type === 'string' ? update.type : 'unknown');

		if (jobIndex !== -1) {
			const prevStatus = jobs[jobIndex].status;
			const prevProgress = jobs[jobIndex].progress;

			jobs[jobIndex] = { ...jobs[jobIndex], ...update, type: resolvedType };
			jobs = [...jobs]; // Trigger reactivity

			console.log(`[Jobs] [updateJobStatus] Updated job ${update.job_id}: status=${update.status}, progress=${update.progress}`);

			// Toast notification for status change
			if (update.status && update.status !== prevStatus) {
				showJobStatusToast(jobs[jobIndex], prevStatus);
			}
			previousJobStatuses[update.job_id] = update.status;

			// Handle final job updates - add a delay before removing from active list
			if (update.status === 'completed' || update.status === 'failed' || update.status === 'cancelled') {
				// Keep the job in the list for a short time so users can see the final progress
				setTimeout(() => {
					// Remove the job from the active list after showing final progress
					const currentJobIndex = jobs.findIndex((job) => job.id === update.job_id);
					if (currentJobIndex !== -1) {
						console.log(`[Jobs] [updateJobStatus] Removing finished job ${update.job_id} from active list after delay`);
						jobs.splice(currentJobIndex, 1);
						jobs = [...jobs]; // Trigger reactivity
					}
				}, 2000); // Keep for 2 seconds to show final progress
			}
		} else if (update.type === 'job_created') {
			console.log('[Jobs] [updateJobStatus] Adding new job from job_created event:', update.job);
			jobs = [update.job, ...jobs];
			showJobStatusToast(update.job, undefined);
			previousJobStatuses[update.job.id] = update.job.status;
		} else if (update.type === 'job_update' && update.job_id) {
			console.log('[Jobs] [updateJobStatus] Adding new job from job_update event:', update);
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

			// Handle final job updates for newly added jobs
			if (update.status === 'completed' || update.status === 'failed' || update.status === 'cancelled') {
				setTimeout(() => {
					const currentJobIndex = jobs.findIndex((job) => job.id === update.job_id);
					if (currentJobIndex !== -1) {
						console.log(`[Jobs] [updateJobStatus] Removing finished job ${update.job_id} from active list after delay`);
						jobs.splice(currentJobIndex, 1);
						jobs = [...jobs]; // Trigger reactivity
					}
				}, 2000); // Keep for 2 seconds to show final progress
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
		const startTime = Date.now();
		try {
			console.log('[Jobs] [loadJobs] Starting to load jobs...');
			console.log('[Jobs] [loadJobs] Function called successfully');
			loading = true;

			const session = get(sessionStore);
			console.log('[Jobs] [loadJobs] Session from store:', session ? 'present' : 'not present');
			console.log('[Jobs] [loadJobs] Session details:', session ? {
				hasAccessToken: !!session.access_token,
				userId: session.user?.id,
				email: session.user?.email
			} : 'no session');
			const headers: Record<string, string> = {};
			if (session?.access_token) {
				headers['Authorization'] = `Bearer ${session.access_token}`;
				console.log('[Jobs] [loadJobs] Using authenticated request with token');
			} else {
				console.log('[Jobs] [loadJobs] No session available, making unauthenticated request');
			}

			console.log('[Jobs] [loadJobs] Making API request to /api/v1/jobs...');
			const apiStartTime = Date.now();

			// Add timeout to prevent hanging requests
			const controller = new AbortController();
			const timeoutId = setTimeout(() => {
				console.error('[Jobs] [loadJobs] Request timeout after 10 seconds');
				controller.abort();
			}, 10000); // Increased timeout to 10 seconds

			const response = await fetch('/api/v1/jobs', {
				headers,
				signal: controller.signal
			});

			clearTimeout(timeoutId);
			const apiTime = Date.now() - apiStartTime;
			console.log(`[Jobs] [loadJobs] API request took ${apiTime}ms, status: ${response.status}`);

			if (!response.ok) {
				console.error('[Jobs] [loadJobs] API request failed:', response.status, response.statusText);
				if (response.status === 401) {
					// Authentication error - this is expected if session is not ready
					console.log('[Jobs] [loadJobs] Authentication required, this is expected');
					error = 'Authentication required. Please refresh the page.';
					jobs = [];
				} else {
					error = `Failed to load jobs: ${response.status} ${response.statusText}`;
				}
				return; // Don't throw, just return
			}

			const data = await response.json();
			console.log('[Jobs] [loadJobs] Raw response:', data);

			if (!data.success) {
				console.error('[Jobs] [loadJobs] API returned error:', data.message);
				error = data.message || 'Failed to load jobs';
				jobs = [];
				return; // Don't throw, just return
			}

			const serverJobs = Array.isArray(data.data) ? data.data : [];
			console.log('[Jobs] [loadJobs] Server jobs count:', serverJobs.length);
			console.log('[Jobs] [loadJobs] Server jobs:', serverJobs);
			console.log('[Jobs] [loadJobs] initialLoadComplete:', initialLoadComplete);

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
				initialLoadComplete = true;
				console.log('[Jobs] [loadJobs] Set initialLoadComplete to true');
			}

			// Sort jobs by creation date (newest first)
			jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
			error = null; // Clear any previous errors

		} catch (err) {
			console.error('[Jobs] [loadJobs] Failed to load jobs:', err);
			if (err instanceof Error && err.name === 'AbortError') {
				error = 'Request timed out. Please try again.';
			} else if (!initialLoadComplete) {
				jobs = [];
				error = 'Failed to load jobs due to network error';
			}
			// Always log the error details for debugging
			console.error('[Jobs] [loadJobs] Error details:', {
				name: err instanceof Error ? err.name : 'Unknown',
				message: err instanceof Error ? err.message : String(err),
				stack: err instanceof Error ? err.stack : undefined
			});
		} finally {
			loading = false;
			const totalTime = Date.now() - startTime;
			console.log(`[Jobs] [loadJobs] Total loading time: ${totalTime}ms`);
		}
	}

	function hasActiveJob(jobType: string): boolean {
		// console.log('[Jobs] [hasActiveJob] Checking for job type:', jobType);
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

	function getJobTitle(type: string): string {
		const template = jobTemplates.find((t) => t.type === type);
		return template?.title || type;
	}

	function getJobIcon(type: string): typeof ListTodo {
		const template = jobTemplates.find((t) => t.type === type);
		return template?.icon || ListTodo;
	}

	function getJobDescription(type: string): string {
		const template = jobTemplates.find((t) => t.type === type);
		return template?.description || '';
	}

	function getJobEstimatedTime(type: string): string {
		const template = jobTemplates.find((t) => t.type === type);
		return template?.estimatedTime || '';
	}

	function getStatusColor(status: Job['status']): string {
		switch (status) {
			case 'queued':
				return 'bg-yellow-500';
			case 'running':
				return 'bg-blue-500';
			case 'completed':
				return 'bg-green-500';
			case 'failed':
				return 'bg-red-500';
			case 'cancelled':
				return 'bg-gray-500';
			default:
				return 'bg-gray-400';
		}
	}

	function getStatusText(status: Job['status']): string {
		switch (status) {
			case 'queued':
				return 'Queued';
			case 'running':
				return 'Running';
			case 'completed':
				return 'Completed';
			case 'failed':
				return 'Failed';
			case 'cancelled':
				return 'Cancelled';
			default:
				return status;
		}
	}

	function formatDuration(startTime: string, endTime?: string): string {
		if (!startTime) return '';

		const start = new Date(startTime);
		const end = endTime ? new Date(endTime) : new Date();
		const diff = end.getTime() - start.getTime();

		const minutes = Math.floor(diff / 60000);
		const seconds = Math.floor((diff % 60000) / 1000);

		if (minutes > 0) {
			return `${minutes}m ${seconds}s`;
		}
		return `${seconds}s`;
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleString();
	}

	async function createJob(type: string, data: Record<string, unknown> = {}, priority: 'low' | 'normal' | 'high' = 'normal') {
		try {
			console.log('[Jobs] [createJob] Creating job:', { type, data, priority });

			const session = get(sessionStore);
			const headers: Record<string, string> = {
				'Content-Type': 'application/json'
			};

			if (session?.access_token) {
				headers['Authorization'] = `Bearer ${session.access_token}`;
			}

			const response = await fetch('/api/v1/jobs', {
				method: 'POST',
				headers,
				body: JSON.stringify({ type, data, priority })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to create job');
			}

			const result = await response.json();
			console.log('[Jobs] [createJob] Job created successfully:', result);

			// Add the new job to the list immediately
			if (result.data?.job) {
				jobs = [result.data.job, ...jobs];
				showJobStatusToast(result.data.job, undefined);
			}

			return result.data?.job;
		} catch (error) {
			console.error('[Jobs] [createJob] Error creating job:', error);
			toast.error('Failed to create job', { description: error instanceof Error ? error.message : 'Unknown error' });
			throw error;
		}
	}

	async function handleJobTemplateClick(template: JobTemplate) {
		if (hasActiveJob(template.type)) {
			toast.error('A job of this type is already running');
			return;
		}

		if (template.requiresFile) {
			showImportModal = true;
			importFormat = template.type;
		} else if (template.type === 'trip_generation') {
			showTripGenerationModal = true;
		} else {
			try {
				await createJob(template.type);
			} catch (error) {
				console.error('Failed to create job:', error);
			}
		}
	}

	async function handleFileImport() {
		if (!selectedFile || !importFormat) return;

		try {
			const formData = new FormData();
			formData.append('file', selectedFile);
			formData.append('format', importFormat);

			const response = await fetch('/api/v1/import', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				throw new Error('Import failed');
			}

			showImportModal = false;
			selectedFile = null;
			importFormat = null;
			toast.success('File uploaded successfully');
		} catch (error) {
			console.error('Import error:', error);
			toast.error('Import failed');
		}
	}

	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			selectedFile = target.files[0];
		}
	}

	async function handleTripGeneration() {
		try {
			const jobData: Record<string, unknown> = {
				startDate: tripGenerationData.startDate,
				endDate: tripGenerationData.endDate,
				useCustomHomeAddress: tripGenerationData.useCustomHomeAddress
			};

			if (tripGenerationData.useCustomHomeAddress && tripGenerationData.customHomeAddress) {
				jobData.customHomeAddress = tripGenerationData.customHomeAddress;
			}

			await createJob('trip_generation', jobData);
			showTripGenerationModal = false;
		} catch (error) {
			console.error('Failed to create trip generation job:', error);
		}
	}

	// Add helper to get last job of a type (any status)
	function getLastJob(type: string): Job | undefined {
		const jobArr = Array.isArray(jobs) ? jobs : [];
		return jobArr
			.filter(
				(job) =>
					job &&
					typeof job.type === 'string' &&
					job.type === type
			)
			.sort((a, b) => new Date(b.completed_at || b.updated_at || b.created_at).getTime() - new Date(a.completed_at || a.updated_at || a.created_at).getTime())[0];
	}

	async function killJob(jobId: string) {
		try {
			console.log('[Jobs] [killJob] Killing job:', jobId);

			const session = get(sessionStore);
			const headers: Record<string, string> = {
				'Content-Type': 'application/json'
			};

			if (session?.access_token) {
				headers['Authorization'] = `Bearer ${session.access_token}`;
			}

			const response = await fetch(`/api/v1/jobs/${jobId}`, {
				method: 'DELETE',
				headers
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to kill job');
			}

			const result = await response.json();
			console.log('[Jobs] [killJob] Job killed successfully:', result);

			toast.success('Job cancelled successfully');
		} catch (error) {
			console.error('[Jobs] [killJob] Error killing job:', error);
			toast.error('Failed to cancel job', { description: error instanceof Error ? error.message : 'Unknown error' });
		}
	}
</script>

<div class="container mx-auto p-6">
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<ListTodo class="h-8 w-8 text-blue-600 dark:text-gray-400" />
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Jobs</h1>
		</div>
	</div>

	<!-- Connection Status -->
	<div class="mb-6">
		<div class="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-xl border border-gray-200">
			<div class="flex items-center gap-2">
				<div class="w-3 h-3 rounded-full {isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}"></div>
				<span class="text-sm font-medium text-gray-700">
					{isConnected ? 'Connected to real-time updates' : 'Using polling fallback'}
				</span>
			</div>
			{#if !isConnected}
				<div class="text-xs text-gray-500">
					(Retry {connectionRetries}/{MAX_RETRIES})
				</div>
			{/if}
		</div>
	</div>

	<!-- Error Display -->
	{#if error}
		<div class="mb-6 p-4 bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 rounded-lg shadow-sm">
			<div class="flex items-center gap-3">
				<div class="p-2 bg-red-100 rounded-full">
					<AlertCircle class="w-5 h-5 text-red-600" />
				</div>
				<div>
					<span class="text-red-800 font-medium">{error}</span>
				</div>
			</div>
		</div>
	{/if}

	<!-- Job Templates -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
		{#each jobTemplates as template (template.type)}
			{#key jobs}
				{@const lastJob = getLastJob(template.type)}
				<Card class="relative flex flex-col justify-between h-full bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-200 p-6">
					<div class="flex-1 flex flex-col gap-4">
						<div class="flex items-center gap-4 mb-2">
							<div class="p-3 bg-blue-50 rounded-xl flex items-center justify-center">
								<svelte:component this={template.icon} class="w-7 h-7 text-blue-600" />
							</div>
							<div>
								<h3 class="font-bold text-lg text-gray-900 leading-tight">{template.title}</h3>
								<p class="text-gray-500 text-sm mt-1 leading-relaxed">{template.description}</p>
							</div>
						</div>
						<div class="mt-2 flex flex-col gap-2">
							{#if lastJob}
								<div class="flex flex-col gap-2">
									<div class="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs">
										<span class="font-medium text-gray-700">Last run:</span>
										<span class="text-gray-800">{lastJob.completed_at ? formatDate(lastJob.completed_at) : lastJob.updated_at ? formatDate(lastJob.updated_at) : formatDate(lastJob.created_at)}</span>
										<span class="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold {lastJob.status === 'completed' ? 'bg-green-100 text-green-700' : lastJob.status === 'failed' ? 'bg-red-100 text-red-700' : lastJob.status === 'cancelled' ? 'bg-gray-100 text-gray-700' : lastJob.status === 'running' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}">
											{getStatusText(lastJob.status)}
										</span>
									</div>
									{#if lastJob.status === 'completed' && lastJob.result}
										{#if typeof lastJob.result === 'string'}
											<div class="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 flex items-center gap-2">
												<span class="font-medium">Result:</span> {lastJob.result}
											</div>
										{:else if lastJob.result.message}
											<div class="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 flex items-center gap-2">
												<span class="font-medium">Result:</span> {lastJob.result.message}
											</div>
										{/if}
									{:else if lastJob.status === 'failed' && lastJob.error}
										<div class="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-center gap-2">
											<span class="font-medium">Error:</span> {lastJob.error}
										</div>
									{:else if lastJob.status === 'cancelled'}
										<div class="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
											<span class="font-medium">Cancelled</span>
										</div>
									{:else if lastJob.status === 'queued'}
										<div class="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-yellow-700 flex items-center gap-2">
											<span class="font-medium">Queued</span>
										</div>
									{:else if lastJob.status === 'running'}
										<div class="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
											<span class="font-medium">Running</span>
										</div>
									{/if}
								</div>
							{:else}
								<div class="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-400">Never run</div>
							{/if}
						</div>
						{#if hasActiveJob(template.type)}
							{@const activeJob = getActiveJob(template.type)}
							{@const isFinished = activeJob?.status === 'completed' || activeJob?.status === 'failed' || activeJob?.status === 'cancelled'}
							{@const progressColor = activeJob?.status === 'completed' ? 'from-green-500 to-green-600' : activeJob?.status === 'failed' ? 'from-red-500 to-red-600' : activeJob?.status === 'cancelled' ? 'from-gray-500 to-gray-600' : 'from-blue-500 to-blue-600'}
							{@const bgColor = activeJob?.status === 'completed' ? 'from-green-50 to-emerald-50' : activeJob?.status === 'failed' ? 'from-red-50 to-pink-50' : activeJob?.status === 'cancelled' ? 'from-gray-50 to-slate-50' : 'from-blue-50 to-indigo-50'}
							{@const borderColor = activeJob?.status === 'completed' ? 'border-green-200' : activeJob?.status === 'failed' ? 'border-red-200' : activeJob?.status === 'cancelled' ? 'border-gray-200' : 'border-blue-200'}
							{@const textColor = activeJob?.status === 'completed' ? 'text-green-800' : activeJob?.status === 'failed' ? 'text-red-800' : activeJob?.status === 'cancelled' ? 'text-gray-800' : 'text-blue-800'}
							{@const statusBgColor = activeJob?.status === 'completed' ? 'bg-green-100 text-green-700' : activeJob?.status === 'failed' ? 'bg-red-100 text-red-700' : activeJob?.status === 'cancelled' ? 'bg-gray-100 text-gray-700' : 'bg-blue-100 text-blue-700'}
							{@const progressBgColor = activeJob?.status === 'completed' ? 'bg-green-200' : activeJob?.status === 'failed' ? 'bg-red-200' : activeJob?.status === 'cancelled' ? 'bg-gray-200' : 'bg-blue-200'}
							<div class="mb-4 p-4 bg-gradient-to-r {bgColor} rounded-lg border {borderColor} {isFinished ? 'animate-pulse' : ''}">
								<div class="flex justify-between text-sm mb-2">
									<span class="font-medium {textColor}">Progress: {activeJob?.progress || 0}%</span>
									<span class="px-2 py-1 {statusBgColor} rounded-full text-xs font-medium">
										{getStatusText(activeJob?.status || 'queued')}
									</span>
								</div>
								<div class="w-full {progressBgColor} rounded-full h-3 shadow-inner">
									<div
										class="h-3 rounded-full transition-all duration-500 bg-gradient-to-r {progressColor} shadow-sm"
										style="width: {activeJob?.progress || 0}%"
									></div>
								</div>

								<!-- Enhanced progress details for data import jobs -->
								{#if template.type === 'data_import' && (activeJob?.result || activeJob?.status === 'running')}
									{@const result = activeJob.result as Record<string, unknown> || {}}
									{@const importedCount = (result.importedCount as number) || 0}
									{@const totalItems = (result.totalItems as number) || 0}
									{@const totalProcessed = (result.totalProcessed as number) || 0}
									{@const message = result.message as string || ''}
									{@const fileName = activeJob.data?.fileName as string || 'Unknown file'}
									{@const format = activeJob.data?.format as string || 'Unknown format'}
									{@const fileSize = activeJob.data?.fileSize as number || 0}

									<div class="mt-3 space-y-2">
										<!-- File information -->
										<div class="text-xs {textColor} flex items-center gap-2 max-w-full overflow-x-auto">
											<Database class="w-3 h-3" />
											<span class="font-medium">File:</span>
											<span
												class="break-all truncate max-w-[12rem] md:max-w-[18rem]"
												title={fileName}
												style="display: inline-block;"
											>
												{fileName}
											</span>
											{#if format}
												<span class="text-gray-500">({format})</span>
											{/if}
											{#if fileSize > 0}
												<span class="text-gray-500">({(fileSize / 1024 / 1024).toFixed(1)} MB)</span>
											{/if}
										</div>

										<!-- Progress message -->
										{#if message}
											<div class="text-xs {textColor} font-medium">
												{message}
											</div>
										{/if}

										<!-- Import statistics -->
										{#if totalProcessed > 0 || importedCount > 0}
											<div class="text-xs {textColor} flex items-center gap-4">
												{#if totalProcessed > 0}
													<span>
														<span class="font-medium">Processed:</span> {totalProcessed.toLocaleString()}
														{#if totalItems > 0}
															/ {totalItems.toLocaleString()}
														{/if}
													</span>
												{/if}
												{#if importedCount > 0}
													<span>
														<span class="font-medium">Imported:</span> {importedCount.toLocaleString()}
													</span>
												{/if}
											</div>
										{/if}

										<!-- ETA calculation for running jobs -->
										{#if activeJob.status === 'running' && activeJob.progress > 0 && activeJob.progress < 100 && activeJob.started_at}
											{@const elapsed = (Date.now() - new Date(activeJob.started_at).getTime()) / 1000}
											{@const estimatedTotal = elapsed / (activeJob.progress / 100)}
											{@const remaining = estimatedTotal - elapsed}
											{#if remaining > 0}
												{@const mins = Math.floor(remaining / 60)}
												{@const secs = Math.round(remaining % 60)}
												<div class="text-xs {textColor} flex items-center gap-1">
													<Clock class="w-3 h-3" />
													ETA: {mins > 0 ? mins + 'm ' : ''}{secs}s remaining
												</div>
											{/if}
										{/if}
									</div>
								{:else if activeJob?.started_at}
									<div class="text-xs {textColor} mt-2 flex items-center gap-1">
										<Clock class="w-3 h-3" />
										Duration: {formatDuration(activeJob.started_at, activeJob.completed_at)}
									</div>
								{/if}

								{#if isFinished}
									<div class="text-xs {textColor} mt-1 flex items-center gap-1">
										<span class="animate-pulse">Job will disappear in a moment...</span>
									</div>
								{/if}
							</div>
						{/if}
					</div>
					<div class="flex justify-center mt-6">
						{#if hasActiveJob(template.type)}
							{@const activeJob = getActiveJob(template.type)}
							{@const isFinished = activeJob?.status === 'completed' || activeJob?.status === 'failed' || activeJob?.status === 'cancelled'}
							{#if isFinished}
								<Button
									disabled
									class="px-6 py-3 w-full md:w-auto {activeJob?.status === 'completed' ? 'bg-green-300' : activeJob?.status === 'failed' ? 'bg-red-300' : 'bg-gray-300'} text-white font-semibold rounded-lg shadow cursor-not-allowed"
									size="lg"
								>
									<div class="flex items-center justify-center gap-2">
										{#if activeJob?.status === 'completed'}
											<div class="w-4 h-4">✅</div>
											<span class="font-medium">Completed</span>
										{:else if activeJob?.status === 'failed'}
											<div class="w-4 h-4">❌</div>
											<span class="font-medium">Failed</span>
										{:else}
											<div class="w-4 h-4">⏹️</div>
											<span class="font-medium">Cancelled</span>
										{/if}
									</div>
								</Button>
							{:else}
								<div class="flex flex-col md:flex-row gap-3 w-full justify-center items-center">
									<Button
										disabled
										class="px-6 py-3 w-full md:w-auto bg-blue-300 text-white font-semibold rounded-lg shadow cursor-not-allowed"
										size="lg"
									>
										<div class="flex items-center justify-center gap-2">
											<div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
											<span class="font-medium">Running...</span>
										</div>
									</Button>
									<Button
										on:click={() => killJob(activeJob!.id)}
										class="px-4 py-3 w-full md:w-auto bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow transition-all duration-200 cursor-pointer"
										size="lg"
									>
										<div class="flex items-center justify-center gap-2">
											<X class="w-4 h-4" />
											<span class="font-medium">Kill Job</span>
										</div>
									</Button>
								</div>
							{/if}
						{:else}
							<Button
								on:click={() => handleJobTemplateClick(template)}
								class="px-6 py-3 w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow transition-all duration-200 cursor-pointer"
								size="lg"
							>
								<div class="flex items-center justify-center gap-2">
									<Play class="w-4 h-4" />
									<span class="font-medium">Start Job</span>
								</div>
							</Button>
						{/if}
					</div>
				</Card>
			{/key}
		{/each}
	</div>


</div>

<!-- Import Modal -->
{#if showImportModal}
	<!-- Modal Overlay -->
	<div class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 transition-all cursor-pointer"
		on:click={() => showImportModal = false}>
		<!-- Modal Box -->
		<div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-200 dark:border-gray-700 relative animate-fade-in cursor-default"
			on:click|stopPropagation>
			<h3 class="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100 text-center">Import Data</h3>
			<div class="space-y-6">
				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select File</label>
					<input
						type="file"
						accept=".json,.gpx,.geojson"
						bind:this={fileInputEl}
						on:change={handleFileSelect}
						class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
					/>
				</div>
				<div class="flex gap-3 mt-4">
					<Button on:click={handleFileImport} disabled={!selectedFile} class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow transition-all duration-200 py-3 px-6 cursor-pointer">
						<span class="flex items-center justify-center gap-2 w-full">
							<Upload class="w-4 h-4 text-white" />
							Import
						</span>
					</Button>
					<Button variant="outline" on:click={() => showImportModal = false} class="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 font-semibold rounded-lg shadow transition-all duration-200 py-3 px-6 cursor-pointer">
						<span class="flex items-center justify-center gap-2 w-full">
							<X class="w-4 h-4 text-gray-700 dark:text-gray-200" />
							Cancel
						</span>
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Trip Generation Modal -->
{#if showTripGenerationModal}
	<!-- Modal Overlay -->
	<div class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 transition-all cursor-pointer"
		on:click={() => showTripGenerationModal = false}>
		<!-- Modal Box -->
		<div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-200 dark:border-gray-700 relative animate-fade-in cursor-default"
			on:click|stopPropagation>
			<h3 class="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100 text-center">Generate Trips</h3>
			<div class="space-y-6">
				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Start Date</label>
					<input
						type="date"
						bind:value={tripGenerationData.startDate}
						class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">End Date</label>
					<input
						type="date"
						bind:value={tripGenerationData.endDate}
						class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
					/>
				</div>
				<div class="flex items-center gap-3">
					<input
						type="checkbox"
						id="useCustomHomeAddress"
						bind:checked={tripGenerationData.useCustomHomeAddress}
						class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
					/>
					<label for="useCustomHomeAddress" class="text-sm font-medium text-gray-700 dark:text-gray-300">
						Use custom home address for this analysis
					</label>
				</div>
				{#if tripGenerationData.useCustomHomeAddress}
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Custom Home Address</label>
						<input
							type="text"
							bind:value={tripGenerationData.customHomeAddress}
							placeholder="Enter custom home address..."
							class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
						/>
					</div>
				{/if}
				<div class="flex gap-3 mt-4">
					<Button on:click={handleTripGeneration} class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow transition-all duration-200 py-3 px-6 cursor-pointer">
						<span class="flex items-center justify-center gap-2 w-full">
							<Route class="w-4 h-4 text-white" />
							Generate Trips
						</span>
					</Button>
					<Button variant="outline" on:click={() => showTripGenerationModal = false} class="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 font-semibold rounded-lg shadow transition-all duration-200 py-3 px-6 cursor-pointer">
						<span class="flex items-center justify-center gap-2 w-full">
							<X class="w-4 h-4 text-gray-700 dark:text-gray-200" />
							Cancel
						</span>
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}
