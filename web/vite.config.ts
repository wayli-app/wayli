import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Vite Configuration
 *
 * Environment Variables:
 * - VITE_ALLOWED_HOSTS: Comma-separated list of allowed hosts for preview server
 *   Example: "wayli.app,staging.wayli.app,dev.wayli.app"
 *
 * Note: The preview server's allowedHosts check is a security feature to prevent
 * host header attacks. Since you're using HTTPS in production, this check
 * provides minimal additional security benefit.
 */

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
	],
	define: {
		// Only expose public environment variables to the client
		'process.env': {
			PUBLIC_SUPABASE_ANON_KEY:
				process.env.PUBLIC_SUPABASE_ANON_KEY ||
				'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
			NODE_ENV: process.env.NODE_ENV || 'development'
		}
	},
	build: {
		// Enable source maps for debugging
		sourcemap: process.env.NODE_ENV === 'development',

		// Optimize chunk splitting
		rollupOptions: {
			output: {
				// Optimize chunk naming
				chunkFileNames: 'js/[name]-[hash].js',
				entryFileNames: 'js/[name]-[hash].js',
				assetFileNames: (assetInfo) => {
					const info = assetInfo.name?.split('.') || [];
					const ext = info[info.length - 1];
					if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
						return `images/[name]-[hash][extname]`;
					}
					if (/css/i.test(ext)) {
						return `css/[name]-[hash][extname]`;
					}
					return `assets/[name]-[hash][extname]`;
				}
			}
		},

		// Optimize build performance
		target: 'esnext',
		minify: 'esbuild',

		// Chunk size warnings
		chunkSizeWarningLimit: 1000
	},

	// Optimize dependencies
	optimizeDeps: {
		include: [
			'svelte',
			'@supabase/supabase-js',
			'@supabase/ssr',
			'lucide-svelte',
			'date-fns',
			'lodash-es',
			'leaflet',
			'@turf/turf',
			'otplib',
			'qrcode',
			'zod'
		]
	},

	// Server configuration
	server: {
		// Enable HMR with optimized settings
		hmr: {
			overlay: false
		}
	},

	// Preview configuration
	preview: {
		port: 4173,
		host: true,
		allowedHosts: [
			// Allow localhost for development
			'localhost',
			'127.0.0.1',
			// Allow production domains from environment variable
			...(process.env.VITE_ALLOWED_HOSTS ? process.env.VITE_ALLOWED_HOSTS.split(',') : []),
		]
	}
});
