/**
 * Bundle Optimization Utilities
 *
 * Provides utilities for code splitting, lazy loading, and bundle optimization
 * to improve application performance and reduce initial bundle size.
 *
 * @file src/lib/utils/bundle-optimizer.ts
 * @author Wayli Development Team
 * @version 1.0.0
 */

/**
 * Lazy loading configuration for different component types
 */
export interface LazyLoadConfig {
	/** Component name for debugging */
	name: string;
	/** Import function that returns a promise */
	importFn: () => Promise<any>;
	/** Loading component to show while loading */
	loadingComponent?: any;
	/** Error component to show if loading fails */
	errorComponent?: any;
	/** Timeout in milliseconds */
	timeout?: number;
}

/**
 * Dynamic import utilities for code splitting
 */
export class BundleOptimizer {
	/**
	 * Creates a lazy-loaded component with error handling and loading states
	 *
	 * @param config - Lazy loading configuration
	 * @returns Promise that resolves to the component
	 *
	 * @example
	 * ```typescript
	 * const LazyMapComponent = createLazyComponent({
	 *   name: 'MapComponent',
	 *   importFn: () => import('$lib/components/Map.svelte'),
	 *   timeout: 10000
	 * });
	 * ```
	 */
	static createLazyComponent(config: LazyLoadConfig) {
		return async () => {
			try {
				const timeout = config.timeout || 10000;

				// Create a promise that rejects after timeout
				const timeoutPromise = new Promise((_, reject) => {
					setTimeout(() => reject(new Error(`Loading timeout for ${config.name}`)), timeout);
				});

				// Race between import and timeout
				const component = await Promise.race([config.importFn(), timeoutPromise]);

				return component;
			} catch (error) {
				console.error(`Failed to load component ${config.name}:`, error);

				if (config.errorComponent) {
					return config.errorComponent;
				}

				throw error;
			}
		};
	}

	/**
	 * Preloads a component in the background for faster subsequent loads
	 *
	 * @param importFn - Import function for the component
	 * @param name - Component name for debugging
	 *
	 * @example
	 * ```typescript
	 * // Preload heavy components in the background
	 * BundleOptimizer.preloadComponent(
	 *   () => import('$lib/components/Statistics.svelte'),
	 *   'Statistics'
	 * );
	 * ```
	 */
	static preloadComponent(importFn: () => Promise<any>, name: string) {
		// Use requestIdleCallback if available, otherwise setTimeout
		const schedule = window.requestIdleCallback || ((fn: () => void) => setTimeout(fn, 100));

		schedule(() => {
			importFn().catch((error) => {
				console.warn(`Preload failed for ${name}:`, error);
			});
		});
	}

	/**
	 * Creates a route-based code splitter for SvelteKit pages
	 *
	 * @param routePath - Path to the route component
	 * @param options - Additional options
	 * @returns Lazy loading configuration
	 *
	 * @example
	 * ```typescript
	 * const StatisticsPage = BundleOptimizer.createRouteSplitter(
	 *   '$lib/routes/(user)/dashboard/statistics/+page.svelte'
	 * );
	 * ```
	 */
	static createRouteSplitter(routePath: string, options: Partial<LazyLoadConfig> = {}) {
		return this.createLazyComponent({
			name: routePath.split('/').pop() || 'Unknown',
			importFn: () => import(routePath),
			timeout: 15000,
			...options
		});
	}

	/**
	 * Creates a library splitter for heavy third-party libraries
	 *
	 * @param libraryName - Name of the library
	 * @param importFn - Import function
	 * @returns Lazy loading configuration
	 *
	 * @example
	 * ```typescript
	 * const LeafletMap = BundleOptimizer.createLibrarySplitter(
	 *   'leaflet',
	 *   () => import('leaflet')
	 * );
	 * ```
	 */
	static createLibrarySplitter(libraryName: string, importFn: () => Promise<any>) {
		return this.createLazyComponent({
			name: libraryName,
			importFn,
			timeout: 20000
		});
	}

	/**
	 * Optimizes icon imports by loading only needed icons
	 *
	 * @param iconName - Name of the icon to load
	 * @returns Promise that resolves to the icon component
	 *
	 * @example
	 * ```typescript
	 * const MapPinIcon = await BundleOptimizer.loadIcon('MapPin');
	 * ```
	 */
	static async loadIcon(iconName: string) {
		try {
			const icons = await import('lucide-svelte');
			return icons[iconName as keyof typeof icons];
		} catch (error) {
			console.error(`Failed to load icon ${iconName}:`, error);
			// Return a fallback icon or null
		return null;
	}
}

