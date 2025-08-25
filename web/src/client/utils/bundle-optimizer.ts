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
 * Loads an icon component dynamically from lucide-svelte
 */
export async function loadIcon(iconName: string) {
	try {
		const icons = await import('lucide-svelte');
		return icons[iconName as keyof typeof icons];
	} catch (error) {
		console.error(`Failed to load icon ${iconName}:`, error);
		return null;
	}
}

/**
 * Preloads a component in the background for faster subsequent loads
 */
export function preloadComponent(importFn: () => Promise<unknown>, name: string) {
	const schedule = window.requestIdleCallback || ((fn: () => void) => setTimeout(fn, 100));
	schedule(() => {
		importFn().catch((error) => {
			console.warn(`Preload failed for ${name}:`, error);
		});
	});
}

// Satisfy bundleMonitor import in Icon.svelte
export const bundleMonitor = {
	startTimer: () => {},
	endTimer: () => {}
};
