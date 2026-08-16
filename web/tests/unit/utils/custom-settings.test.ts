import { describe, it, expect } from 'vitest';
import { customValue } from '$lib/utils/custom-settings';

describe('customValue', () => {
	it('returns raw string values (bulk prefix-fetch shape)', () => {
		const custom = { 'wayli.server_name': 'Wayli' };
		expect(customValue(custom, 'wayli.server_name', '')).toBe('Wayli');
	});

	it('returns raw number values', () => {
		const custom = { 'wayli.pexels_rate_limit': 0 };
		expect(customValue(custom, 'wayli.pexels_rate_limit', 200)).toBe(0);
	});

	it('returns raw boolean values', () => {
		const custom = { 'wayli.community_enabled': false };
		expect(customValue(custom, 'wayli.community_enabled', true)).toBe(false);
	});

	it('unwraps the legacy { value } shape', () => {
		const custom = { 'wayli.server_name': { value: 'Wayli', description: 'Public name' } };
		expect(customValue(custom, 'wayli.server_name', '')).toBe('Wayli');
	});

	it('unwraps the legacy { data: { value } } shape', () => {
		const custom = { 'wayli.landing_redirect_username': { data: { value: 'bart' } } };
		expect(customValue(custom, 'wayli.landing_redirect_username')).toBe('bart');
	});

	it('prefers value over data.value when both exist', () => {
		const custom = { 'wayli.server_name': { value: 'primary', data: { value: 'nested' } } };
		expect(customValue(custom, 'wayli.server_name')).toBe('primary');
	});

	it('falls back on a missing key', () => {
		expect(customValue({}, 'wayli.server_name', 'fallback')).toBe('fallback');
		expect(customValue(undefined, 'wayli.server_name', 'fallback')).toBe('fallback');
		expect(customValue(null, 'wayli.server_name')).toBeUndefined();
	});

	it('falls back on a null entry or an empty wrapper', () => {
		expect(customValue({ 'wayli.server_name': null }, 'wayli.server_name', 'fb')).toBe('fb');
		expect(customValue({ 'wayli.server_name': {} }, 'wayli.server_name', 'fb')).toBe('fb');
		expect(customValue({ 'wayli.server_name': { value: null } }, 'wayli.server_name', 'fb')).toBe(
			'fb'
		);
	});
});
