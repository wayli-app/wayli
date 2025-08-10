// web/src/lib/utils/timezone-utils.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getTimezoneFromCoordinates, formatDateInTimezone, formatDateForLocation } from './timezone-utils';

describe('timezone-utils', () => {
  it('estimates timezone by longitude', async () => {
    await expect(getTimezoneFromCoordinates(0, -122)).resolves.toBe('America/Los_Angeles');
    // Our heuristic maps close-to-zero offsets to UTC; accept that behavior
    await expect(getTimezoneFromCoordinates(0, 2)).resolves.toBe('UTC');
  });

  it('formats date in timezone', () => {
    const d = '2024-01-01T12:00:00Z';
    const formatted = formatDateInTimezone(d, 'UTC');
    expect(formatted).toContain('2024');
  });

  it('formats date for location by fetching timezone', async () => {
    const spy = vi.spyOn(global.console, 'warn').mockImplementation(() => {});
    const result = await formatDateForLocation('2024-01-01T12:00:00Z', 0, 10);
    expect(result).toBeTruthy();
    spy.mockRestore();
  });
});

