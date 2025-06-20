import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'light' | 'dark' | 'system';

function createThemeStore() {
	const { subscribe, set, update } = writable<Theme>('system');

	function setTheme(theme: Theme) {
		if (!browser) return;

		set(theme);
		localStorage.setItem('theme', theme);

		// Apply theme to document
		applyThemeToDocument(theme);
	}

	function applyThemeToDocument(theme: Theme) {
		if (!browser) return;

		const root = document.documentElement;
		root.classList.remove('light', 'dark');

		if (theme === 'system') {
			// Check system preference
			const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			root.classList.add(systemPrefersDark ? 'dark' : 'light');
		} else {
			root.classList.add(theme);
		}
	}

	function initialize() {
		if (!browser) return;

		// Get saved theme or default to system
		const savedTheme = localStorage.getItem('theme') as Theme | null;
		const theme = savedTheme || 'system';

		set(theme);
		applyThemeToDocument(theme);

		// Listen for system theme changes
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		mediaQuery.addEventListener('change', (e) => {
			// Re-apply system theme if current theme is system
			const savedTheme = localStorage.getItem('theme') as Theme | null;
			if (savedTheme === 'system') {
				applyThemeToDocument('system');
			}
		});
	}

	return {
		subscribe,
		set: setTheme,
		update,
		initialize
	};
}

export const themeStore = createThemeStore();

// Helper function to get current theme
export function getTheme(): Theme {
	let currentTheme: Theme = 'system';
	themeStore.subscribe(theme => {
		currentTheme = theme;
	})();
	return currentTheme;
}

// Initialize theme on import if in browser
if (browser) {
	themeStore.initialize();
}