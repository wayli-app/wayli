// fluxbase/mcp-tools/_shared/date-range.ts
//
// Canonical natural-language → SQL date-range filter for the wayli MCP tools.
//
// Single source of truth; the inline copies in `search-visits.ts` and
// `aggregate-visits.ts` are deleted in Phase 2.4 once the Fluxbase CLI supports
// `_shared/` bundling. Superset of the two tool copies — includes the "today"
// branch that the aggregate-visits copy had drifted out of.

/**
 * Convert a natural-language date range into a SQL `started_at` filter clause
 * against the `my_place_visits` (or compatible) `started_at` column.
 *
 * Supported phrases (case-insensitive): this year, last year, this month,
 * last month, last/past 30 days, last 7 days / past week, today.
 *
 * @returns the SQL condition string, or `null` if the phrase is unrecognized
 *          (callers should then apply no date filter).
 */
export function parseDateRange(dateRange: string): string | null {
  const lower = dateRange.toLowerCase();

  if (lower.includes('this year')) {
    return "started_at >= DATE_TRUNC('year', CURRENT_DATE)";
  }
  if (lower.includes('last year')) {
    return "started_at >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year') AND started_at < DATE_TRUNC('year', CURRENT_DATE)";
  }
  if (lower.includes('this month')) {
    return "started_at >= DATE_TRUNC('month', CURRENT_DATE)";
  }
  if (lower.includes('last month')) {
    return "started_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND started_at < DATE_TRUNC('month', CURRENT_DATE)";
  }
  if (lower.includes('last 30 days') || lower.includes('past 30 days')) {
    return "started_at >= CURRENT_DATE - INTERVAL '30 days'";
  }
  if (lower.includes('last 7 days') || lower.includes('past week')) {
    return "started_at >= CURRENT_DATE - INTERVAL '7 days'";
  }
  if (lower.includes('today')) {
    return 'started_at >= CURRENT_DATE';
  }

  return null;
}
