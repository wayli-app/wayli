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
    const result = await this.callEdgeFunction(endpoint, options);
    return result;
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

    // Convert slash-separated endpoints to hyphen-separated for Edge Functions
    const edgeFunctionName = endpoint.replace(/\//g, '-');

    if (method === 'GET') {
      return this.edgeFunctionsService.makeRequest(edgeFunctionName, {
        session: this.session,
        params
      });
    } else {
      return this.edgeFunctionsService.makeRequest(edgeFunctionName, {
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

  async disable2FA(token: string) {
    return this.edgeFunctionsService.disable2FA(this.session, token);
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
  async getTrips(options?: {
    limit?: number;
    offset?: number;
    search?: string;
  }) {
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

  async getSuggestedTrips(options?: {
    limit?: number;
    offset?: number;
  }) {
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

  async approveSuggestedTrips(tripIds: string[], preGeneratedImages?: Record<string, { image_url: string; attribution?: any }>) {
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

  async generateSuggestedTripImages(suggestedTripIds: string[]) {
    console.log('📤 [SERVICE] Calling generateSuggestedTripImages with:', suggestedTripIds);
    const result = await this.callApi('trips-suggested-generate-images', {
      method: 'POST',
      body: {
        suggested_trip_ids: suggestedTripIds
      }
    });
    console.log('📥 [SERVICE] generateSuggestedTripImages result:', result);
    console.log('📥 [SERVICE] generateSuggestedTripImages results array:', result?.results);
    console.log('📥 [SERVICE] generateSuggestedTripImages successful results:', result?.results?.filter((r: any) => r.success));
    return result;
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
    const body = typeof tripIdOrDateRange === 'string'
      ? { trip_id: tripIdOrDateRange }
      : tripIdOrDateRange;

    return this.callEdgeFunction('trips-suggest-image', {
      method: 'POST',
      body
    });
  }

  /**
   * Export Operations
   */
  async getExportJobs(options?: {
    limit?: number;
    offset?: number;
  }) {
    const params: Record<string, string> = {};
    if (options?.limit) params.limit = options.limit.toString();
    if (options?.offset) params.offset = options.offset.toString();

    return this.callApi('export', { params });
  }

  async createExportJob(exportData: Record<string, unknown>) {
    return this.callApi('export', {
      method: 'POST',
      body: exportData
    });
  }

  async createImportJob(file: File, format: string): Promise<{ jobId: string }> {
    try {
      console.log('🚀 [SERVICE] Starting import job creation for file:', file.name);

            // Upload file directly to storage
      const fileName = `${Date.now()}-${file.name}`;
      const storagePath = `${this.session.user.id}/${fileName}`;

      console.log('📤 [SERVICE] Uploading file to storage:', storagePath);

      const { supabase } = await import('$lib/core/supabase/client');
      const { error: uploadError } = await supabase.storage
        .from('temp-files')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) {
        console.error('❌ [SERVICE] File upload failed:', uploadError);
        throw new Error(`File upload failed: ${uploadError.message}`);
      }

      console.log('✅ [SERVICE] File uploaded successfully');

      // Create import job via edge function
      const response = await supabase.functions.invoke('import', {
        body: {
          storage_path: storagePath,
          file_name: file.name,
          file_size: file.size,
          format: format
        }
      });

      if (response.error) {
        console.error('❌ [SERVICE] Import job creation failed:', response.error);
        throw new Error(`Import job creation failed: ${response.error.message}`);
      }

      const result = response.data as { success: boolean; data: { success: boolean; data: { jobId: string }; message: string }; message: string };

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

  /**
   * Upload large files directly to storage, then create import job
   */
  private async uploadLargeFileDirectly(
    file: File,
    format: string,
    options?: Record<string, unknown>
  ) {
    try {
      // Get Supabase client
      const { supabase } = await import('$lib/core/supabase/client');

      // Generate unique filename
      const timestamp = Date.now();
      const fileName = `${this.session?.user?.id}/${timestamp}-${file.name}`;

      console.log(`📁 [SERVICE-ADAPTER] Uploading to storage: ${fileName}`);

      // Upload file directly to storage
      const { error: uploadError } = await supabase.storage
        .from('temp-files')
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) {
        console.error('❌ [SERVICE-ADAPTER] Storage upload failed:', uploadError);
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      console.log(`✅ [SERVICE-ADAPTER] File uploaded successfully to storage`);

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('temp-files')
        .getPublicUrl(fileName);

      // Create import job via Edge Function (without file upload)
      const jobData = {
        file_url: urlData.publicUrl,
        file_type: format,
        storage_path: fileName, // Use the actual uploaded filename
        original_filename: file.name,
        file_size: file.size,
        options: options || {}
      };

      console.log(`📁 [SERVICE-ADAPTER] Creating import job for uploaded file: ${fileName}`);

      return this.callApi('import', {
        method: 'POST',
        body: jobData
      });

    } catch (error) {
      console.error('❌ [SERVICE-ADAPTER] Direct upload failed:', error);
      throw error;
    }
  }

  /**
   * Upload smaller files via Edge Function
   */
  private async uploadFileViaEdgeFunction(
    file: File,
    format: string,
    options?: Record<string, unknown>
  ) {
    // Create FormData for file upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', format);

    // Add options if present
    if (options) {
      Object.entries(options).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
    }

    // Use the edge function directly with FormData
    // For large files, we'll use a longer timeout
    const fileSize = file.size;
    const timeout = fileSize > 100 * 1024 * 1024 ? 120000 : 30000; // 2 minutes for files > 100MB

    return this.edgeFunctionsService.makeRequest('import', {
      method: 'POST',
      body: formData,
      session: this.session,
      timeout
    });
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
    return this.callApi(`export/${jobId}/download`);
  }

  /**
   * Jobs Operations
   */
  async getJobs(options?: {
    limit?: number;
    offset?: number;
    type?: string;
  }) {
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

    async getJobStream() {
    // Always use Edge Functions for SSE
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
   */
  async getGeocodingStats(options?: {
    startDate?: string;
    endDate?: string;
    forceRefresh?: string;
  }) {
    return this.edgeFunctionsService.getGeocodingStats(this.session, options);
  }

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

  async getAdminUsers(options?: {
    page?: number;
    limit?: number;
  }) {
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