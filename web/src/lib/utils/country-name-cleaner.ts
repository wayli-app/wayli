// web/src/lib/utils/country-name-cleaner.ts
/**
 * Cleans country names by removing political indicators for better search results
 * Examples: "Republic of the Congo" -> "Congo", "Islamic Republic of Iran" -> "Iran"
 */

const POLITICAL_INDICATORS = [
	'Republic of the',
	'Republic of',
	'Democratic Republic of the',
	'Democratic Republic of',
	'Islamic Republic of',
	"People's Republic of",
	'United Republic of',
	'Federated States of',
	'Commonwealth of',
	'Kingdom of',
	'Principality of',
	'Grand Duchy of',
	'State of',
	'Territory of',
	'Province of China',
	'Federation',
	'Union'
];

const SUFFIX_INDICATORS = ['Islands', 'Island', 'Territories'];

/**
 * Cleans a country name by removing political indicators
 * @param countryName - The full country name from the database
 * @returns Cleaned country name suitable for search queries
 */
export function cleanCountryNameForSearch(countryName: string): string {
	if (!countryName) return countryName;

	let cleaned = countryName.trim();

	// Remove political indicators from the beginning
	for (const indicator of POLITICAL_INDICATORS) {
		const regex = new RegExp(`^${indicator}\\s+`, 'i');
		if (regex.test(cleaned)) {
			cleaned = cleaned.replace(regex, '').trim();
			break; // Only remove one indicator
		}
	}

	// Remove suffix indicators from the end
	for (const indicator of SUFFIX_INDICATORS) {
		const regex = new RegExp(`\\s+${indicator}$`, 'i');
		if (regex.test(cleaned)) {
			cleaned = cleaned.replace(regex, '').trim();
			break; // Only remove one indicator
		}
	}

	// Handle special patterns
	cleaned = cleaned.replace(/,\s*Province of China$/i, '');

	// Remove leading "the" if it remains after removing political indicators
	cleaned = cleaned.replace(/^the\s+/i, '').trim();

	// Handle special cases
	const specialCases: Record<string, string> = {
		'United States': 'USA',
		'United Kingdom': 'UK',
		'Russian Federation': 'Russia',
		'Czech Republic': 'Czechia',
		'Timor-Leste': 'East Timor',
		"Côte d'Ivoire": 'Ivory Coast',
		Myanmar: 'Burma'
	};

	return specialCases[cleaned] || cleaned;
}

/**
 * Gets a search-friendly country name from a country code
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @param fullCountryName - Optional full country name if already available
 * @returns Cleaned country name for search
 */
export function getSearchFriendlyCountryName(
	countryCode: string,
	fullCountryName?: string
): string {
	if (fullCountryName) {
		return cleanCountryNameForSearch(fullCountryName);
	}

	// Fallback to country code if no full name available
	return countryCode.toUpperCase();
}
