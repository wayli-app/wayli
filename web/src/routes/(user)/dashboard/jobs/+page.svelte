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
	import TripGenerationModal from '$lib/components/modals/TripGenerationModal.svelte';
	import ConfirmationModal from '$lib/components/modals/ConfirmationModal.svelte';
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

	// Trip generation data
	let tripGenerationData = {
		startDate: new Date().toISOString().split('T')[0],
		endDate: new Date().toISOString().split('T')[0],
		useCustomHomeAddress: false,
		customHomeAddress: ''
	};

	// Trip generation modal state
	let showTripGenerationModal = false;

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
			description:
				'Analyze GPS data to automatically detect and create trips based on overnight stays away from home.',
			icon: Route,
			estimatedTime: '5-15 minutes',
			fields: [
				{
					name: 'startDate',
					label: 'Start Date',
					type: 'select',
					description: 'Start date for trip analysis (leave empty for automatic detection)',
					default: new Date().toISOString().split('T')[0],
					options: []
				},
				{
					name: 'endDate',
					label: 'End Date',
					type: 'select',
					description: 'End date for trip analysis (leave empty for automatic detection)',
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

			// Use the session cookie instead of passing token in URL
			let sseUrl = '/api/v1/jobs/stream';
			console.log('[Jobs] Using session-based authentication for SSE');

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
					console.log(
						`[Jobs] Attempting to reconnect SSE (${connectionRetries}/${MAX_RETRIES})...`
					);
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
		const resolvedType =
			update.job_type ||
			update.job?.type ||
			(typeof update.type === 'string' ? update.type : 'unknown');

		if (jobIndex !== -1) {
			const prevStatus = jobs[jobIndex].status;
			const prevProgress = jobs[jobIndex].progress;

			jobs[jobIndex] = { ...jobs[jobIndex], ...update, type: resolvedType };
			jobs = [...jobs]; // Trigger reactivity

			console.log(
				`[Jobs] [updateJobStatus] Updated job ${update.job_id}: status=${update.status}, progress=${update.progress}`
			);

			// Toast notification for status change
			if (update.status && update.status !== prevStatus) {
				showJobStatusToast(jobs[jobIndex], prevStatus);
			}
			previousJobStatuses[update.job_id] = update.status;

			// Handle final job updates - add a delay before removing from active list
			if (
				update.status === 'completed' ||
				update.status === 'failed' ||
				update.status === 'cancelled'
			) {
				// Keep the job in the list for a short time so users can see the final progress
				setTimeout(() => {
					// Remove the job from the active list after showing final progress
					const currentJobIndex = jobs.findIndex((job) => job.id === update.job_id);
					if (currentJobIndex !== -1) {
						console.log(
							`[Jobs] [updateJobStatus] Removing finished job ${update.job_id} from active list after delay`
						);
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
			if (
				update.status === 'completed' ||
				update.status === 'failed' ||
				update.status === 'cancelled'
			) {
				setTimeout(() => {
					const currentJobIndex = jobs.findIndex((job) => job.id === update.job_id);
					if (currentJobIndex !== -1) {
						console.log(
							`[Jobs] [updateJobStatus] Removing finished job ${update.job_id} from active list after delay`
						);
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
			console.log(
				'[Jobs] [loadJobs] Session details:',
				session
					? {
							hasAccessToken: !!session.access_token,
							userId: session.user?.id,
							email: session.user?.email
						}
					: 'no session'
			);
			const headers: Record<string, string> = {};
			// Removed: if (session?.access_token) { ... }
			console.log('[Jobs] [loadJobs] No session available, making unauthenticated request');

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
				console.error(
					'[Jobs] [loadJobs] API request failed:',
					response.status,
					response.statusText
				);
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
					const existingJob = jobs.find((job) => job.id === serverJob.id);
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

	async function createJob(
		type: string,
		data: Record<string, unknown> = {},
		priority: 'low' | 'normal' | 'high' = 'normal'
	) {
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
			toast.error('Failed to create job', {
				description: error instanceof Error ? error.message : 'Unknown error'
			});
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
			// Reset trip generation data to empty dates to match trips page behavior
			tripGenerationData = {
				startDate: '',
				endDate: '',
				useCustomHomeAddress: false,
				customHomeAddress: ''
			};
			showTripGenerationModal = true;
		} else if (template.type === 'reverse_geocoding_missing') {
			try {
				await createJob(template.type, {});
			} catch (error) {
				console.error('Failed to create job:', error);
			}
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
		const jobsOfType = jobArr.filter(
			(job) => job && typeof job.type === 'string' && job.type === type
		);

		console.log(`[Jobs] [getLastJob] Looking for jobs of type: ${type}`);
		console.log(`[Jobs] [getLastJob] Total jobs available: ${jobArr.length}`);
		console.log(
			`[Jobs] [getLastJob] Jobs of type ${type}:`,
			jobsOfType.map((j) => ({ id: j.id, status: j.status, completed_at: j.completed_at }))
		);

		if (jobsOfType.length === 0) return undefined;

		// First try to find the most recent completed job
		const completedJobs = jobsOfType.filter((job) => job.status === 'completed');
		console.log(`[Jobs] [getLastJob] Completed jobs of type ${type}:`, completedJobs.length);

		if (completedJobs.length > 0) {
			const lastCompleted = completedJobs.sort(
				(a, b) =>
					new Date(b.completed_at || b.updated_at || b.created_at).getTime() -
					new Date(a.completed_at || a.updated_at || a.created_at).getTime()
			)[0];
			console.log(`[Jobs] [getLastJob] Returning last completed job:`, {
				id: lastCompleted.id,
				status: lastCompleted.status,
				completed_at: lastCompleted.completed_at
			});
			return lastCompleted;
		}

		// If no completed jobs, return the most recent job of any status
		const lastJob = jobsOfType.sort(
			(a, b) =>
				new Date(b.completed_at || b.updated_at || b.created_at).getTime() -
				new Date(a.completed_at || a.updated_at || a.created_at).getTime()
		)[0];
		console.log(`[Jobs] [getLastJob] Returning last job (any status):`, {
			id: lastJob.id,
			status: lastJob.status,
			completed_at: lastJob.completed_at
		});
		return lastJob;
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
			toast.error('Failed to cancel job', {
				description: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	}

	// Trip generation modal functions
	function openTripGenerationModal() {
		showTripGenerationModal = true;
	}

	function handleTripGenerationClose() {
		showTripGenerationModal = false;
	}

	function handleTripGenerationSubmit(event: CustomEvent) {
		const data = event.detail;
		tripGenerationData = { ...data };
		handleTripGeneration();
	}
</script>

<div class="container mx-auto p-6">
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3">
			<ListTodo class="h-8 w-8 text-blue-600 dark:text-gray-400" />
			<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
				Background jobs
			</h1>
		</div>
	</div>

	<!-- Connection Status -->
	<div class="mb-6">
		<div class="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2">
			<div class="flex items-center gap-2">
				<div
					class="h-3 w-3 rounded-full {isConnected ? 'animate-pulse bg-green-500' : 'bg-red-500'}"
				></div>
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
		<div
			class="mb-6 rounded-lg border border-red-200 bg-gradient-to-r from-red-50 to-pink-50 p-4 shadow-sm"
		>
			<div class="flex items-center gap-3">
				<div class="rounded-full bg-red-100 p-2">
					<AlertCircle class="h-5 w-5 text-red-600" />
				</div>
				<div>
					<span class="font-medium text-red-800">{error}</span>
				</div>
			</div>
		</div>
	{/if}

	<!-- Active Jobs Progress Display -->
	{#if jobs.filter((job) => job.status === 'running' || job.status === 'queued').length > 0}
		<div class="mb-8">
			<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">Active Jobs</h2>
			<div class="space-y-4">
				{#each jobs.filter((job) => job.status === 'running' || job.status === 'queued') as job (job.id)}
					<div
						class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
					>
						<div class="mb-3 flex items-center justify-between">
							<div class="flex items-center gap-3">
								<div class="rounded-lg bg-blue-50 p-2 dark:bg-blue-900/20">
									{#if job.type === 'reverse_geocoding_missing'}
										<MapPin class="h-5 w-5 text-blue-600 dark:text-blue-400" />
									{:else if job.type === 'data_import'}
										<Upload class="h-5 w-5 text-blue-600 dark:text-blue-400" />
									{:else if job.type === 'trip_generation'}
										<Route class="h-5 w-5 text-blue-600 dark:text-blue-400" />
									{:else}
										<Database class="h-5 w-5 text-blue-600 dark:text-blue-400" />
									{/if}
								</div>
								<div>
									<h3 class="font-semibold text-gray-900 dark:text-gray-100">
										{getJobTitle(job.type)}
									</h3>
									<p class="text-sm text-gray-500 dark:text-gray-400">
										Job ID: {job.id}
									</p>
								</div>
							</div>
							<div class="flex items-center gap-2">
								<button
									on:click={() => killJob(job.id)}
									class="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
									title="Cancel job"
								>
									<X class="h-4 w-4" />
								</button>
							</div>
						</div>

						<!-- Progress Bar -->
						<div class="mb-3">
							<div class="mb-1 flex items-center justify-between">
								<span class="text-sm font-medium text-gray-700 dark:text-gray-300">
									Progress: {job.progress}%
								</span>
								<span class="text-sm text-gray-500 dark:text-gray-400">
									{job.status === 'running' ? 'Running' : 'Queued'}
								</span>
							</div>
							<div class="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
								<div
									class="h-2 rounded-full bg-blue-600 transition-all duration-300"
									style="width: {job.progress}%"
								></div>
							</div>
						</div>

						<!-- Detailed Progress Information -->
						{#if job.result}
							{@const result = job.result as Record<string, unknown>}
							<div class="space-y-2 text-sm">
								{#if result.message}
									<p class="text-gray-700 dark:text-gray-300">
										{result.message as string}
									</p>
								{/if}
								<!-- For reverse geocoding jobs -->
								{#if job.type === 'reverse_geocoding_missing' && result.processedCount !== undefined}
									<div class="grid grid-cols-3 gap-4 text-xs">
										<div class="rounded bg-green-50 p-2 dark:bg-green-900/20">
											<div class="font-semibold text-green-700 dark:text-green-300">
												{(result.successCount as number)?.toLocaleString() || 0}
											</div>
											<div class="text-green-600 dark:text-green-400">Successful</div>
										</div>
										<div class="rounded bg-red-50 p-2 dark:bg-red-900/20">
											<div class="font-semibold text-red-700 dark:text-red-300">
												{(result.errorCount as number)?.toLocaleString() || 0}
											</div>
											<div class="text-red-600 dark:text-red-400">Errors</div>
										</div>
										<div class="rounded bg-blue-50 p-2 dark:bg-blue-900/20">
											<div class="font-semibold text-blue-700 dark:text-blue-300">
												{(result.processedCount as number)?.toLocaleString() || 0} / {(
													result.totalCount as number
												)?.toLocaleString() || 0}
											</div>
											<div class="text-blue-600 dark:text-blue-400">Processed</div>
										</div>
									</div>
								{/if}

								<!-- For import jobs -->
								{#if job.type === 'data_import' && result.importedCount !== undefined}
									<div class="grid grid-cols-2 gap-4 text-xs">
										<div class="rounded bg-green-50 p-2 dark:bg-green-900/20">
											<div class="font-semibold text-green-700 dark:text-green-300">
												{(result.importedCount as number)?.toLocaleString() || 0}
											</div>
											<div class="text-green-600 dark:text-green-400">Imported</div>
										</div>
										<div class="rounded bg-blue-50 p-2 dark:bg-blue-900/20">
											<div class="font-semibold text-blue-700 dark:text-blue-300">
												{(result.totalItems as number)?.toLocaleString() || 0}
											</div>
											<div class="text-blue-600 dark:text-blue-400">Total Items</div>
										</div>
									</div>
								{/if}

								{#if result.estimatedTimeRemaining}
									<p class="text-gray-500 dark:text-gray-400">
										ETA: {result.estimatedTimeRemaining as string}
									</p>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Job Templates -->
	<div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
		{#each jobTemplates as template (template.type)}
			{#key jobs}
				{@const lastJob = getLastJob(template.type)}
				<Card
					class="relative flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
				>
					<!-- Header: Icon + Title/Description -->
					<div class="flex h-[112px] flex-row items-start gap-4 overflow-hidden">
						<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 p-3">
							<svelte:component this={template.icon} class="h-7 w-7 text-blue-600" />
						</div>
						<div class="flex flex-1 flex-col justify-center">
							<h3 class="text-lg leading-tight font-bold text-gray-900 dark:text-gray-100">
								{template.title}
							</h3>
							<p class="mt-1 line-clamp-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
								{template.description}
							</p>
						</div>
					</div>
					<!-- Divider -->
					<div class="my-4 w-full border-t border-gray-200 dark:border-gray-700"></div>
					<!-- Status Section -->
					<div class="flex min-h-[48px] flex-col justify-center">
						{#if lastJob}
							<div
								class="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-gray-600 dark:bg-gray-700"
							>
								<span class="font-medium text-gray-700 dark:text-gray-300">Last run:</span>
								<span class="text-gray-800 dark:text-gray-200"
									>{lastJob.completed_at
										? formatDate(lastJob.completed_at)
										: lastJob.updated_at
											? formatDate(lastJob.updated_at)
											: formatDate(lastJob.created_at)}</span
								>
								<span
									class="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold {lastJob.status ===
									'completed'
										? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
										: lastJob.status === 'failed'
											? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
											: lastJob.status === 'cancelled'
												? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
												: lastJob.status === 'running'
													? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
													: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'}"
								>
									{getStatusText(lastJob.status)}
								</span>
							</div>
						{:else}
							<div
								class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-500"
							>
								Never run
							</div>
						{/if}
					</div>
					<!-- Spacer to push button to bottom -->
					<div class="flex-1"></div>
					<!-- Action Button -->
					<div class="mt-6 flex justify-center">
						{#if hasActiveJob(template.type)}
							{@const activeJob = getActiveJob(template.type)}
							{@const isFinished =
								activeJob?.status === 'completed' ||
								activeJob?.status === 'failed' ||
								activeJob?.status === 'cancelled'}
							{#if isFinished}
								<Button
									disabled
									class="w-full px-6 py-3 md:w-auto {activeJob?.status === 'completed'
										? 'bg-green-300'
										: activeJob?.status === 'failed'
											? 'bg-red-300'
											: 'bg-gray-300'} cursor-not-allowed rounded-lg font-semibold text-white shadow"
									size="lg"
								>
									<div class="flex items-center justify-center gap-2">
										{#if activeJob?.status === 'completed'}
											<div class="h-4 w-4">✅</div>
											<span class="font-medium">Completed</span>
										{:else if activeJob?.status === 'failed'}
											<div class="h-4 w-4">❌</div>
											<span class="font-medium">Failed</span>
										{:else}
											<div class="h-4 w-4">⏹️</div>
											<span class="font-medium">Cancelled</span>
										{/if}
									</div>
								</Button>
							{:else}
								<div class="flex w-full flex-col items-center justify-center gap-3 md:flex-row">
									<Button
										disabled
										class="w-full cursor-not-allowed rounded-lg bg-blue-300 px-6 py-3 font-semibold text-white shadow md:w-auto"
										size="lg"
									>
										<div class="flex items-center justify-center gap-2">
											<div
												class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
											></div>
											<span class="font-medium">Running...</span>
										</div>
									</Button>
									<Button
										on:click={() => killJob(activeJob!.id)}
										class="w-full cursor-pointer rounded-lg bg-red-600 px-4 py-3 font-semibold text-white shadow transition-all duration-200 hover:bg-red-700 md:w-auto"
										size="lg"
									>
										<div class="flex items-center justify-center gap-2">
											<X class="h-4 w-4" />
											<span class="font-medium">Kill Job</span>
										</div>
									</Button>
								</div>
							{/if}
						{:else}
							<Button
								on:click={() =>
									template.type === 'trip_generation'
										? openTripGenerationModal()
										: handleJobTemplateClick(template)}
								class="w-full cursor-pointer rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow transition-all duration-200 hover:bg-blue-700 md:w-auto"
								size="lg"
							>
								<div class="flex items-center justify-center gap-2">
									<Play class="h-4 w-4" />
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
	<div
		class="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/40 backdrop-blur-sm transition-all"
		on:click={() => (showImportModal = false)}
		on:keydown={(e) => e.key === 'Escape' && (showImportModal = false)}
		role="dialog"
		aria-modal="true"
		aria-labelledby="import-modal-title"
		tabindex="-1"
	>
		<!-- Modal Box -->
		<div
			class="animate-fade-in relative w-full max-w-md cursor-default rounded-2xl border border-gray-200 bg-white p-8 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
			on:click|stopPropagation
			role="document"
			tabindex="-1"
		>
			<h3 id="import-modal-title" class="mb-6 text-center text-2xl font-bold text-gray-900 dark:text-gray-100">
				Import Data
			</h3>
			<div class="space-y-6">
				<div>
					<label for="file-input" class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>Select File</label
					>
					<input
						id="file-input"
						type="file"
						accept=".json,.gpx,.geojson"
						bind:this={fileInputEl}
						on:change={handleFileSelect}
						class="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-gray-900 transition focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
					/>
				</div>
				<div class="mt-4 flex gap-3">
					<Button
						on:click={handleFileImport}
						disabled={!selectedFile}
						class="flex-1 cursor-pointer rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow transition-all duration-200 hover:bg-blue-700"
					>
						<span class="flex w-full items-center justify-center gap-2">
							<Upload class="h-4 w-4 text-white" />
							Import
						</span>
					</Button>
					<Button
						variant="outline"
						on:click={() => (showImportModal = false)}
						class="flex-1 cursor-pointer rounded-lg border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 shadow transition-all duration-200 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
					>
						<span class="flex w-full items-center justify-center gap-2">
							<X class="h-4 w-4 text-gray-700 dark:text-gray-200" />
							Cancel
						</span>
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Trip Generation Modal -->
<TripGenerationModal
	open={showTripGenerationModal}
	bind:startDate={tripGenerationData.startDate}
	bind:endDate={tripGenerationData.endDate}
	bind:useCustomHomeAddress={tripGenerationData.useCustomHomeAddress}
	bind:customHomeAddress={tripGenerationData.customHomeAddress}
	on:close={handleTripGenerationClose}
	on:generate={handleTripGenerationSubmit}
/>
