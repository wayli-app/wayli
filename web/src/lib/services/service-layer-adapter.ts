/**
 * Service Layer Adapter
 *
 * Provides integration between existing services and the service layer architecture.
 * This adapter allows existing services to work with the service container pattern
 * without requiring them to implement the IService interface.
 *
 * @file src/lib/services/service-layer-adapter.ts
 * @author Wayli Development Team
 * @version 1.0.0
 */

import { serviceManager } from '$lib/architecture/service-layer';
import { errorHandler } from './error-handler.service';
import { rateLimitService } from './rate-limit.service';
import { logger } from './logging.service';

import { TripsService } from './trips.service';
import { StatisticsService } from './statistics.service';
import { LocationCacheService } from './location-cache.service';

import { WantToVisitService } from './want-to-visit.service';


/**
 * Service Layer Adapter for managing application services
 * This version only includes client-safe services
 */
export class ServiceLayerAdapter {
	private static instance: ServiceLayerAdapter;
	private services = new Map<string, any>();
	private initialized = false;

	static getInstance(): ServiceLayerAdapter {
		if (!ServiceLayerAdapter.instance) {
			ServiceLayerAdapter.instance = new ServiceLayerAdapter();
		}
		return ServiceLayerAdapter.instance;
	}

	/**
	 * Initialize the service layer adapter
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			// Initialize core service layer
			await serviceManager.initialize();

			// Register client-safe services only
			this.registerClientSafeServices();

			this.initialized = true;
			logger.info('Service layer adapter initialized (client-safe services only)');
		} catch (error) {
			logger.error('Failed to initialize service layer adapter', { error });
			throw error;
		}
	}

	/**
	 * Register client-safe services only
	 */
	private registerClientSafeServices(): void {
		// Core services (already managed by service layer)
		this.services.set('errorHandler', errorHandler);
		this.services.set('rateLimit', rateLimitService);
		this.services.set('logger', logger);

		// Client-safe application services
		this.services.set('trips', new TripsService());
		this.services.set('statistics', new StatisticsService());
		this.services.set('wantToVisit', new WantToVisitService());

		logger.info('Client-safe services registered', {
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
			throw new Error(`Service ${name} not found`);
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
	 * Destroy the service layer adapter
	 */
	async destroy(): Promise<void> {
		try {
			await serviceManager.destroy();
			this.services.clear();
			this.initialized = false;
			logger.info('Service layer adapter destroyed');
		} catch (error) {
			logger.error('Failed to destroy service layer adapter', { error });
			throw error;
		}
	}
}

// Export singleton instance
export const serviceAdapter = ServiceLayerAdapter.getInstance();

/**
 * Convenience functions for accessing client-safe services
 */

/**
 * Get the error handler service
 */
export function getErrorHandler() {
	return serviceAdapter.getService('errorHandler');
}

/**
 * Get the rate limit service
 */
export function getRateLimitService() {
	return serviceAdapter.getService('rateLimit');
}

/**
 * Get the logger service
 */
export function getLogger() {
	return serviceAdapter.getService('logger');
}



/**
 * Get the trips service
 */
export function getTripsService() {
	return serviceAdapter.getService<TripsService>('trips');
}

/**
 * Get the statistics service
 */
export function getStatisticsService() {
	return serviceAdapter.getService<StatisticsService>('statistics');
}

/**
 * Get the location cache service (static utility)
 */
export function getLocationCacheService() {
	return LocationCacheService;
}



/**
 * Get the want to visit service
 */
export function getWantToVisitService() {
	return serviceAdapter.getService<WantToVisitService>('wantToVisit');
}


