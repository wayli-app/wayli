# Internationalization (i18n) Guide - Wayli

This guide covers the internationalization system used in Wayli, including setup, usage patterns, and best practices.

## 🌍 Overview

Wayli uses a centralized i18n system built with Svelte stores and supports multiple locales. The system provides:

- **Type-safe translations** with TypeScript support
- **Reactive translation updates** when locale changes
- **Automatic locale detection** based on browser settings
- **Comprehensive formatting utilities** for dates, numbers, currencies, and distances
- **Pluralization support** for different languages

## 🚀 Quick Start

### Basic Usage

```svelte
<script lang="ts">
	import { t, translate } from '$lib/i18n';

	// Simple translation
	const message = t('welcomeBack');

	// Reactive translation (updates when locale changes)
	$: welcomeMessage = translate('welcomeBack');

	// Translation with parameters
	const greeting = t('welcomeBack', { name: 'John' });
</script>

<h1>{welcomeMessage}</h1><p>{greeting}</p>
```

### Component Usage

```svelte
<script lang="ts">
	import { translate } from '$lib/i18n';

	// Reactive translation function
	$: t = translate;
</script>

<button>{t('startTracking')}</button><p>{t('totalDistance')}: 5.2 km</p>
```

## 📁 File Structure

```
src/
├── lib/
│   ├── i18n/
│   │   └── index.ts              # Main i18n system
│   └── components/
│       └── ui/
│           └── language-switcher.svelte  # Language switcher component
├── messages/
│   ├── en.json                   # English translations
│   └── nl.json                   # Dutch translations
└── docs/
    └── i18n-guide.md             # This guide
```

## 🔧 Configuration

### Supported Locales

```typescript
// src/lib/i18n/index.ts
export const SUPPORTED_LOCALES = ['en', 'nl'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en';
```

### Adding a New Locale

1. **Create translation file**:

   ```bash
   cp messages/en.json messages/fr.json
   ```

2. **Update supported locales**:

   ```typescript
   export const SUPPORTED_LOCALES = ['en', 'nl', 'fr'] as const;
   ```

3. **Add locale metadata**:

   ```typescript
   const localeNames: Record<SupportedLocale, string> = {
   	en: 'English',
   	nl: 'Nederlands',
   	fr: 'Français'
   };

   const localeFlags: Record<SupportedLocale, string> = {
   	en: '🇺🇸',
   	nl: '🇳🇱',
   	fr: '🇫🇷'
   };
   ```

## 📝 Translation Files

### Structure

Translation files use the Inlang message format:

```json
{
	"$schema": "https://inlang.com/schema/inlang-message-format",

	"// Section Comment": "",
	"key": "Translation",
	"keyWithParams": "Hello {name}, you have {count} messages",

	"// Another Section": "",
	"anotherKey": "Another translation"
}
```

### Organization

Translations are organized by feature/section:

- **Landing Page**: Hero section, features, CTA
- **Navigation**: Menu items, breadcrumbs
- **Authentication**: Login, signup, password reset
- **Dashboard**: Stats, tracking controls
- **Trips**: Trip management, CRUD operations
- **Statistics**: Charts, filters, exports
- **Settings**: User preferences, privacy
- **Profile**: User information
- **Privacy**: Data controls, retention
- **Notifications**: Alert settings
- **Map**: Map controls, location details
- **Time and Date**: Date formatting, months, days
- **Units**: Distance, time, speed units
- **Transport Modes**: Travel method detection
- **Errors**: Error messages, validation
- **Success Messages**: Confirmation messages
- **Confirmation Dialogs**: User confirmations
- **Loading States**: Loading indicators
- **Empty States**: No data messages
- **Accessibility**: ARIA labels, screen reader text

## 🛠️ API Reference

### Core Functions

#### `t(key: string, params?: Record<string, string | number>): string`

Simple translation function:

```typescript
import { t } from '$lib/i18n';

// Basic translation
const message = t('welcomeBack');

// With parameters
const greeting = t('welcomeBack', { name: 'John' });
```

#### `translate: (key: string, params?: Record<string, string | number>) => string`

Reactive translation function that updates when locale changes:

```typescript
import { translate } from '$lib/i18n';

// Reactive translation
$: message = translate('welcomeBack');
$: greeting = translate('welcomeBack', { name: 'John' });
```

#### `typedT(key: TranslationKey, params?: Record<string, string | number>): string`

Type-safe translation function:

```typescript
import { typedT } from '$lib/i18n';

// Type-safe translation (only accepts valid keys)
const message = typedT('welcomeBack');
```

### Locale Management

#### `currentLocale: WritableStore<SupportedLocale>`

Current locale store:

```typescript
import { currentLocale } from '$lib/i18n';

// Get current locale
const locale = get(currentLocale);

// Set locale
currentLocale.set('nl');
```

#### `changeLocale(locale: SupportedLocale): Promise<void>`

Change the application locale:

