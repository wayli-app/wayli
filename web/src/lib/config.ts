export interface RuntimeConfig {
	supabaseUrl: string;
	supabaseAnonKey: string;
	supabaseServiceKey: string;
}

export const config = {
	get supabaseUrl(): string {
		// In development mode, use environment variables from Vite
		if (typeof process !== 'undefined' && process.env.PUBLIC_SUPABASE_URL) {
			return process.env.PUBLIC_SUPABASE_URL;
		}

		// In production, check if we're in a browser environment
		if (typeof window !== 'undefined') {
			// Check if WAYLI_CONFIG is available (production)
			if ((window as any).WAYLI_CONFIG?.supabaseUrl) {
				return (window as any).WAYLI_CONFIG.supabaseUrl;
			}

			// In development, try to get from SvelteKit's dev environment
			if ((window as any).__sveltekit_dev?.env?.PUBLIC_SUPABASE_URL) {
				return (window as any).__sveltekit_dev.env.PUBLIC_SUPABASE_URL;
			}
		}

		// Fallback for server-side or when config not loaded
		return 'http://127.0.0.1:54321';
	},
	get supabaseAnonKey(): string {
		// In development mode, use environment variables from Vite
		if (typeof process !== 'undefined' && process.env.PUBLIC_SUPABASE_ANON_KEY) {
			return process.env.PUBLIC_SUPABASE_ANON_KEY;
		}

		// In production, check if we're in a browser environment
		if (typeof window !== 'undefined') {
			// Check if WAYLI_CONFIG is available (production)
			if ((window as any).WAYLI_CONFIG?.supabaseAnonKey) {
				return (window as any).WAYLI_CONFIG.supabaseAnonKey;
			}

			// In development, try to get from SvelteKit's dev environment
			if ((window as any).__sveltekit_dev?.env?.PUBLIC_SUPABASE_ANON_KEY) {
				return (window as any).__sveltekit_dev.env.PUBLIC_SUPABASE_ANON_KEY;
			}
		}

		// Fallback for server-side or when config not loaded
		return 'default-key';
	},
	get supabaseServiceKey(): string {
		// In development mode, use environment variables from Vite
		if (typeof process !== 'undefined' && process.env.SUPABASE_SERVICE_ROLE_KEY) {
			return process.env.SUPABASE_SERVICE_ROLE_KEY;
		}

		// In production, check if we're in a browser environment
		if (typeof window !== 'undefined') {
			// Check if WAYLI_CONFIG is available (production)
			if ((window as any).WAYLI_CONFIG?.supabaseServiceKey) {
				return (window as any).WAYLI_CONFIG.supabaseServiceKey;
			}

			// In development, try to get from SvelteKit's dev environment
			if ((window as any).__sveltekit_dev?.env?.SUPABASE_SERVICE_ROLE_KEY) {
				return (window as any).__sveltekit_dev.env.SUPABASE_SERVICE_ROLE_KEY;
			}
		}

		// Fallback for server-side or when config not loaded
		return 'default-service-key';
	}
};

export type Config = typeof config;
