// fluxbase/mcp-tools/_shared/countries.ts
//
// Canonical country-name → ISO 3166-1 alpha-2 code map for the wayli MCP tools.
//
// This is the single source of truth. `search-visits.ts` and `aggregate-visits.ts`
// each keep an INLINE copy today because Fluxbase syncs MCP tools individually
// with no bundler step, so a relative import would not resolve at runtime. Those
// inline copies (marked with `ponytail:` sync comments) are deleted in Phase 2.4
// once the Fluxbase CLI supports `_shared/` bundling. Until then: keep the inline
// copies in sync with this map.
//
// Superset of the two tool copies — includes aliases (holland, deutschland,
// españa, …) that the aggregate-visits copy had drifted out of.

export const COUNTRIES: Record<string, string> = {
  vietnam: 'VN',
  'viet nam': 'VN',
  japan: 'JP',
  nippon: 'JP',
  netherlands: 'NL',
  holland: 'NL',
  'the netherlands': 'NL',
  france: 'FR',
  germany: 'DE',
  deutschland: 'DE',
  'united states': 'US',
  usa: 'US',
  america: 'US',
  'united kingdom': 'GB',
  uk: 'GB',
  england: 'GB',
  italy: 'IT',
  italia: 'IT',
  spain: 'ES',
  españa: 'ES',
  thailand: 'TH',
  indonesia: 'ID',
  singapore: 'SG',
  malaysia: 'MY',
  australia: 'AU',
  canada: 'CA',
  china: 'CN',
  'south korea': 'KR',
  korea: 'KR',
  taiwan: 'TW',
  'hong kong': 'HK',
  portugal: 'PT',
  belgium: 'BE',
  switzerland: 'CH',
  austria: 'AT',
  poland: 'PL',
  czech: 'CZ',
  czechia: 'CZ',
  sweden: 'SE',
  norway: 'NO',
  denmark: 'DK',
  finland: 'FI',
  greece: 'GR',
  ireland: 'IE',
  hungary: 'HU',
  romania: 'RO',
  brazil: 'BR',
  argentina: 'AR',
  mexico: 'MX',
  india: 'IN',
  russia: 'RU',
  'south africa': 'ZA',
  turkey: 'TR',
  israel: 'IL',
  uae: 'AE',
  'united arab emirates': 'AE',
  philippines: 'PH',
  'new zealand': 'NZ'
};

/**
 * Resolve a country name (case-insensitive, supports common aliases) to its
 * 2-letter ISO code. Falls back to the uppercased input when unknown so callers
 * can pass through already-coded values (e.g. "VN").
 */
export function countryCode(name: string): string {
  return COUNTRIES[name.toLowerCase()] ?? name.toUpperCase();
}