	/**
	 * Creates a component registry for managing lazy-loaded components
	 */
	static createComponentRegistry() {
		const registry = new Map<string, LazyLoadConfig>();

		return {
			/**
			 * Registers a component for lazy loading
			 */
			register(name: string, config: LazyLoadConfig) {
				registry.set(name, config);
			},

			/**
			 * Loads a registered component
			 */
			async load(name: string) {
				const config = registry.get(name);
				if (!config) {
					throw new Error(`Component ${name} not found in registry`);
				}
				return BundleOptimizer.createLazyComponent(config)();
			},

			/**
			 * Preloads all registered components
			 */
			preloadAll() {
				for (const [name, config] of registry) {
					BundleOptimizer.preloadComponent(config.importFn, name);
				}
			}
		};
	}

	/**
	 * Analyzes bundle size and provides optimization recommendations
	 *
	 * @param bundleStats - Bundle statistics (if available)
	 * @returns Optimization recommendations
	 */
	static analyzeBundle(bundleStats?: any) {
		const recommendations = [];

		// Check for large dependencies
		if (bundleStats?.dependencies) {
			const largeDeps = Object.entries(bundleStats.dependencies)
				.filter(([_, size]: [string, any]) => size > 100 * 1024) // > 100KB
				.map(([name, size]: [string, any]) => ({ name, size }));

			if (largeDeps.length > 0) {
				recommendations.push({
					type: 'large-dependencies',
					message: 'Consider code splitting for large dependencies',
					dependencies: largeDeps
				});
			}
		}

		// Check for duplicate dependencies
		if (bundleStats?.duplicates) {
			recommendations.push({
				type: 'duplicate-dependencies',
				message: 'Remove duplicate dependencies to reduce bundle size',
				duplicates: bundleStats.duplicates
			});
		}

		return recommendations;
	}

	/**
	 * Creates a performance monitor for bundle loading
	 */
	static createPerformanceMonitor() {
		return {
			/**
			 * Measures component loading time
			 */
			async measureLoadTime<T>(loader: () => Promise<T>, name: string): Promise<T> {
				const start = performance.now();
				try {
					const result = await loader();
					const duration = performance.now() - start;

					// Log performance data
					console.log(`Component ${name} loaded in ${duration.toFixed(2)}ms`);

					// Send to analytics if available
					if (typeof window !== 'undefined' && (window as any).gtag) {
						(window as any).gtag('event', 'component_load', {
							component_name: name,
							load_time: duration
						});
					}

					return result;
				} catch (error) {
					const duration = performance.now() - start;
					console.error(`Component ${name} failed to load after ${duration.toFixed(2)}ms:`, error);
					throw error;
				}
			},

			/**
			 * Tracks bundle size changes
			 */
			trackBundleSize() {
				if (typeof window !== 'undefined' && 'performance' in window) {
					const observer = new PerformanceObserver((list) => {
						for (const entry of list.getEntries()) {
							if (entry.entryType === 'resource' && entry.name.includes('.js')) {
								console.log(`Bundle loaded: ${entry.name} (${(entry as any).transferSize} bytes)`);
							}
						}
					});

					observer.observe({ entryTypes: ['resource'] });
				}
			}
		};
	}
}

/**
 * Predefined lazy loading configurations for common components
 */
export const LazyComponents = {
	/**
	 * Heavy map components
	 */
	Map: BundleOptimizer.createLazyComponent({
		name: 'Map',
		importFn: () => import('$lib/components/Map.svelte'),
		timeout: 15000
	}),

	/**
	 * Statistics and analytics components
	 */
	Statistics: BundleOptimizer.createLazyComponent({
		name: 'Statistics',
		importFn: () => import('$lib/components/Statistics.svelte'),
		timeout: 10000
	}),

	/**
	 * Chart components
	 */
	Charts: BundleOptimizer.createLazyComponent({
		name: 'Charts',
		importFn: () => import('$lib/components/Charts.svelte'),
		timeout: 10000
	}),

	/**
	 * Heavy third-party libraries
	 */
	Leaflet: BundleOptimizer.createLibrarySplitter('leaflet', () => import('leaflet')),
	Turf: BundleOptimizer.createLibrarySplitter('@turf/turf', () => import('@turf/turf'))
};

/**
 * Utility function for creating lazy-loaded routes
 */
export function createLazyRoute(routePath: string) {
	return BundleOptimizer.createRouteSplitter(routePath);
}

/**
 * Utility function for preloading components
 */
export function preloadComponent(importFn: () => Promise<any>, name: string) {
	return BundleOptimizer.preloadComponent(importFn, name);
}
