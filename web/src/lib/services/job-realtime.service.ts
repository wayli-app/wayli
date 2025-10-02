// web/src/lib/services/job-realtime.service.ts
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '$lib/supabase';

export interface JobUpdate {
	id: string;
	type: string;
	status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
	progress: number;
	created_at: string;
	updated_at: string;
	result?: unknown;
	error?: string;
}

export interface JobRealtimeOptions {
	onConnected?: () => void;
	onDisconnected?: () => void;
	onError?: (error: string) => void;
	onJobUpdate?: (job: JobUpdate) => void;
	onJobCompleted?: (job: JobUpdate) => void;
}

export class JobRealtimeService {
	private channel: RealtimeChannel | null = null;
	private options: JobRealtimeOptions;
	private userId: string | null = null;
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectTimeout: NodeJS.Timeout | null = null;
	private isConnecting = false;
	private authUnsubscribe: (() => void) | null = null;

	constructor(options: JobRealtimeOptions) {
		this.options = options;

		// Listen for auth changes to update Realtime token
		// This ensures the WebSocket stays authenticated when tokens refresh
		this.authUnsubscribe = supabase.auth.onAuthStateChange((_event, session) => {
			if (session?.access_token) {
				console.log('🔐 JobRealtime: Auth state changed, refreshing Realtime token');
				supabase.realtime.setAuth(session.access_token);
			}
		}).data.subscription.unsubscribe;
	}

	async connect(): Promise<void> {
		if (this.isConnecting) {
			console.log('🔗 JobRealtime: Already connecting, skipping...');
			return;
		}

		this.isConnecting = true;

		try {
			// Get current user
			const {
				data: { session }
			} = await supabase.auth.getSession();

			if (!session?.user) {
				console.error('🔗 JobRealtime: No authenticated user');
				this.isConnecting = false;
				return;
			}

			this.userId = session.user.id;

			// Set auth token for Realtime WebSocket connection
			// This is CRITICAL for RLS policies to work with postgres_changes
			// Without this, Realtime only uses the anon key and can't see user-specific events
			console.log('🔐 JobRealtime: Setting auth token for Realtime connection');
			supabase.realtime.setAuth(session.access_token);

			// Disconnect existing channel if any
			if (this.channel) {
				await this.disconnect();
			}

			console.log('🔗 JobRealtime: Connecting to jobs channel for user:', this.userId);

			// Create channel name for this user's jobs
			const channelName = `jobs:${this.userId}`;
			console.log('🔗 JobRealtime: Channel name:', channelName);
			console.log('🔗 JobRealtime: Subscribing with filter: created_by=eq.' + this.userId);

			// Subscribe to jobs table changes for this user
			this.channel = supabase
				.channel(channelName)
				.on(
					'postgres_changes',
					{
						event: '*', // Listen to INSERT, UPDATE, DELETE
						schema: 'public',
						table: 'jobs',
						filter: `created_by=eq.${this.userId}`
					},
					(payload: RealtimePostgresChangesPayload<JobUpdate>) => {
						console.log('📨 JobRealtime: RAW payload received:', payload);
						this.handleDatabaseChange(payload);
					}
				)
				.subscribe((status, err) => {
					if (status === 'SUBSCRIBED') {
						console.log('✅ JobRealtime: Successfully subscribed to jobs channel');
						this.reconnectAttempts = 0; // Reset on successful connection
						this.isConnecting = false;
						this.options.onConnected?.();
					} else if (status === 'CHANNEL_ERROR') {
						console.error('❌ JobRealtime: Channel error:', err);
						this.isConnecting = false;
						this.handleError('Channel subscription error');
					} else if (status === 'TIMED_OUT') {
						console.error('❌ JobRealtime: Connection timed out');
						this.isConnecting = false;
						this.handleError('Connection timed out');
						this.attemptReconnect();
					} else if (status === 'CLOSED') {
						console.log('🔌 JobRealtime: Channel closed');
						this.isConnecting = false;
						this.options.onDisconnected?.();
					}
				});
		} catch (error) {
			console.error('❌ JobRealtime: Error connecting:', error);
			this.isConnecting = false;
			this.handleError(error instanceof Error ? error.message : 'Unknown error');
			this.attemptReconnect();
		}
	}

	private handleDatabaseChange(payload: RealtimePostgresChangesPayload<JobUpdate>): void {
		const { eventType, new: newRecord, old: oldRecord } = payload;

		console.log('📨 JobRealtime: Database change received:', {
			event: eventType,
			jobId: (newRecord as JobUpdate)?.id || (oldRecord as Partial<JobUpdate>)?.id,
			jobType: (newRecord as JobUpdate)?.type || (oldRecord as Partial<JobUpdate>)?.type,
			status: (newRecord as JobUpdate)?.status,
			progress: (newRecord as JobUpdate)?.progress,
			oldStatus: (oldRecord as Partial<JobUpdate>)?.status,
			oldProgress: (oldRecord as Partial<JobUpdate>)?.progress
		});

		if (eventType === 'INSERT' || eventType === 'UPDATE') {
			const job = newRecord as JobUpdate;

			// Notify about the update
			this.options.onJobUpdate?.(job);

			// Check if job completed
			if (
				job.status === 'completed' ||
				job.status === 'failed' ||
				job.status === 'cancelled'
			) {
				// Check if this is a status transition (not just an update to completed job)
				const oldJobRecord = oldRecord as Partial<JobUpdate>;
				const wasActive =
					oldJobRecord &&
					(oldJobRecord.status === 'queued' || oldJobRecord.status === 'running');

				if (wasActive || eventType === 'INSERT') {
					this.options.onJobCompleted?.(job);
				}
			}
		} else if (eventType === 'DELETE' && oldRecord) {
			// Handle job deletion if needed
			const deletedJob = oldRecord as Partial<JobUpdate>;
			console.log('🗑️ JobRealtime: Job deleted:', deletedJob.id);
		}
	}

	private handleError(error: string): void {
		console.error('❌ JobRealtime: Error:', error);
		this.options.onError?.(error);
	}

	private attemptReconnect(): void {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.error(
				'❌ JobRealtime: Max reconnection attempts reached'
			);
			this.handleError('Max reconnection attempts reached');
			return;
		}

		this.reconnectAttempts++;
		const delay = 1000 * this.reconnectAttempts; // Linear backoff: 1s, 2s, 3s, 4s, 5s

		console.log(
			`🔄 JobRealtime: Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
		);

		this.reconnectTimeout = setTimeout(() => {
			this.connect();
		}, delay);
	}

	async disconnect(): Promise<void> {
		console.log('🔌 JobRealtime: Disconnecting...');

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}

		if (this.channel) {
			await this.channel.unsubscribe();
			this.channel = null;
		}

		// Cleanup auth state listener
		if (this.authUnsubscribe) {
			this.authUnsubscribe();
			this.authUnsubscribe = null;
		}

		this.isConnecting = false;
		this.reconnectAttempts = 0;
	}

	isConnected(): boolean {
		return this.channel !== null && !this.isConnecting;
	}
}
