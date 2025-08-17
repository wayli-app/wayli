// src/lib/i18n/index.ts
// Centralized internationalization system

import { writable, derived, get } from 'svelte/store';

import { browser } from '$app/environment';

// Supported locales
export const SUPPORTED_LOCALES = ['en', 'nl'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// Default locale
export const DEFAULT_LOCALE: SupportedLocale = 'en';

// Locale store
export const currentLocale = writable<SupportedLocale>(DEFAULT_LOCALE);

// Load translation messages
async function loadMessages(locale: SupportedLocale): Promise<Record<string, string>> {
	try {
		// Try fetch approach first (working method)
		const response = await fetch(`/messages/${locale}.json`);
		if (!response.ok) {
			throw new Error(`Failed to fetch messages: ${response.status} ${response.statusText}`);
		}

		const messages = await response.json();
		return messages;
	} catch {
		// Try dynamic import as fallback
		try {
			const messages = await import(`../../../messages/${locale}.json`);
			const result = messages.default || messages;
			return result;
		} catch (dynamicError: unknown) {
			// If both fetch and dynamic import fail, try fallback to English
			console.warn(`Failed to load messages for locale ${locale}:`, dynamicError);
			if (locale !== 'en') {
				return loadMessages('en');
			}
			// Return empty object as fallback
			return {};
		}
	}
}

// Translation store
export const messages = writable<Record<string, string>>({});

// Initialize i18n system
export async function initializeI18n(): Promise<void> {
	if (!browser) {
		return;
	}

	// Detect user's preferred locale
	const detectedLocale = detectUserLocale();
	const locale = SUPPORTED_LOCALES.includes(detectedLocale) ? detectedLocale : DEFAULT_LOCALE;

	// Load messages for the detected locale
	const loadedMessages = await loadMessages(locale);

	messages.set(loadedMessages);
	currentLocale.set(locale);
}

// Detect user's preferred locale
function detectUserLocale(): SupportedLocale {
	if (!browser) return DEFAULT_LOCALE;

	// Check for stored preference
	const stored = localStorage.getItem('wayli-locale');
	if (stored && SUPPORTED_LOCALES.includes(stored as SupportedLocale)) {
		return stored;
	}

	// Check browser language
	const browserLang = navigator.language?.split('-')[0];
	if (browserLang && SUPPORTED_LOCALES.includes(browserLang as SupportedLocale)) {
		return browserLang;
	}

	// Check navigator.languages
	for (const lang of navigator.languages || []) {
		const code = lang.split('-')[0];
		if (SUPPORTED_LOCALES.includes(code as SupportedLocale)) {
			return code;
		}
	}

	return DEFAULT_LOCALE;
}

// Change locale
export async function changeLocale(locale: SupportedLocale): Promise<void> {
	if (!SUPPORTED_LOCALES.includes(locale)) {
		console.warn(`Unsupported locale: ${locale}`);
		return;
	}

	// Load new messages
	const newMessages = await loadMessages(locale);
	messages.set(newMessages);
	currentLocale.set(locale);

	// Store preference
	if (browser) {
		localStorage.setItem('wayli-locale', locale);
	}

	// Update document language
	if (browser) {
		document.documentElement.lang = locale;
	}
}

// Translation function
export function t(key: string, params?: Record<string, string | number>): string {
	const currentMessages = get(messages);
	let message = currentMessages[key] || key;

	// Replace parameters
	if (params) {
		Object.entries(params).forEach(([param, value]) => {
			message = message.replace(
				new RegExp(`\\{${param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`, 'g'),
				String(value)
			);
		});
	}

	return message;
}

// Reactive translation function
export const translate = derived([messages, currentLocale], ([$messages]) => {
	return (key: string, params?: Record<string, string | number>): string => {
		let message = $messages[key] || key;

		if (params) {
			Object.entries(params).forEach(([param, value]) => {
				message = message.replace(
					new RegExp(`\\{${param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`, 'g'),
					String(value)
				);
			});
		}

		return message;
	};
});

// Create a reactive translation function for components
export function createReactiveTranslation() {
	return derived(messages, ($messages) => {
		return (key: string, params?: Record<string, string | number>): string => {
			let message = $messages[key] || key;

			// Replace parameters
			if (params) {
				Object.entries(params).forEach(([param, value]) => {
					message = message.replace(
						new RegExp(`\\{${param.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`, 'g'),
						String(value)
					);
				});
			}

			return message;
		};
	});
}

// Date formatting
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
	const locale = get(currentLocale);
	const dateObj = typeof date === 'string' ? new Date(date) : date;

	return new Intl.DateTimeFormat(locale, {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		...options
	}).format(dateObj);
}

// Number formatting
export function formatNumber(num: number, options?: Intl.NumberFormatOptions): string {
	const locale = get(currentLocale);

	return new Intl.NumberFormat(locale, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
		...options
	}).format(num);
}

// Currency formatting
export function formatCurrency(
	amount: number,
	currency = 'USD',
	options?: Intl.NumberFormatOptions
): string {
	const locale = get(currentLocale);

	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency,
		...options
	}).format(amount);
}

// Distance formatting
export function formatDistance(meters: number, locale?: SupportedLocale): string {
	const currentLocaleValue = locale || get(currentLocale);

	if (currentLocaleValue === 'en') {
		// Imperial units for English
		const miles = meters * 0.000621371;
		if (miles < 1) {
			const feet = meters * 3.28084;
			return `${Math.round(feet)} ft`;
		}
		return `${miles.toFixed(1)} mi`;
	} else {
		// Metric units for other locales
		if (meters < 1000) {
			return `${Math.round(meters)} m`;
		}
		const km = meters / 1000;
		return `${km.toFixed(1)} km`;
	}
}

// Time formatting
export function formatTime(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, '0')}`;
	}
	return `${minutes}:00`;
}

// Pluralization
export function pluralize(count: number, singular: string, plural: string): string {
	const locale = get(currentLocale);

	if (locale === 'nl') {
		// Dutch pluralization rules
		return count === 1 ? singular : plural;
	} else {
		// English pluralization rules
		return count === 1 ? singular : plural;
	}
}

// Export types for type safety
export type TranslationKey = string;

// Type-safe translation function
export function typedT(key: TranslationKey, params?: Record<string, string | number>): string {
	return t(key, params);
}

// Country name translation
export function getCountryName(countryCode: string): string {
	if (!countryCode || countryCode.length !== 2) {
		return countryCode;
	}

	const key = `country.${countryCode.toUpperCase()}` as TranslationKey;
	const currentMessages = get(messages);

	// Check if the key exists
	if (key in currentMessages) {
		const translatedName = currentMessages[key];
		return translatedName as string;
	} else {
		// Try English fallback
		const englishKey = `country.${countryCode.toUpperCase()}` as TranslationKey;
		if (englishKey in currentMessages) {
			const englishName = currentMessages[englishKey];
			return englishName as string;
		}
		return countryCode.toUpperCase();
	}
}

// Reactive country name translation
export const getCountryNameReactive = derived([messages, currentLocale], ([$messages]) => {
	return (countryCode: string): string => {
		if (!countryCode || countryCode.length !== 2) {
			return countryCode;
		}

		const key = `country.${countryCode.toUpperCase()}` as TranslationKey;

		// Check if the key exists
		if (key in $messages) {
			const translatedName = $messages[key];
			return translatedName as string;
		} else {
			return countryCode.toUpperCase();
		}
	};
});