```typescript
import { changeLocale } from '$lib/i18n';

await changeLocale('nl');
```

#### `initializeI18n(): Promise<void>`

Initialize the i18n system:

```typescript
import { initializeI18n } from '$lib/i18n';

// Call in app initialization
await initializeI18n();
```

### Formatting Functions

#### `formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string`

Format dates according to locale:

```typescript
import { formatDate } from '$lib/i18n';

const date = new Date();
const formatted = formatDate(date); // "January 15, 2024"
const short = formatDate(date, { month: 'short', day: 'numeric' }); // "Jan 15"
```

#### `formatNumber(num: number, options?: Intl.NumberFormatOptions): string`

Format numbers according to locale:

```typescript
import { formatNumber } from '$lib/i18n';

const num = 1234.56;
const formatted = formatNumber(num); // "1,234.56" (en) or "1.234,56" (nl)
```

#### `formatCurrency(amount: number, currency = 'USD', options?: Intl.NumberFormatOptions): string`

Format currency according to locale:

```typescript
import { formatCurrency } from '$lib/i18n';

const amount = 1234.56;
const formatted = formatCurrency(amount, 'USD'); // "$1,234.56"
const euro = formatCurrency(amount, 'EUR'); // "€1.234,56" (nl)
```

#### `formatDistance(meters: number, locale?: SupportedLocale): string`

Format distances with appropriate units:

```typescript
import { formatDistance } from '$lib/i18n';

const distance = 1500;
const formatted = formatDistance(distance); // "1.5 km" (nl) or "0.9 mi" (en)
```

#### `formatTime(seconds: number): string`

Format time durations:

```typescript
import { formatTime } from '$lib/i18n';

const time = 3661; // 1 hour, 1 minute, 1 second
const formatted = formatTime(time); // "1:01"
```

#### `pluralize(count: number, singular: string, plural: string): string`

Handle pluralization:

```typescript
import { pluralize } from '$lib/i18n';

const count = 5;
const message = pluralize(count, 'trip', 'trips'); // "5 trips"
```

## 🎨 Components

### Language Switcher

The `LanguageSwitcher` component provides a user-friendly way to change languages:

```svelte
<script lang="ts">
	import LanguageSwitcher from '$lib/components/ui/language-switcher.svelte';
</script>

<LanguageSwitcher
	size="md"
	showLabel={true}
	on:change={({ detail }) => {
		console.log('Language changed to:', detail.locale);
	}}
/>
```

#### Props

- `size`: `'sm' | 'md' | 'lg'` - Size of the switcher
- `showLabel`: `boolean` - Whether to show the language name
- `variant`: `'button' | 'select'` - Visual variant (future use)

#### Events

- `change`: Fired when language is changed
  - `detail.locale`: The new locale

## 🔄 Integration Patterns

### App Initialization

```typescript
// src/app.html
<script>
  import { initializeI18n } from '$lib/i18n';

  // Initialize i18n on app load
  initializeI18n();
</script>
```

### Layout Integration

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import { currentLocale } from '$lib/i18n';
	import LanguageSwitcher from '$lib/components/ui/language-switcher.svelte';
</script>

<header>
	<nav>
		<!-- Navigation items -->
	</nav>
	<LanguageSwitcher size="sm" />
</header>

<main>
	<slot />
</main>

<!-- Update document language when locale changes -->
<svelte:head>
	<html lang={$currentLocale} />
</svelte:head>
```

### Component Integration

```svelte
<!-- Example component with i18n -->
<script lang="ts">
	import { translate } from '$lib/i18n';
	import { formatDate, formatDistance } from '$lib/i18n';

	export let trip: Trip;

	$: t = translate;
	$: formattedDate = formatDate(trip.startDate);
	$: formattedDistance = formatDistance(trip.distance);
</script>

<div class="trip-card">
	<h3>{t('tripName')}: {trip.name}</h3>
	<p>{t('startDate')}: {formattedDate}</p>
	<p>{t('distance')}: {formattedDistance}</p>
	<p>{t('status')}: {t(trip.status)}</p>
</div>
```

## 📊 Best Practices

### 1. Use Type-Safe Translations

Prefer `typedT` for compile-time safety:

```typescript
// ✅ Good
const message = typedT('welcomeBack');

// ❌ Avoid
const message = t('welcomeBack'); // No type checking
```

### 2. Use Reactive Translations in Components

Use the reactive `translate` function in Svelte components:

```svelte
<script lang="ts">
	import { translate } from '$lib/i18n';

	$: t = translate;
</script>

<button>{t('startTracking')}</button>
```

### 3. Organize Translation Keys

Use consistent naming and organization:

```json
{
	"// Feature": "",
	"featureAction": "Action",
	"featureDescription": "Description",
	"featureError": "Error message"
}
```

### 4. Use Parameters for Dynamic Content

```typescript
// ✅ Good
const message = t('welcomeBack', { name: userName });

