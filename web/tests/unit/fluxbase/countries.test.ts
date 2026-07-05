// /Users/bart/Dev/wayli/web/tests/unit/fluxbase/countries.test.ts
//
// Covers the canonical country-name → ISO code helper shared by the wayli MCP
// tools. This is the superset map; the inline copies in search-visits.ts and
// aggregate-visits.ts are swapped to import this in Phase 2.4.

import { describe, it, expect } from 'vitest';
import { COUNTRIES, countryCode } from '../../../../fluxbase/mcp-tools/_shared/countries';

describe('COUNTRIES map', () => {
	it('contains common country entries', () => {
		expect(COUNTRIES['japan']).toBe('JP');
		expect(COUNTRIES['netherlands']).toBe('NL');
		expect(COUNTRIES['vietnam']).toBe('VN');
		expect(COUNTRIES['united states']).toBe('US');
	});

	it('includes aliases that the aggregate-visits copy had drifted out of', () => {
		// These were missing from the aggregate-visits inline copy and are the
		// reason a single source of truth exists.
		expect(COUNTRIES['holland']).toBe('NL');
		expect(COUNTRIES['deutschland']).toBe('DE');
		expect(COUNTRIES['españa']).toBe('ES');
		expect(COUNTRIES['italia']).toBe('IT');
		expect(COUNTRIES['america']).toBe('US');
		expect(COUNTRIES['england']).toBe('GB');
		expect(COUNTRIES['uae']).toBe('AE');
		expect(COUNTRIES['viet nam']).toBe('VN');
	});
});

describe('countryCode()', () => {
	it('resolves names case-insensitively', () => {
		expect(countryCode('Japan')).toBe('JP');
		expect(countryCode('JAPAN')).toBe('JP');
		expect(countryCode('japan')).toBe('JP');
	});

	it('resolves multi-word and aliased names', () => {
		expect(countryCode('South Korea')).toBe('KR');
		expect(countryCode('Holland')).toBe('NL');
		expect(countryCode('United Arab Emirates')).toBe('AE');
		expect(countryCode('Czechia')).toBe('CZ');
	});

	it('passes already-coded values through unchanged', () => {
		expect(countryCode('VN')).toBe('VN');
		expect(countryCode('jp')).toBe('JP'); // lowercase code resolves via map; uppercased input passes through
	});

	it('uppercases unknown names as a fallback', () => {
		expect(countryCode('Atlantis')).toBe('ATLANTIS');
		expect(countryCode('new-caledonia')).toBe('NEW-CALEDONIA');
	});
});
