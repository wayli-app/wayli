// web/tests/unit/helpers/eta.test.ts
import { describe, it, expect } from 'vitest';

import { calculateEstimatedTimeRemaining } from '$lib/services/queue/helpers/eta';

describe('calculateEstimatedTimeRemaining', () => {
	it('returns Calculating... when no progress', () => {
		expect(calculateEstimatedTimeRemaining(0, 100, 0, 10)).toBe('Calculating...');
	});

	it('uses elapsed time when provided', () => {
		const result = calculateEstimatedTimeRemaining(50, 100, 10, 10, 1000);
		expect(
			result.endsWith('seconds') || result.endsWith('minutes') || result.endsWith('hours')
		).toBe(true);
	});

	it('falls back to concurrency estimate without elapsed', () => {
		const result = calculateEstimatedTimeRemaining(10, 100, 5, 20);
		expect(result.length).toBeGreaterThan(0);
	});
});
