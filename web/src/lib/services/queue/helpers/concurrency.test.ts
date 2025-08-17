// web/src/lib/services/queue/helpers/concurrency.test.ts
import { describe, it, expect, vi } from 'vitest';

import { delay } from './concurrency';

describe('delay', () => {
	it('resolves after given milliseconds', async () => {
		vi.useFakeTimers();
		const promise = delay(500);
		let resolved = false;
		promise.then(() => (resolved = true));
		await vi.advanceTimersByTimeAsync(499);
		expect(resolved).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(resolved).toBe(true);
		vi.useRealTimers();
	});
});
