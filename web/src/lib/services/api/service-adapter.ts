// src/lib/services/api/service-adapter.ts
// Service adapter that uses Edge Functions by default

import { EdgeFunctionsApiService } from './edge-functions-api.service';

import type { Session } from '@supabase/supabase-js';

export interface ServiceAdapterConfig {
	session: Session;
}

export class ServiceAdapter {
	private session: Session;
	public edgeFunctionsService: EdgeFunctionsApiService;

	constructor(config: ServiceAdapterConfig) {
		this.session = config.session;
		this.edgeFunctionsService = new EdgeFunctionsApiService();
	}

	/**
	 * Generic method to call API endpoints using Edge Functions
	 */
	async callApi<T = unknown>(
		endpoint: string,
		options: {
			method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
			body?: unknown;
			params?: Record<string, string>;
		} = {}
	): Promise<T> {
		// Always use Edge Functions
		return await this.callEdgeFunction<T>(endpoint, options);
	}

	/**
	 * Call Edge Function
	 */
	private async callEdgeFunction<T = unknown>(
		endpoint: string,
		options: {
			method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
			body?: unknown;
			params?: Record<string, string>;
		} = {}
	): Promise<T> {
		const { method = 'GET', body, params } = options;

		// Special handling for export-download endpoint - don't convert slashes to hyphens
		let edgeFunctionName: string;
		if (endpoint.startsWith('export-download/')) {
			// Keep the path structure for export-download
			edgeFunctionName = endpoint;
		} else {
			// Convert slash-separated endpoints to hyphen-separated for other Edge Functions
			edgeFunctionName = endpoint.replace(/\//g, '-');
		}

		if (method === 'GET') {
			return this.edgeFunctionsService.makeRequest<T>(edgeFunctionName, {
				session: this.session,
				params
			});
		} else {
			return this.edgeFunctionsService.makeRequest<T>(edgeFunctionName, {
				method,
				body,
				session: this.session
			});
		}
	}

	// Convenience methods for common operations

	/**
	 * Auth Profile Operations
	 */
	async getProfile() {
		return this.edgeFunctionsService.getProfile(this.session);
	}

	async updateProfile(profile: Record<string, unknown>) {
		return this.edgeFunctionsService.updateProfile(this.session, profile);
	}

	async getPreferences() {
		return this.edgeFunctionsService.getPreferences(this.session);
	}

	async updatePreferences(preferences: Record<string, unknown>) {
		return this.edgeFunctionsService.updatePreferences(this.session, preferences);
	}

	async updatePassword(password: string) {
		return this.edgeFunctionsService.updatePassword(this.session, password);
	}

	async setup2FA(action: string, token: string) {
		return this.edgeFunctionsService.setup2FA(this.session, action, token);
	}

	async verify2FA(token: string) {
		return this.edgeFunctionsService.verify2FA(this.session, token);
	}

	async disable2FA(password: string) {
		return this.edgeFunctionsService.disable2FA(this.session, password);
	}

	async check2FA() {
		return this.edgeFunctionsService.check2FA(this.session);
	}

	async recover2FA(recoveryCode: string) {
		return this.edgeFunctionsService.recover2FA(this.session, recoveryCode);
	}

	/**
	 * Trips Operations
	 */
	async getTrips(options?: { limit?: number; offset?: number; search?: string }) {
		const params: Record<string, string> = {};
		if (options?.limit) params.limit = options.limit.toString();
		if (options?.offset) params.offset = options.offset.toString();
		if (options?.search) params.search = options.search;

		return this.callApi('trips', { params });
	}

	async createTrip(trip: Record<string, unknown>) {
		return this.callApi('trips', {
			method: 'POST',
			body: trip
		});
	}

	async updateTrip(trip: Record<string, unknown>) {
		return this.callApi('trips', {
			method: 'PUT',
			body: trip
		});
	}

	async getTripsLocations(options?: {
		startDate?: string;
		endDate?: string;
		limit?: number;
		offset?: number;
		includeTrackerData?: boolean;
		includeLocations?: boolean;
		includePOIs?: boolean;
	}) {
		const params: Record<string, string> = {};
		if (options?.startDate) params.startDate = options.startDate;
		if (options?.endDate) params.endDate = options.endDate;
		if (options?.limit) params.limit = options.limit.toString();
		if (options?.offset) params.offset = options.offset.toString();
		if (options?.includeTrackerData) params.includeTrackerData = 'true';
		if (options?.includeLocations) params.includeLocations = 'true';
		if (options?.includePOIs) params.includePOIs = 'true';

		return this.callApi('trips/locations', { params });
	}

	async getSuggestedTrips(options?: { limit?: number; offset?: number }) {
		const params: Record<string, string> = {};
		if (options?.limit) params.limit = options.limit.toString();
		if (options?.offset) params.offset = options.offset.toString();

		return this.callApi('trips/suggested', { params });
	}

	async clearAllSuggestedTrips() {
		return this.callApi('trips/suggested', {
			method: 'DELETE'
		});
	}

	async approveSuggestedTrips(
		tripIds: string[],
		preGeneratedImages?: Record<string, { image_url: string; attribution?: unknown }>
	) {
		console.log('📤 [SERVICE] Calling approveSuggestedTrips with:', tripIds);
		console.log('📤 [SERVICE] Pre-generated images data:', preGeneratedImages);
		const result = await this.callApi('trips/suggested', {
			method: 'POST',
			body: {
				action: 'approve',
				tripIds,
				pre_generated_images: preGeneratedImages || {}
			}
		});
		console.log('📥 [SERVICE] approveSuggestedTrips result:', result);
		return result;
	}

	async generateSuggestedTripImages(
		suggestedTripIds: string[]
	): Promise<{ results: SuggestedImageResult[] }> {
		console.log('📤 [SERVICE] Calling generateSuggestedTripImages with:', suggestedTripIds);
		const results: SuggestedImageResult[] = [];
		for (const tripId of suggestedTripIds) {
			try {
				const result = await this.suggestTripImages(tripId);
				// The Edge Function returns { success: true, data: { ... } }
				const data =
					result && typeof result === 'object' && 'data' in result ? (result as any).data : result;

				// Type guard for data
				const imageUrl =
					data && typeof data === 'object' && 'suggestedImageUrl' in data
						? (data as { suggestedImageUrl?: string }).suggestedImageUrl
						: undefined;
				const attribution =
					data && typeof data === 'object' && 'attribution' in data
						? (data as { attribution?: unknown }).attribution
						: undefined;
				const analysis =
					data && typeof data === 'object' && 'analysis' in data
						? (data as { analysis?: unknown }).analysis
						: undefined;
				results.push({
					suggested_trip_id: tripId,
					success: !!imageUrl,
					image_url: imageUrl,
					attribution,
					analysis
				});
			} catch (error) {
				results.push({
					suggested_trip_id: tripId,
					success: false,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}
		const aggregated = { results };
		console.log('📥 [SERVICE] generateSuggestedTripImages aggregated results:', aggregated);
		return aggregated;
	}

	async rejectSuggestedTrips(tripIds: string[]) {
		return this.callApi('trips/suggested', {
			method: 'POST',
			body: {
				action: 'reject',
				tripIds
			}
		});
	}

	async createTripFromSuggestion(suggestedTripId: string) {
		return this.callApi('trips/suggested', {
			method: 'POST',
			body: { suggested_trip_id: suggestedTripId }
		});
	}

	// Note: Removed generateTripImages method since images are now generated during trip approval

	async suggestTripImages(tripIdOrDateRange: string | { start_date: string; end_date: string }) {
		const body =
			typeof tripIdOrDateRange === 'string' ? { trip_id: tripIdOrDateRange } : tripIdOrDateRange;

		return this.callEdgeFunction('trips-suggest-image', {
			method: 'POST',
			body
		});
	}

	/**
	 * Export Operations (now using centralized jobs system)
	 */
	async getExportJobs(options?: { limit?: number; offset?: number }) {
		const params: Record<string, string> = {
			type: 'data_export' // Filter for export jobs only
		};
		if (options?.limit) params.limit = options.limit.toString();
		if (options?.offset) params.offset = options.offset.toString();

		return this.callApi('jobs', { params });
	}

	async createExportJob(exportData: Record<string, unknown>) {
		return this.callApi('jobs', {
			method: 'POST',
			body: {
				type: 'data_export',
				data: exportData
			}
		});
	}

		async createImportJob(
		file: File,
		format: string,
		onUploadProgress?: (progress: number) => void
	): Promise<{ jobId: string }> {
		try {
			const fileSizeMB = file.size / (1024 * 1024);
			console.log(`📁 [SERVICE] Uploading file: ${fileSizeMB.toFixed(2)}MB`);

			// Generate unique filename
			const timestamp = Date.now();
			const fileName = `${this.session?.user?.id}/${timestamp}-${file.name}`;

			console.log(`📤 [SERVICE] Uploading to storage: ${fileName}`);

			// Get Supabase client
			const { supabase } = await import('$lib/supabase');

			// Convert File to Blob to ensure correct Content-Type and metadata
			console.log('🔍 [SERVICE] Converting File to Blob for upload');
			const arrayBuffer = await file.arrayBuffer();
			const fileBlob = new Blob([arrayBuffer], { type: file.type });

			console.log('🔍 [SERVICE] Upload options:', {
				storagePath: fileName,
				fileType: file.type,
				fileSize: file.size,
				blobType: fileBlob.type,
				metadata: {
					mimetype: file.type,
					size: file.size.toString()
				}
			});

			// Upload directly to Supabase storage with proper metadata
			// This ensures the RLS policy can validate the upload correctly
			const { data, error: uploadError } = await supabase.storage
				.from('temp-files')
				.upload(fileName, fileBlob, {
					contentType: file.type,
					upsert: false,
					metadata: {
						mimetype: file.type,
						size: file.size.toString()
					}
				});

			if (uploadError) {
				console.error('❌ [SERVICE] File upload failed:', uploadError);
				const message =
					typeof uploadError === 'object' && uploadError && 'message' in uploadError
						? (uploadError as { message: string }).message
						: String(uploadError);
				throw new Error(`File upload failed: ${message}`);
			}

			console.log('✅ [SERVICE] File uploaded successfully');

			// Create import job via edge function
			const response = await supabase.functions.invoke('import', {
				body: {
					storage_path: fileName,
					file_name: file.name,
					file_size: file.size,
					format: format
				}
			});

			if (response.error) {
				console.error('❌ [SERVICE] Import job creation failed:', response.error);
				throw new Error(`Import job creation failed: ${response.error.message}`);
			}

			const result = response.data as {
				success: boolean;
				data: { success: boolean; data: { jobId: string }; message: string };
				message: string;
			};

			if (!result.success) {
				throw new Error(`Import job creation failed: ${result.message || 'Unknown error'}`);
			}

			// The Edge Function response is nested: { success: true, data: { success: true, data: { jobId: string } } }
			const jobData = result.data;
			if (!jobData.success || !jobData.data?.jobId) {
				throw new Error(`Import job creation failed: Invalid response structure`);
			}

			console.log('✅ [SERVICE] Import job created successfully:', jobData.data.jobId);
			return { jobId: jobData.data.jobId };
		} catch (error) {
			console.error('❌ [SERVICE] Error in createImportJob:', error);
			throw error;
		}
	}



	async getImportProgress() {
		return this.callApi('import/progress');
	}

	/**
	 * Geocoding Operations
	 */
	async searchGeocode(query: string) {
		return this.edgeFunctionsService.searchGeocode(this.session, query);
	}

	async getExportDownloadUrl(jobId: string) {
		// Send job ID as a query parameter since path parameter extraction isn't working
		return this.callApi(`export-download`, {
			params: { job_id: jobId }
		});
	}

	/**
	 * Jobs Operations
	 */
	async getJobs(options?: { limit?: number; offset?: number; type?: string }) {
		const params: Record<string, string> = {};
		if (options?.limit) params.limit = options.limit.toString();
		if (options?.offset) params.offset = options.offset.toString();
		if (options?.type) params.type = options.type;

		return this.callApi('jobs', { params });
	}

	async createJob(job: Record<string, unknown>) {
		return this.callApi('jobs', {
			method: 'POST',
			body: job
		});
	}

	async getJobProgress(jobId: string) {
		return this.edgeFunctionsService.getJobProgress(this.session, jobId);
	}

	async cancelJob(jobId: string) {
		return this.edgeFunctionsService.cancelJob(this.session, jobId);
	}

	async getJobStream() {
		// Always use Edge Functions for SSE - no filtering, frontend will filter
		return this.edgeFunctionsService.getJobStream(this.session);
	}

	/**
	 * POI Visits Operations
	 */
	async detectPOIVisits(options: {
		startDate: string;
		endDate: string;
		radius?: number;
		minDuration?: number;
		minInterval?: number;
	}) {
		return this.callApi('poi-visits/detect', {
			method: 'POST',
			body: {
				start_date: options.startDate,
				end_date: options.endDate,
				radius: options.radius || 300,
				min_duration: options.minDuration || 3600,
				min_interval: options.minInterval || 3600
			}
		});
	}

	async getPOIVisits() {
		return this.callApi('poi-visits/detect');
	}

	/**
	 * Statistics Operations
	 * Note: getGeocodingStats method removed - now using client-side processing
	 */

	/**
	 * Admin Operations
	 */
	async getServerSettings() {
		return this.edgeFunctionsService.getServerSettings(this.session);
	}

	async updateServerSettings(settings: Record<string, unknown>) {
		return this.edgeFunctionsService.updateServerSettings(this.session, settings);
	}

	async getAdminWorkers() {
		return this.callApi('admin/workers');
	}

	async manageWorkers(action: Record<string, unknown>) {
		return this.callApi('admin/workers', {
			method: 'POST',
			body: action
		});
	}

	async getAdminUsers(options?: { page?: number; limit?: number }) {
		const params: Record<string, string> = {};
		if (options?.page) params.page = options.page.toString();
		if (options?.limit) params.limit = options.limit.toString();

		return this.callApi('admin/users', { params });
	}

	/**
	 * Trip Exclusions Operations
	 */
	async getTripExclusions() {
		return this.edgeFunctionsService.getTripExclusions(this.session);
	}

	async createTripExclusion(exclusion: Record<string, unknown>) {
		return this.edgeFunctionsService.createTripExclusion(this.session, exclusion);
	}

	async updateTripExclusion(exclusion: Record<string, unknown>) {
		return this.edgeFunctionsService.updateTripExclusion(this.session, exclusion);
	}

	async deleteTripExclusion(exclusionId: string) {
		return this.edgeFunctionsService.deleteTripExclusion(this.session, exclusionId);
	}
}

// Add a type for the image suggestion result
interface SuggestedImageResult {
	suggested_trip_id: string;
	success: boolean;
	image_url?: string;
	attribution?: unknown;
	analysis?: unknown;
	error?: string;
}