// ❌ Avoid
const message = `Welcome back, ${userName}`;
```

### 5. Handle Pluralization

```typescript
const message = pluralize(count, 'trip', 'trips');
// or use ICU message format for complex pluralization
```

### 6. Format Data Appropriately

```typescript
// Use locale-aware formatting
const date = formatDate(trip.startDate);
const distance = formatDistance(trip.distance);
const currency = formatCurrency(trip.cost, 'USD');
```

### 7. Test Translations

```typescript
// Test that all keys exist
const testTranslation = (key: string) => {
	const result = t(key);
	return result !== key; // Should not return the key if translation exists
};
```

## 🧪 Testing

### Unit Tests

```typescript
// tests/unit/i18n.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { t, changeLocale, formatDate, formatDistance } from '$lib/i18n';

describe('i18n', () => {
	beforeEach(async () => {
		await changeLocale('en');
	});

	it('should translate basic keys', () => {
		expect(t('welcomeBack')).toBe('Welcome back');
	});

	it('should handle parameters', () => {
		expect(t('welcomeBack', { name: 'John' })).toBe('Welcome back, John');
	});

	it('should format dates correctly', () => {
		const date = new Date('2024-01-15');
		expect(formatDate(date)).toContain('January');
	});

	it('should format distances correctly', () => {
		expect(formatDistance(1500)).toBe('1.5 km');
	});
});
```

### Integration Tests

```typescript
// tests/integration/language-switcher.test.ts
import { render, fireEvent } from '@testing-library/svelte';
import LanguageSwitcher from '$lib/components/ui/language-switcher.svelte';

describe('LanguageSwitcher', () => {
	it('should change language when option is clicked', async () => {
		const { getByRole, getByText } = render(LanguageSwitcher);

		const button = getByRole('button');
		await fireEvent.click(button);

		const dutchOption = getByText('Nederlands');
		await fireEvent.click(dutchOption);

		// Verify language changed
		expect(document.documentElement.lang).toBe('nl');
	});
});
```

## 🔧 Advanced Usage

### Custom Formatting

```typescript
// Custom date formatting
const customDate = (date: Date) => {
	return formatDate(date, {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
};

// Custom number formatting
const customNumber = (num: number) => {
	return formatNumber(num, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
};
```

### Dynamic Locale Detection

```typescript
// Enhanced locale detection
function detectUserLocale(): SupportedLocale {
	// Check for stored preference
	const stored = localStorage.getItem('wayli-locale');
	if (stored && SUPPORTED_LOCALES.includes(stored as SupportedLocale)) {
		return stored as SupportedLocale;
	}

	// Check browser language
	const browserLang = navigator.language?.split('-')[0];
	if (browserLang && SUPPORTED_LOCALES.includes(browserLang as SupportedLocale)) {
		return browserLang as SupportedLocale;
	}

	// Check navigator.languages
	for (const lang of navigator.languages || []) {
		const code = lang.split('-')[0];
		if (SUPPORTED_LOCALES.includes(code as SupportedLocale)) {
			return code as SupportedLocale;
		}
	}

	return DEFAULT_LOCALE;
}
```

### Lazy Loading

```typescript
// Lazy load translation files
async function loadMessages(locale: SupportedLocale): Promise<Record<string, string>> {
	try {
		const messages = await import(`../../../messages/${locale}.json`);
		return messages.default || messages;
	} catch (error) {
		console.warn(`Failed to load messages for locale ${locale}:`, error);
		// Fallback to English
		if (locale !== 'en') {
			return loadMessages('en');
		}
		return {};
	}
}
```

## 🚨 Common Issues

### 1. Missing Translations

If a translation key is missing, the system falls back to the key itself:

```typescript
// If 'missingKey' doesn't exist in translations
const result = t('missingKey'); // Returns 'missingKey'
```

### 2. Parameter Mismatch

Parameters must match exactly:

```typescript
// Translation: "Hello {name}, you have {count} messages"
const result = t('greeting', { name: 'John', count: 5 }); // ✅ Works
const result = t('greeting', { name: 'John' }); // ❌ Missing count parameter
```

### 3. Locale Not Supported

If an unsupported locale is requested:

```typescript
await changeLocale('fr'); // Will log warning and not change
```

### 4. Formatting Issues

Ensure proper data types for formatting functions:

```typescript
// ✅ Good
formatDate(new Date());
formatNumber(123.45);

// ❌ Avoid
formatDate('invalid-date');
formatNumber('not-a-number');
```

## 📚 Resources

- [Inlang Message Format](https://inlang.com/schema/inlang-message-format)
- [Intl API Documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)
- [Svelte Stores Documentation](https://svelte.dev/docs#run-time-svelte-store)
- [ICU Message Format](https://unicode-org.github.io/icu/userguide/format_parse/messages/)

---

**The i18n system ensures Wayli is accessible to users worldwide while maintaining type safety and developer experience.** 🌍✨
