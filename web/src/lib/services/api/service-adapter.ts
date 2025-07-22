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
    return this.callEdgeFunction(endpoint, options);
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

  async setup2FA(secret: string, token: string) {
    return this.edgeFunctionsService.setup2FA(this.session, secret, token);
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

  async approveSuggestedTrips(tripIds: string[]) {
    return this.callApi('trips/suggested', {
      method: 'POST',
      body: {
        action: 'approve',
        tripIds
      }
    });
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

  async generateTripImages(tripId: string, options?: {
    style?: string;
    count?: number;
  }) {
    return this.callApi('trips/generate-images', {
      method: 'POST',
      body: {
        trip_id: tripId,
        style: options?.style || 'default',
        count: options?.count || 1
      }
    });
  }

  async suggestTripImages(tripId: string) {
    return this.callApi('trips/suggest-image', {
      method: 'POST',
      body: { trip_id: tripId }
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

  async createImportJob(importData: Record<string, unknown>) {
    return this.callApi('import', {
      method: 'POST',
      body: importData
    });
  }

  async getImportProgress() {
    return this.callApi('import/progress');
  }

  /**
   * Geocoding Operations
   */
  async searchGeocode(query: string) {
    return this.callApi('geocode/search', { params: { q: query } });
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
    return this.callApi(`jobs/${jobId}/progress`);
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