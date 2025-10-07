// web/src/lib/utils/country-name-cleaner.test.ts
import { describe, it, expect } from 'vitest';
import { cleanCountryNameForSearch, getSearchFriendlyCountryName } from './country-name-cleaner';

describe('Country Name Cleaner', () => {
	describe('cleanCountryNameForSearch', () => {
		it('should remove political indicators from country names', () => {
			expect(cleanCountryNameForSearch('Republic of the Congo')).toBe('Congo');
			expect(cleanCountryNameForSearch('Democratic Republic of the Congo')).toBe('Congo');
			expect(cleanCountryNameForSearch('Islamic Republic of Iran')).toBe('Iran');
			expect(cleanCountryNameForSearch("People's Republic of China")).toBe('China');
			expect(cleanCountryNameForSearch('United Republic of Tanzania')).toBe('Tanzania');
			expect(cleanCountryNameForSearch('Federated States of Micronesia')).toBe('Micronesia');
			expect(cleanCountryNameForSearch('Commonwealth of Australia')).toBe('Australia');
			expect(cleanCountryNameForSearch('Kingdom of the Netherlands')).toBe('Netherlands');
			expect(cleanCountryNameForSearch('Principality of Monaco')).toBe('Monaco');
			expect(cleanCountryNameForSearch('Grand Duchy of Luxembourg')).toBe('Luxembourg');
			expect(cleanCountryNameForSearch('State of Palestine')).toBe('Palestine');
			expect(cleanCountryNameForSearch('Territory of Christmas Island')).toBe('Christmas');
			expect(cleanCountryNameForSearch('Cayman Islands')).toBe('Cayman');
			expect(cleanCountryNameForSearch('Solomon Islands')).toBe('Solomon');
			expect(cleanCountryNameForSearch('British Indian Ocean Territory')).toBe(
				'British Indian Ocean Territory'
			);
			expect(cleanCountryNameForSearch('Taiwan, Province of China')).toBe('Taiwan');
			expect(cleanCountryNameForSearch('Russian Federation')).toBe('Russia');
		});

		it('should handle special cases', () => {
			expect(cleanCountryNameForSearch('United States')).toBe('USA');
			expect(cleanCountryNameForSearch('United Kingdom')).toBe('UK');
			expect(cleanCountryNameForSearch('Czech Republic')).toBe('Czechia');
			expect(cleanCountryNameForSearch('Timor-Leste')).toBe('East Timor');
			expect(cleanCountryNameForSearch("Côte d'Ivoire")).toBe('Ivory Coast');
			expect(cleanCountryNameForSearch('Myanmar')).toBe('Burma');
		});

		it('should return unchanged names for countries without political indicators', () => {
			expect(cleanCountryNameForSearch('Netherlands')).toBe('Netherlands');
			expect(cleanCountryNameForSearch('Germany')).toBe('Germany');
			expect(cleanCountryNameForSearch('Japan')).toBe('Japan');
			expect(cleanCountryNameForSearch('Brazil')).toBe('Brazil');
			expect(cleanCountryNameForSearch('South Africa')).toBe('South Africa');
		});

		it('should handle edge cases', () => {
			expect(cleanCountryNameForSearch('')).toBe('');
			expect(cleanCountryNameForSearch('   ')).toBe('');
			expect(cleanCountryNameForSearch('  Republic of France  ')).toBe('France');
		});
	});

	describe('getSearchFriendlyCountryName', () => {
		it('should return cleaned country name when full name is provided', () => {
			expect(getSearchFriendlyCountryName('CD', 'Democratic Republic of the Congo')).toBe('Congo');
			expect(getSearchFriendlyCountryName('IR', 'Islamic Republic of Iran')).toBe('Iran');
		});

		it('should return country code when no full name is provided', () => {
			expect(getSearchFriendlyCountryName('NL')).toBe('NL');
			expect(getSearchFriendlyCountryName('DE')).toBe('DE');
		});

		it('should handle empty inputs', () => {
			expect(getSearchFriendlyCountryName('')).toBe('');
			expect(getSearchFriendlyCountryName('', '')).toBe('');
		});
	});
});
