/**
 * Server-Only Service Layer Adapter
 *
 * Provides access to services that require server environment variables.
 * This adapter should only be used in server-side code (API routes, server actions, etc.).
 *
 * @file src/lib/services/server-service-adapter.ts
 * @author Wayli Development Team
 * @version 1.0.0
 */

import { AuditLoggerService } from '../audit-logger.service';
import { TripImageSuggestionService } from '../trip-image-suggestion.service';
import { EnhancedPoiDetectionService } from '../enhanced-poi-detection.service';
import { EnhancedTripDetectionService } from '../enhanced-trip-detection.service';
import { TOTPService } from '../totp.service';
import { UserProfileService } from '../user-profile.service';
import { TripLocationsService } from '../trip-locations.service';
import { ServerStatisticsService } from '../server-statistics.service';

/**
 * Server-Only Service Layer Adapter for managing server-side services
 */
export class ServerServiceAdapter {
	private static instance: ServerServiceAdapter;
	private services = new Map<string, any>();
	private initialized = false;

	static getInstance(): ServerServiceAdapter {
		if (!ServerServiceAdapter.instance) {
			ServerServiceAdapter.instance = new ServerServiceAdapter();
		}
		return ServerServiceAdapter.instance;
	}

	/**
	 * Initialize the server service layer adapter
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			// Register server-only services
			this.registerServerServices();

			this.initialized = true;
			console.log('[ServerServiceAdapter] Server-only services initialized');
		} catch (error) {
			console.error('[ServerServiceAdapter] Failed to initialize server services:', error);
			throw error;
		}
	}

	/**
	 * Register server-only services
	 */
	private registerServerServices(): void {
		// Server-only application services
		this.services.set('auditLogger', new AuditLoggerService());
		this.services.set('tripImageSuggestion', new TripImageSuggestionService());
		this.services.set('poiDetection', new EnhancedPoiDetectionService());
		this.services.set('tripDetection', new EnhancedTripDetectionService());
		this.services.set('totp', new TOTPService());
		this.services.set('userProfile', new UserProfileService());
		this.services.set('tripLocations', new TripLocationsService());
		this.services.set('statistics', new ServerStatisticsService());

		console.log('[ServerServiceAdapter] Server-only services registered', {
			serviceCount: this.services.size,
			services: Array.from(this.services.keys())
		});
	}

	/**
	 * Get a service by name
	 */
	getService<T>(name: string): T {
		const service = this.services.get(name);
		if (!service) {
			throw new Error(`Server service ${name} not found`);
		}
		return service as T;
	}

	/**
	 * Get a service with type safety
	 */
	getTypedService<T>(name: string): T {
		return this.getService<T>(name);
	}

	/**
	 * Check if a service exists
	 */
	hasService(name: string): boolean {
		return this.services.has(name);
	}

	/**
	 * Get all registered service names
	 */
	getServiceNames(): string[] {
		return Array.from(this.services.keys());
	}

	/**
	 * Destroy the server service layer adapter
	 */
	async destroy(): Promise<void> {
		try {
			this.services.clear();
			this.initialized = false;
			console.log('[ServerServiceAdapter] Server services destroyed');
		} catch (error) {
			console.error('[ServerServiceAdapter] Failed to destroy server services:', error);
			throw error;
		}
	}
}

// Export singleton instance
export const serverServiceAdapter = ServerServiceAdapter.getInstance();

/**
 * Convenience functions for accessing server-only services
 */

/**
 * Get the audit logger service
 */
export function getAuditLoggerService() {
	return serverServiceAdapter.getService<AuditLoggerService>('auditLogger');
}

/**
 * Get the trip image suggestion service
 */
export function getTripImageSuggestionService() {
	return serverServiceAdapter.getService<TripImageSuggestionService>('tripImageSuggestion');
}

/**
 * Get the POI detection service
 */
export function getPoiDetectionService() {
	return serverServiceAdapter.getService<EnhancedPoiDetectionService>('poiDetection');
}

/**
 * Get the trip detection service
 */
export function getTripDetectionService() {
	return serverServiceAdapter.getService<EnhancedTripDetectionService>('tripDetection');
}

/**
 * Get the TOTP service
 */
export function getTOTPService() {
	return serverServiceAdapter.getService<TOTPService>('totp');
}

/**
 * Get the user profile service
 */
export function getUserProfileService() {
	return serverServiceAdapter.getService<UserProfileService>('userProfile');
}

/**
 * Get the trip locations service
 */
export function getTripLocationsService() {
	return serverServiceAdapter.getService<TripLocationsService>('tripLocations');
}

/**
 * Get the statistics service
 */
export function getStatisticsService() {
	return serverServiceAdapter.getService<ServerStatisticsService>('statistics');
}