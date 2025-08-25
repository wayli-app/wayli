import adapter from '@sveltejs/adapter-auto';

const config = {
	kit: {
		adapter: adapter(),
		csrf: {
			checkOrigin: false
		}
	}
};

export default config;
