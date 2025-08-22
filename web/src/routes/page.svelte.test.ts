import { describe, test, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';

// Mock the i18n module
vi.mock('$lib/i18n', () => ({
	translate: {
		subscribe: vi.fn((fn) => {
			fn(vi.fn((key: string) => key)); // Call the callback with a translation function
			return { unsubscribe: vi.fn() };
		})
	},
	messages: {
		subscribe: vi.fn((fn) => {
			fn({ 'landing.welcomeTo': 'Welcome to' }); // Call the callback with some messages
			return { unsubscribe: vi.fn() };
		})
	},
	currentLocale: {
		subscribe: vi.fn((fn) => {
			fn('en'); // Call the callback with 'en'
			return { unsubscribe: vi.fn() };
		})
	}
}));

import Page from './+page.svelte';

describe('/+page.svelte', () => {
	test('should render h1', () => {
		render(Page);
		expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
	});
});
