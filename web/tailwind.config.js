/** @type {import('tailwindcss').Config} */
// NOTE: Tailwind v4 reads tokens from @theme in src/app.css; this file is kept
// only for IDE hints and is not loaded unless referenced via @config.
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				// Light/dark values are owned by src/app.css (background, card, primary, ...).
			}
		}
	},
	plugins: []
};
