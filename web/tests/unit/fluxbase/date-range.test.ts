// /Users/bart/Dev/wayli/web/tests/unit/fluxbase/date-range.test.ts
//
// Covers the canonical natural-language → SQL date-range helper shared by the
// wayli MCP tools. Superset of the two tool copies (includes the "today" branch
// that the aggregate-visits copy had drifted out of).

import { describe, it, expect } from 'vitest';
import { parseDateRange } from '../../../../fluxbase/mcp-tools/_shared/date-range';

describe('parseDateRange()', () => {
	it('returns null for unrecognized phrases', () => {
		expect(parseDateRange('sometime last summer')).toBeNull();
		expect(parseDateRange('')).toBeNull();
	});

	it('is case-insensitive', () => {
		expect(parseDateRange('THIS YEAR')).toBe(parseDateRange('this year'));
	});

	it('parses "this year" / "last year" with year truncation', () => {
		expect(parseDateRange('this year')).toContain("DATE_TRUNC('year', CURRENT_DATE)");
		const lastYear = parseDateRange('last year');
		expect(lastYear).toContain("DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year')");
		expect(lastYear).toContain('AND'); // bounded, not open-ended
	});

	it('parses "this month" / "last month"', () => {
		expect(parseDateRange('this month')).toContain("DATE_TRUNC('month', CURRENT_DATE)");
		const lastMonth = parseDateRange('last month');
		expect(lastMonth).toContain("DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')");
		expect(lastMonth).toContain('AND');
	});

	it('parses "last/past 30 days" and "last 7 days / past week"', () => {
		expect(parseDateRange('last 30 days')).toContain("INTERVAL '30 days'");
		expect(parseDateRange('past 30 days')).toContain("INTERVAL '30 days'");
		expect(parseDateRange('last 7 days')).toContain("INTERVAL '7 days'");
		expect(parseDateRange('past week')).toContain("INTERVAL '7 days'");
	});

	it('parses "today" (branch missing from the aggregate-visits copy)', () => {
		expect(parseDateRange('today')).toBe('started_at >= CURRENT_DATE');
	});

	it('always filters on started_at', () => {
		for (const phrase of ['this year', 'last month', 'last 7 days', 'today']) {
			const result = parseDateRange(phrase);
			expect(result).toMatch(/^started_at >=/);
		}
	});
});
