import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { svelteTesting } from '@testing-library/svelte/vite';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['url', 'cookie', 'baseLocale']
		})
	],
	define: {
		// Only expose public environment variables to the client
		'process.env': {
			PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
			PUBLIC_SUPABASE_ANON_KEY:
				process.env.PUBLIC_SUPABASE_ANON_KEY ||
				'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
			NODE_ENV: process.env.NODE_ENV || 'development'
		}
	},
	build: {
		// Enable source maps for debugging
		sourcemap: process.env.NODE_ENV === 'development',

		// Optimize chunk splitting
		rollupOptions: {
			output: {
				// Manual chunk splitting for better caching
				manualChunks: {
					// Vendor chunks
					vendor: ['svelte', '@sveltejs/kit'],
					supabase: ['@supabase/supabase-js', '@supabase/ssr'],
					ui: ['@melt-ui/svelte', 'lucide-svelte', 'clsx', 'tailwind-merge'],
					utils: ['date-fns', 'lodash-es', 'uuid', 'zod'],
					maps: ['leaflet', '@turf/turf'],
					auth: ['otplib', 'qrcode']
				},

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
		minify: 'terser',
		terserOptions: {
			compress: {
				drop_console: process.env.NODE_ENV === 'production',
				drop_debugger: true,
				pure_funcs: ['console.log', 'console.info', 'console.debug']
			}
		},

		// Chunk size warnings
		chunkSizeWarningLimit: 1000
	},

	// Optimize dependencies
	optimizeDeps: {
		include: [
			'svelte',
			'@sveltejs/kit',
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
		],
		exclude: ['@sveltejs/adapter-static']
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
		host: true
	},

	test: {
		projects: [
			{
				extends: './vite.config.ts',
				plugins: [svelteTesting()],
				test: {
					name: 'client',
					environment: 'jsdom',
					clearMocks: true,
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
