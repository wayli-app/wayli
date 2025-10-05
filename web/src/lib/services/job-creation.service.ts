// web/src/lib/services/job-creation.service.ts
import { get } from 'svelte/store';
import { toast } from 'svelte-sonner';

import { sessionStore } from '$lib/stores/auth';
import { addJobToStore } from '$lib/stores/job-store';
import type { JobUpdate } from '$lib/services/job-realtime.service';

import { ServiceAdapter } from './api/service-adapter';

export interface JobCreationOptions {
	type: 'data_import' | 'data_export' | 'reverse_geocoding_missing' | 'trip_generation';
	data: Record<string, unknown>;
	successMessage?: string;
	errorMessage?: string;
}

export class JobCreationService {
	private static instance: JobCreationService;
	private serviceAdapter: ServiceAdapter | null = null;

	private constructor() {}

	public static getInstance(): JobCreationService {
		if (!JobCreationService.instance) {
			JobCreationService.instance = new JobCreationService();
		}
		return JobCreationService.instance;
	}

	private async getServiceAdapter(): Promise<ServiceAdapter> {
		if (!this.serviceAdapter) {
			const session = get(sessionStore);
			if (!session) {
				throw new Error('No session found');
			}
			this.serviceAdapter = new ServiceAdapter({ session });
		}
		return this.serviceAdapter;
	}

	/**
	 * Create a job with the specified type and data
	 */
	async createJob(options: JobCreationOptions): Promise<unknown> {
		try {
			const serviceAdapter = await this.getServiceAdapter();

			console.log(`🚀 Creating ${options.type} job with data:`, options.data);

			const result = (await serviceAdapter.createJob({
				type: options.type,
				data: options.data
			})) as {
				id?: string;
				status?: string;
				progress?: number;
				data?: unknown;
				created_at?: string;
				updated_at?: string;
				created_by?: string;
				priority?: string;
			};

			if (result?.id) {
				// Add the job to the store immediately so it appears in notifications
				const jobUpdate: JobUpdate = {
					id: result.id,
					type: options.type,
					status: (result.status || 'queued') as 'queued' | 'running' | 'completed' | 'failed' | 'cancelled',
					progress: result.progress || 0,
					created_at: result.created_at || new Date().toISOString(),
					updated_at: result.updated_at || new Date().toISOString()
				};

				addJobToStore(jobUpdate);

				const successMsg =
					options.successMessage || `${options.type.replace('_', ' ')} job started successfully!`;
				toast.success(successMsg);
				return result;
			} else {
				throw new Error('Invalid response from job creation');
			}
		} catch (error) {
			console.error(`❌ Error creating ${options.type} job:`, error);
			const errorMsg =
				options.errorMessage || `Failed to start ${options.type.replace('_', ' ')} job`;
			toast.error(errorMsg);
			throw error;
		}
	}

	/**
	 * Create a data import job
	 */
	async createImportJob(
		file: File,
		options: {
			format: string;
			includeLocationData: boolean;
			includeWantToVisit: boolean;
			includeTrips: boolean;
		},
		onUploadProgress?: (progress: number) => void
	): Promise<{ id: string }> {
		try {
			// Get service adapter for file upload
			const serviceAdapter = await this.getServiceAdapter();

			// Use the existing ServiceAdapter method that handles file upload and job creation
			const result = await serviceAdapter.createImportJob(file, options.format, onUploadProgress);
			return { id: result.jobId };
		} catch (error) {
			console.error('❌ Error in createImportJob:', error);
			throw error;
		}
	}

	/**
	 * Create a data export job
	 */
	async createExportJob(options: {
		format: string;
		includeLocationData: boolean;
		includeWantToVisit: boolean;
		includeTrips: boolean;
		startDate?: Date;
		endDate?: Date;
	}): Promise<any> {
		const data: Record<string, unknown> = {
			format: options.format,
			includeLocationData: options.includeLocationData,
			includeWantToVisit: options.includeWantToVisit,
			includeTrips: options.includeTrips
		};

		if (options.startDate) {
			const startDate = options.startDate instanceof Date ? options.startDate : new Date(options.startDate);
			data.startDate = startDate.toISOString().split('T')[0];
		}
		if (options.endDate) {
			const endDate = options.endDate instanceof Date ? options.endDate : new Date(options.endDate);
			data.endDate = endDate.toISOString().split('T')[0];
		}

		return this.createJob({
			type: 'data_export',
			data,
			successMessage: 'Data export job started!',
			errorMessage: 'Failed to start data export job'
		});
	}

	/**
	 * Create a reverse geocoding job
	 */
	async createReverseGeocodingJob(): Promise<any> {
		return this.createJob({
			type: 'reverse_geocoding_missing',
			data: {},
			successMessage: 'Reverse geocoding job started!',
			errorMessage: 'Failed to start reverse geocoding job'
		});
	}

	/**
	 * Create a trip generation job
	 */
	async createTripGenerationJob(options: {
		startDate?: string;
		endDate?: string;
		useCustomHomeAddress?: boolean;
		customHomeAddress?: string;
		clearExistingSuggestions?: boolean;
	}): Promise<any> {
		const data: Record<string, any> = {};

		if (options.startDate) data.startDate = options.startDate;
		if (options.endDate) data.endDate = options.endDate;
		if (options.useCustomHomeAddress !== undefined)
			data.useCustomHomeAddress = options.useCustomHomeAddress;
		if (options.customHomeAddress) data.customHomeAddress = options.customHomeAddress;
		if (options.clearExistingSuggestions !== undefined)
			data.clearExistingSuggestions = options.clearExistingSuggestions;

		return this.createJob({
			type: 'trip_generation',
			data,
			successMessage: 'Trip generation job started!',
			errorMessage: 'Failed to start trip generation job'
		});
	}
}

// Export a singleton instance
export const jobCreationService = JobCreationService.getInstance();
