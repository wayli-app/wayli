import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'path';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['tests/**/*.{test,spec}.{js,ts}', 'src/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**',
        '**/dist/**',
        '**/.svelte-kit/**'
      ]
    }
  },
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, './src/lib'),
      $app: path.resolve(__dirname, './src/app'),
      $components: path.resolve(__dirname, './src/lib/components'),
      $stores: path.resolve(__dirname, './src/lib/stores'),
      $utils: path.resolve(__dirname, './src/lib/utils'),
      $services: path.resolve(__dirname, './src/lib/services'),
      $types: path.resolve(__dirname, './src/lib/types')
    }
  }
});