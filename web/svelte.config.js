import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltekit/vite-plugin-svelte';

const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false,
			strict: false
		}),
		csrf: {
			checkOrigin: false
		}
	}
};

export default config;
