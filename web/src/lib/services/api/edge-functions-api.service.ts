/**
 * Edge Functions API Service
 *
 * Provides a unified interface for calling Supabase Edge Functions
 * This service abstracts the API calls and makes migration from SvelteKit routes easier
 *
 * @file src/lib/services/api/edge-functions-api.service.ts
 */

import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { Session } from '@supabase/supabase-js';

export interface EdgeFunctionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export class EdgeFunctionsApiService {
  private baseUrl: string;

  constructor() {
    // For local development, use the local Supabase URL
    // For production, use the public Supabase URL
    const isLocal = typeof window !== 'undefined' && window.location.hostname === 'localhost';
    this.baseUrl = isLocal
      ? 'http://localhost:54321/functions/v1'
      : `${PUBLIC_SUPABASE_URL}/functions/v1`;
  }

  /**
   * Make a request to an Edge Function
   */
  async makeRequest<T>(
    functionName: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: unknown;
      session: Session;
      params?: Record<string, string>;
      timeout?: number;
    }
  ): Promise<T> {
    const { method = 'GET', body, session, params, timeout } = options;

    const url = new URL(`${this.baseUrl}/${functionName}`);

    // Add query parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${session.access_token}`
    };

    const requestOptions: RequestInit = {
      method,
      headers
    };

    // Add timeout if specified
    if (timeout) {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), timeout);
      requestOptions.signal = controller.signal;
    }

    if (body && method !== 'GET') {
      // Check if body is FormData
      if (body instanceof FormData) {
        // Don't set Content-Type for FormData - browser will set it with boundary
        requestOptions.body = body;
      } else {
        // For JSON data
        headers['Content-Type'] = 'application/json';
        requestOptions.body = JSON.stringify(body);
      }
    }

    // Special debugging for export-download calls
    if (functionName.startsWith('export-download')) {
      console.log('🔍 [EDGE DEBUG] Export download request details:');
      console.log('🔍 [EDGE DEBUG] URL:', url.toString());
      console.log('🔍 [EDGE DEBUG] Method:', method);
      console.log('🔍 [EDGE DEBUG] Headers:', headers);
      console.log('🔍 [EDGE DEBUG] Session user ID:', session.user.id);
      console.log('🔍 [EDGE DEBUG] Function name:', functionName);
      console.log('🔍 [EDGE DEBUG] Query parameters:', params);
      console.log('🔍 [EDGE DEBUG] Full URL with query:', url.toString());
      console.log('🔍 [EDGE DEBUG] URL search params:', url.searchParams.toString());
    }

    console.log(`🌐 [EDGE] Making ${method} request to: ${url.toString()}`);

    const response = await fetch(url.toString(), requestOptions);

    // Special debugging for export-download calls
    if (functionName.startsWith('export-download')) {
      console.log('🔍 [EDGE DEBUG] Export download response details:');
      console.log('🔍 [EDGE DEBUG] Response status:', response.status);
      console.log('🔍 [EDGE DEBUG] Response status text:', response.statusText);
      console.log('🔍 [EDGE DEBUG] Response headers:', Object.fromEntries(response.headers.entries()));
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🌐 [EDGE] Error response:', errorText);

      // Special debugging for export-download calls
      if (functionName.startsWith('export-download')) {
        console.error('🔍 [EDGE DEBUG] Export download failed with status:', response.status);
        console.error('🔍 [EDGE DEBUG] Error response body:', errorText);
      }

      throw new Error(`Edge Function error: ${response.status} - ${errorText}`);
    }

    const result: EdgeFunctionResponse<T> = await response.json();

    // Special debugging for export-download calls
    if (functionName.startsWith('export-download')) {
      console.log('🔍 [EDGE DEBUG] Export download response body:', result);
    }

    if (!result.success) {
      throw new Error(result.error || 'Edge Function returned an error');
    }

    return result.data as T;
  }

  // Auth API Methods
  async getProfile(session: Session) {
    return this.makeRequest('auth-profile', { session });
  }

  async updateProfile(session: Session, profile: Record<string, unknown>) {
    return this.makeRequest('auth-profile', {
      method: 'POST',
      body: profile,
      session
    });
  }

  async getPreferences(session: Session) {
    return this.makeRequest('auth-preferences', { session });
  }

  async updatePreferences(session: Session, preferences: Record<string, unknown>) {
    return this.makeRequest('auth-preferences', {
      method: 'PUT',
      body: { preferences },
      session
    });
  }

  async updatePassword(session: Session, password: string) {
    return this.makeRequest('auth-password', {
      method: 'POST',
      body: { password },
      session
    });
  }

  async setup2FA(session: Session, action: string, token: string) {
    return this.makeRequest('auth-2fa-setup', {
      method: 'POST',
      body: { action, token },
      session
    });
  }

  async verify2FA(session: Session, token: string) {
    return this.makeRequest('auth-2fa-verify', {
      method: 'POST',
      body: { token },
      session
    });
  }

  async disable2FA(session: Session, password: string) {
    return this.makeRequest('auth-2fa-disable', {
      method: 'POST',
      body: { password },
      session
    });
  }

  async check2FA(session: Session) {
    return this.makeRequest('auth-check-2fa', { session });
  }

  async recover2FA(session: Session, recoveryCode: string) {
    return this.makeRequest('auth-2fa-recovery', {
      method: 'POST',
      body: { recovery_code: recoveryCode },
      session
    });
  }

  // Trips API Methods
  async getTrips(session: Session, options?: {
    limit?: number;
    offset?: number;
    search?: string;
  }) {
    const params: Record<string, string> = {};
    if (options?.limit) params.limit = options.limit.toString();
    if (options?.offset) params.offset = options.offset.toString();
    if (options?.search) params.search = options.search;

    return this.makeRequest('trips', { session, params });
  }

  async createTrip(session: Session, trip: Record<string, unknown>) {
    return this.makeRequest('trips', {
      method: 'POST',
      body: trip,
      session
    });
  }

  async updateTrip(session: Session, trip: Record<string, unknown>) {
    return this.makeRequest('trips', {
      method: 'PUT',
      body: trip,
      session
    });
  }

  // Trips Locations API Methods
  async getTripsLocations(session: Session, options?: {
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

    return this.makeRequest('trips-locations', { session, params });
  }

  // Trips Suggested API Methods
  async getSuggestedTrips(session: Session, options?: {
    limit?: number;
    offset?: number;
  }) {
    const params: Record<string, string> = {};
    if (options?.limit) params.limit = options.limit.toString();
    if (options?.offset) params.offset = options.offset.toString();

    return this.makeRequest('trips-suggested', { session, params });
  }

  async clearAllSuggestedTrips(session: Session) {
    return this.makeRequest('trips-suggested', {
      method: 'DELETE',
      session
    });
  }

  async createTripFromSuggestion(session: Session, suggestedTripId: string) {
    return this.makeRequest('trips-suggested', {
      method: 'POST',
      body: { suggested_trip_id: suggestedTripId },
      session
    });
  }

  // Note: Removed generateTripImages method since images are now generated during trip approval

  async suggestTripImages(session: Session, tripIdOrDateRange: string | { start_date: string; end_date: string }) {
    const body = typeof tripIdOrDateRange === 'string'
      ? { trip_id: tripIdOrDateRange }
      : tripIdOrDateRange;

    return this.makeRequest('trips-suggest-image', {
      method: 'POST',
      body,
      session
    });
  }

  // Export API Methods (now using centralized jobs system)
  async getExportJobs(session: Session, options?: {
    limit?: number;
    offset?: number;
  }) {
    const params: Record<string, string> = {
      type: 'data_export' // Filter for export jobs only
    };
    if (options?.limit) params.limit = options.limit.toString();
    if (options?.offset) params.offset = options.offset.toString();

    return this.makeRequest('jobs', { session, params });
  }

  async createExportJob(session: Session, exportData: Record<string, unknown>) {
    return this.makeRequest('jobs', {
      method: 'POST',
      body: {
        type: 'data_export',
        data: exportData
      },
      session
    });
  }

  // Export Download API Methods
  async getExportDownloadUrl(session: Session, jobId: string) {
    return this.makeRequest(`export-download/${jobId}`, { session });
  }

  // Jobs API Methods
  async getJobs(session: Session, options?: {
    limit?: number;
    offset?: number;
    type?: string;
  }) {
    const params: Record<string, string> = {};
    if (options?.limit) params.limit = options.limit.toString();
    if (options?.offset) params.offset = options.offset.toString();
    if (options?.type) params.type = options.type;

    return this.makeRequest('jobs', { session, params });
  }

  async createJob(session: Session, job: Record<string, unknown>) {
    return this.makeRequest('jobs', {
      method: 'POST',
      body: job,
      session
    });
  }

  // Jobs Progress API Methods
  async getJobProgress(session: Session, jobId: string) {
    return this.makeRequest(`jobs-progress/${jobId}`, { session });
  }

  async cancelJob(session: Session, jobId: string) {
    return this.makeRequest(`jobs/${jobId}`, {
      method: 'DELETE',
      session
    });
  }

  // Jobs Stream API Methods (Server-Sent Events)
    async getJobStream(session: Session) {
    // For SSE, we need to return the raw response - no filtering, frontend will filter
    const url = new URL(`${this.baseUrl}/jobs-stream`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('🔗 EdgeFunctionsApiService: Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🔗 EdgeFunctionsApiService: Error response:', errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  // Import API Methods
  async createImportJob(session: Session, importData: Record<string, unknown>) {
    return this.makeRequest('import', {
      method: 'POST',
      body: importData,
      session
    });
  }

  async getImportProgress(session: Session, jobId: string) {
    return this.makeRequest('import-progress', {
      session,
      params: { job_id: jobId }
    });
  }

  // Geocoding API Methods
  async searchGeocode(session: Session, query: string) {
    return this.makeRequest('geocode-search', {
      session,
      params: { q: query }
    });
  }

  // Trip Exclusions API Methods
  async getTripExclusions(session: Session) {
    return this.makeRequest('trip-exclusions', { session });
  }

  async createTripExclusion(session: Session, exclusion: Record<string, unknown>) {
    return this.makeRequest('trip-exclusions', {
      method: 'POST',
      body: exclusion,
      session
    });
  }

  async updateTripExclusion(session: Session, exclusion: Record<string, unknown>) {
    return this.makeRequest('trip-exclusions', {
      method: 'PUT',
      body: exclusion,
      session
    });
  }

  async deleteTripExclusion(session: Session, exclusionId: string) {
    return this.makeRequest('trip-exclusions', {
      method: 'DELETE',
      body: { id: exclusionId },
      session
    });
  }

  // OwnTracks API Methods
  async postOwnTracksPoint(session: Session, point: Record<string, unknown>) {
    return this.makeRequest('owntracks-points', {
      method: 'POST',
      body: point,
      session
    });
  }

  async getOwnTracksPoints(session: Session, options?: {
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
  }) {
    const params: Record<string, string> = {};
    if (options?.limit) params.limit = options.limit.toString();
    if (options?.offset) params.offset = options.offset.toString();
    if (options?.startDate) params.start_date = options.startDate;
    if (options?.endDate) params.end_date = options.endDate;

    return this.makeRequest('owntracks-points', { session, params });
  }

  // Admin API Methods
  async getAdminUsers(session: Session, options?: {
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const params: Record<string, string> = {};
    if (options?.search) params.search = options.search;
    if (options?.limit) params.limit = options.limit.toString();
    if (options?.offset) params.offset = options.offset.toString();

    return this.makeRequest('admin-users', { session, params });
  }

  // Admin Server Settings API Methods
  async getServerSettings(session: Session) {
    return this.makeRequest('admin-server-settings', { session });
  }

  async updateServerSettings(session: Session, settings: Record<string, unknown>) {
    return this.makeRequest('admin-server-settings', {
      method: 'POST',
      body: settings,
      session
    });
  }

  async getAdminWorkers(session: Session) {
    return this.makeRequest('admin-workers', { session });
  }

  async manageWorkers(session: Session, action: Record<string, unknown>) {
    return this.makeRequest('admin-workers', {
      method: 'POST',
      body: action,
      session
    });
  }

  // Tracker Data API Methods
  async getTrackerDataWithMode(session: Session, options?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
    includeStatistics?: boolean;
  }) {
    const params: Record<string, string> = {};
    if (options?.startDate) params.start_date = options.startDate;
    if (options?.endDate) params.end_date = options.endDate;
    if (options?.limit) params.limit = options.limit.toString();
    if (options?.offset) params.offset = options.offset.toString();
    if (options?.includeStatistics) params.include_statistics = options.includeStatistics.toString();

    return this.makeRequest('tracker-data-with-mode', { session, params });
  }

  // POI Visits API Methods
  async detectPOIVisits(session: Session, options: {
    startDate: string;
    endDate: string;
    radius?: number;
    minDuration?: number;
    minInterval?: number;
  }) {
    return this.makeRequest('poi-visits-detect', {
      method: 'POST',
      body: {
        start_date: options.startDate,
        end_date: options.endDate,
        radius: options.radius || 300,
        min_duration: options.minDuration || 3600,
        min_interval: options.minInterval || 3600
      },
      session
    });
  }

  async getPOIVisits(session: Session) {
    return this.makeRequest('poi-visits-detect', { session });
  }

  // Statistics API Methods
  async getGeocodingStats(session: Session, options?: {
    startDate?: string;
    endDate?: string;
    forceRefresh?: string;
  }) {
    const params: Record<string, string> = {};
    if (options?.startDate) params.start_date = options.startDate;
    if (options?.endDate) params.end_date = options.endDate;
    if (options?.forceRefresh) params.forceRefresh = options.forceRefresh;

    return this.makeRequest('statistics-geocoding-stats', { session, params });
  }

  // Health Check
  async healthCheck() {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error('Health check failed');
    }
    return response.json();
  }
}

// Export singleton instance
export const edgeFunctionsApi = new EdgeFunctionsApiService();