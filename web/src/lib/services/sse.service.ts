// web/src/lib/services/sse.service.ts
import { ServiceAdapter } from './api/service-adapter';
import { sessionStore } from '../stores/auth';
import { get } from 'svelte/store';
import { supabase } from '../supabase';

export interface SSEEvent {
	type: 'connected' | 'heartbeat' | 'jobs_update' | 'error';
	message?: string;
	jobs?: JobUpdate[];
	timestamp?: string;
	error?: string;
}

export interface JobUpdate {
	id: string;
	type: string;
	status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
	progress: number;
	error?: string | null;
	result?: Record<string, unknown>;
	updated_at: string;
	created_at: string;
}

export interface SSEOptions {
	onConnected?: () => void;
	onDisconnected?: () => void;
	onError?: (error: string) => void;
	onJobUpdate?: (jobs: JobUpdate[]) => void;
	onJobCompleted?: (jobs: JobUpdate[]) => void;
	onHeartbeat?: () => void;
}

	export class SSEService {
		private eventSource: EventSource | null = null;
		private reconnectAttempts = 0;
		private maxReconnectAttempts = 5;
		private reconnectDelay = 1000;
		private isConnecting = false;
		private isDisconnected = false;
		private options: SSEOptions;
		private lastJobUpdate = new Map<string, JobUpdate>();
		private jobCompletionTimeouts = new Map<string, NodeJS.Timeout>();
		private jobType?: string;
		private jobId?: string;
		private tokenRefreshInterval?: NodeJS.Timeout;

		constructor(options: SSEOptions, jobType?: string, jobId?: string) {
			this.options = options;
			this.jobType = jobType;
			this.jobId = jobId;
		}

	async connect(): Promise<void> {
		if (this.isConnecting || this.isDisconnected) {
			return;
		}

		this.isConnecting = true;

		try {
			let session = get(sessionStore);
			// If no session in store, try to get it directly from Supabase
			if (!session || !session.access_token) {
				try {
					const { data: { session: currentSession }, error } = await supabase.auth.getSession();
					if (error) {
						console.error('🔗 SSE: Error getting session from Supabase:', error);
						this.isConnecting = false;
						return;
					}
					if (currentSession) {
						session = currentSession;
					} else {
						setTimeout(() => {
							this.connect().catch(() => {
								// Ignore connection errors in retry
							});
						}, 2000);
						this.isConnecting = false;
						return;
					}
				} catch (error) {
					console.error('🔗 SSE: Error getting session:', error);
					this.isConnecting = false;
					return;
				}
			}

			// Check if token is expired and refresh if needed
			const now = Math.floor(Date.now() / 1000);
			if (session.expires_at && session.expires_at < now) {
				console.log('🔄 SSE: Token expired, refreshing...');
				try {
					const { data, error } = await supabase.auth.refreshSession();
					if (error) {
						console.error('❌ SSE: Failed to refresh token:', error);
						this.isConnecting = false;
						return;
					}
					if (data.session) {
						session = data.session;
					} else {
						console.error('❌ SSE: No session returned from refresh');
						this.isConnecting = false;
						return;
					}
				} catch (refreshError) {
					console.error('❌ SSE: Error refreshing token:', refreshError);
					this.isConnecting = false;
					return;
				}
			}

			const serviceAdapter = new ServiceAdapter({ session });
			const response = await serviceAdapter.getJobStream();

			if (!response.ok) {
				throw new Error(`Failed to connect to SSE stream: ${response.status}`);
			}

			// Create EventSource from the response
			const reader = response.body?.getReader();

			if (!reader) {
				throw new Error('No response body available');
			}

			const decoder = new TextDecoder();
			let buffer = '';
			let hasReceivedData = false;

			const processChunk = async () => {
				try {
					const { done, value } = await reader.read();

					if (done) {
						// Only disconnect if we've received some data, otherwise it might be a connection issue
						if (hasReceivedData) {
							this.handleDisconnect();
						} else {
							// Don't reconnect immediately for connection issues
							// Only show error if we've been trying to connect for a while
							if (this.reconnectAttempts > 0) {
								this.options.onError?.('Connection failed - no data received');
							}
							return;
						}
						return;
					}

					hasReceivedData = true;
					const chunk = decoder.decode(value, { stream: true });
					buffer += chunk;
					const lines = buffer.split('\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						if (line.startsWith('data: ')) {
							try {
								const data = JSON.parse(line.slice(6));
								this.handleEvent(data);
							} catch (error) {
								console.error('❌ Failed to parse SSE data:', error);
							}
						}
					}

					processChunk();
				} catch (error) {
					console.error('❌ SSE stream error:', error);

					// Check if it's a JWT expiration error
					const errorMessage = error instanceof Error ? error.message : String(error);
					if (errorMessage.includes('JWT expired') || errorMessage.includes('PGRST301')) {
						console.log('🔄 SSE: JWT expired, attempting to refresh token and reconnect...');
						try {
							const { data, error: refreshError } = await supabase.auth.refreshSession();
							if (refreshError) {
								console.error('❌ SSE: Failed to refresh token:', refreshError);
								this.handleDisconnect();
								return;
							}
							if (data.session) {
								// Reconnect with fresh token
								this.reconnectAttempts = 0;
								setTimeout(() => {
									this.connect().catch(() => {
										// Ignore connection errors in retry
									});
								}, 1000);
								return;
							}
						} catch (refreshError) {
							console.error('❌ SSE: Error refreshing token:', refreshError);
						}
					}

					// Don't immediately disconnect on stream errors, let the retry mechanism handle it
					if (this.reconnectAttempts < this.maxReconnectAttempts) {
						setTimeout(() => {
							this.connect().catch(() => {
								// Ignore connection errors in retry
							});
						}, this.reconnectDelay * (this.reconnectAttempts + 1));
					} else {
						this.handleDisconnect();
					}
				}
			};

			processChunk();
			this.isConnecting = false;
			this.reconnectAttempts = 0;

			// Start periodic token refresh (every 45 minutes to stay ahead of 1-hour expiry)
			this.startTokenRefresh();

		} catch (error) {
			console.error('❌ SSE connection failed:', error);
			this.isConnecting = false;
			this.handleDisconnect();
		}
	}

	private handleEvent(event: SSEEvent): void {


		switch (event.type) {
			case 'connected':

				this.options.onConnected?.();
				break;

			case 'heartbeat':

				this.options.onHeartbeat?.();
				break;

					case 'jobs_update':

			this.handleJobUpdates(event.jobs || []);
			break;

			case 'error':
				console.error('❌ SSE error:', event.error);
				this.options.onError?.(event.error || 'Unknown SSE error');
				break;

			default:

		}
	}

					private handleJobUpdates(jobs: JobUpdate[]): void {

		// Handle empty jobs array as completion signal - only if we have tracked jobs that are likely completed
		if (jobs.length === 0 && this.lastJobUpdate.size > 0) {
			// Only treat as completion if we have jobs that were at high progress
			const highProgressJobs = Array.from(this.lastJobUpdate.values()).filter(job => job.progress >= 80);

			if (highProgressJobs.length > 0) {
				const completedJobs: JobUpdate[] = [];
				for (const job of highProgressJobs) {
					// Create specific completion messages based on job type
					let completionMessage = 'Job completed successfully';
					if (job.type === 'data_export') {
						completionMessage = 'Export completed successfully';
					} else if (job.type === 'data_import') {
						completionMessage = 'Import completed successfully';
					} else if (job.type === 'trip_generation') {
						completionMessage = 'Trip generation completed';
					}

					const completedJob: JobUpdate = {
						...job,
						status: 'completed',
						progress: 100,
						result: { message: completionMessage }
					};
					completedJobs.push(completedJob);
					this.lastJobUpdate.delete(job.id);
				}

				// Clear timeouts for completed jobs
				for (const job of completedJobs) {
					const timeout = this.jobCompletionTimeouts.get(job.id);
					if (timeout) {
						clearTimeout(timeout);
						this.jobCompletionTimeouts.delete(job.id);
					}
				}

				// Notify about completion
				if (completedJobs.length > 0) {
					this.options.onJobCompleted?.(completedJobs);
				}
			}
			return;
		}

		// Track job updates and detect completion
		for (const job of jobs) {
			this.lastJobUpdate.set(job.id, job);

			// Clear any existing timeout for this job
			const existingTimeout = this.jobCompletionTimeouts.get(job.id);
			if (existingTimeout) {
				clearTimeout(existingTimeout);
			}

			// If job is completed/failed/cancelled, notify immediately
			if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
				this.options.onJobCompleted?.([job]);
				this.lastJobUpdate.delete(job.id);
				this.jobCompletionTimeouts.delete(job.id);
			} else if (job.status === 'running' && job.progress >= 80) {
				// Only set timeout for jobs that are very close to completion (95%+)
				const timeout = setTimeout(() => {
					const completedJob: JobUpdate = {
						...job,
						status: 'completed',
						progress: 100,
						result: { message: 'Job completed successfully' }
					};
					this.options.onJobCompleted?.([completedJob]);
					this.lastJobUpdate.delete(job.id);
					this.jobCompletionTimeouts.delete(job.id);
				}, 10000); // 10 second timeout for jobs at 95%+
				this.jobCompletionTimeouts.set(job.id, timeout);
			}
		}

		// Notify about all job updates

		this.options.onJobUpdate?.(jobs);
	}

	private handleDisconnect(): void {
		if (this.reconnectAttempts < this.maxReconnectAttempts) {
			this.reconnectAttempts++;
			setTimeout(() => {
				this.connect();
			}, this.reconnectDelay * this.reconnectAttempts);
		} else {
			this.isDisconnected = true;
			this.options.onDisconnected?.();
		}
	}

	disconnect(): void {
		this.isDisconnected = true;
		this.reconnectAttempts = 0;

		// Clear all timeouts
		for (const timeout of this.jobCompletionTimeouts.values()) {
			clearTimeout(timeout);
		}
		this.jobCompletionTimeouts.clear();
		this.lastJobUpdate.clear();

		// Clear token refresh interval
		if (this.tokenRefreshInterval) {
			clearInterval(this.tokenRefreshInterval);
			this.tokenRefreshInterval = undefined;
		}

		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
	}

	private startTokenRefresh(): void {
		// Clear any existing interval
		if (this.tokenRefreshInterval) {
			clearInterval(this.tokenRefreshInterval);
		}

		// Refresh token every 45 minutes (2700000 ms)
		this.tokenRefreshInterval = setInterval(async () => {
			try {
				console.log('🔄 SSE: Refreshing token...');
				const { data, error } = await supabase.auth.refreshSession();
				if (error) {
					console.error('❌ SSE: Failed to refresh token:', error);
					// Don't disconnect, just log the error
				} else if (data.session) {
					console.log('✅ SSE: Token refreshed successfully');
				}
			} catch (refreshError) {
				console.error('❌ SSE: Error refreshing token:', refreshError);
			}
		}, 45 * 60 * 1000); // 45 minutes
	}

	// Helper method to check if a job is still active
	isJobActive(jobId: string): boolean {
		return this.lastJobUpdate.has(jobId);
	}

	// Helper method to get the latest job update
	getJobUpdate(jobId: string): JobUpdate | undefined {
		return this.lastJobUpdate.get(jobId);
	}
}