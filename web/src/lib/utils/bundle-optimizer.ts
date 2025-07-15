/**
 * Bundle Optimization Utilities
 * Provides dynamic imports, lazy loading, and code splitting helpers
 */

// Dynamic import helpers for code splitting
export const dynamicImports = {
	// Heavy UI components
	ui: {
		datePicker: () => import('@svelte-plugins/datepicker'),
		modal: () => import('$lib/components/ui/modal/index.svelte'),
		accessibleModal: () => import('$lib/components/ui/accessible-modal/index.svelte')
	},

	// Authentication components
	auth: {
		twoFactorSetup: () => import('$lib/components/TwoFactorSetup.svelte'),
		twoFactorVerification: () => import('$lib/components/TwoFactorVerification.svelte'),
		twoFactorDisable: () => import('$lib/components/TwoFactorDisable.svelte')
	}
};

// Lazy loading wrapper for components
export function createLazyComponent<T extends Record<string, unknown>>(
	importFn: () => Promise<T>,
	componentName: keyof T
) {
	return {
		component: null as T[keyof T] | null,
		loading: false,
		error: null as Error | null,

		async load() {
			if (this.component) return this.component;

			this.loading = true;
			this.error = null;

			try {
				const module = await importFn();
				this.component = module[componentName];
				return this.component;
			} catch (err) {
				this.error = err as Error;
				throw err;
			} finally {
				this.loading = false;
			}
		}
	};
}

// Icon lazy loading - only load icons when needed
const iconCache = new Map<string, unknown>();

export async function loadIcon(iconName: string) {
	if (iconCache.has(iconName)) {
		return iconCache.get(iconName);
	}

	try {
		const module = await import('lucide-svelte');
		const icon = (module as Record<string, unknown>)[iconName];
		if (icon) {
			iconCache.set(iconName, icon);
			return icon;
		}
		return null;
	} catch {
		console.warn(`Icon ${iconName} not found in lucide-svelte`);
		return null;
	}
}

// Preload critical resources
export const preloader = {
	// Preload critical CSS
	async preloadCriticalCSS() {
		const link = document.createElement('link');
		link.rel = 'preload';
		link.as = 'style';
		link.href = '/app.css';
		document.head.appendChild(link);
	},

	// Preload critical fonts
	async preloadFonts() {
		const fonts = [
			'/fonts/inter-var.woff2',
			'/fonts/inter-var.woff'
		];

		fonts.forEach(font => {
			const link = document.createElement('link');
			link.rel = 'preload';
			link.as = 'font';
			link.type = 'font/woff2';
			link.href = font;
			link.crossOrigin = 'anonymous';
			document.head.appendChild(link);
		});
	},

	// Preload critical images
	async preloadImages(images: string[]) {
		images.forEach(src => {
			const link = document.createElement('link');
			link.rel = 'preload';
			link.as = 'image';
			link.href = src;
			document.head.appendChild(link);
		});
	}
};

// Bundle size monitoring
export const bundleMonitor = {
	// Track component load times
	loadTimes: new Map<string, number>(),

	startTimer(componentName: string) {
		this.loadTimes.set(componentName, performance.now());
	},

	endTimer(componentName: string) {
		const startTime = this.loadTimes.get(componentName);
		if (startTime) {
			const loadTime = performance.now() - startTime;
			console.log(`📦 ${componentName} loaded in ${loadTime.toFixed(2)}ms`);
			this.loadTimes.delete(componentName);
			return loadTime;
		}
		return 0;
	},

	// Monitor bundle size
	getBundleSize() {
		if (typeof window !== 'undefined' && 'performance' in window) {
			const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
			return {
				transferSize: navigation.transferSize,
				encodedBodySize: navigation.encodedBodySize,
				decodedBodySize: navigation.decodedBodySize
			};
		}
		return null;
	}
};

// Tree shaking helpers
export const treeShaking = {
	// Only import specific functions from lodash
	lodash: {
		debounce: () => import('lodash-es/debounce'),
		throttle: () => import('lodash-es/throttle'),
		cloneDeep: () => import('lodash-es/cloneDeep'),
		isEqual: () => import('lodash-es/isEqual')
	},

	// Only import specific date functions
	dateFns: {
		format: () => import('date-fns/format'),
		parseISO: () => import('date-fns/parseISO'),
		isToday: () => import('date-fns/isToday'),
		isYesterday: () => import('date-fns/isYesterday'),
		formatDistanceToNow: () => import('date-fns/formatDistanceToNow')
	}
};

// Service worker for caching
export const serviceWorker = {
	async register() {
		if ('serviceWorker' in navigator) {
			try {
				const registration = await navigator.serviceWorker.register('/sw.js');
				console.log('📦 Service Worker registered:', registration);
				return registration;
			} catch (error) {
				console.error('📦 Service Worker registration failed:', error);
			}
		}
	},

	async unregister() {
		if ('serviceWorker' in navigator) {
			const registrations = await navigator.serviceWorker.getRegistrations();
			for (const registration of registrations) {
				await registration.unregister();
			}
		}
	}
};

// Performance monitoring
export const performanceMonitor = {
	// Track Core Web Vitals
	observeCoreWebVitals() {
		if ('PerformanceObserver' in window) {
			// LCP (Largest Contentful Paint)
			const lcpObserver = new PerformanceObserver((list) => {
				const entries = list.getEntries();
				const lastEntry = entries[entries.length - 1];
				console.log('📊 LCP:', lastEntry.startTime);
			});
			lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

			// FID (First Input Delay)
			const fidObserver = new PerformanceObserver((list) => {
				const entries = list.getEntries();
				entries.forEach((entry) => {
					const fidEntry = entry as PerformanceEntry & { processingStart?: number };
					if (fidEntry.processingStart) {
						console.log('📊 FID:', fidEntry.processingStart - entry.startTime);
					}
				});
			});
			fidObserver.observe({ entryTypes: ['first-input'] });

			// CLS (Cumulative Layout Shift)
			const clsObserver = new PerformanceObserver((list) => {
				let cls = 0;
				const entries = list.getEntries();
				entries.forEach((entry: PerformanceEntry & { value?: number; hadRecentInput?: boolean }) => {
					if (!entry.hadRecentInput && entry.value) {
						cls += entry.value;
					}
				});
				console.log('📊 CLS:', cls);
			});
			clsObserver.observe({ entryTypes: ['layout-shift'] });
		}
	},

	// Track component render times
	measureRenderTime(componentName: string, renderFn: () => void) {
		const start = performance.now();
		renderFn();
		const end = performance.now();
		console.log(`⚡ ${componentName} render time: ${(end - start).toFixed(2)}ms`);
		return end - start;
	}
};

// Export default bundle optimizer
export default {
	dynamicImports,
	createLazyComponent,
	loadIcon,
	preloader,
	bundleMonitor,
	treeShaking,
	serviceWorker,
	performanceMonitor
};