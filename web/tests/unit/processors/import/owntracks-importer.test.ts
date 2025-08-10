// web/tests/unit/processors/import/owntracks-importer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockSupabase: any = { from: mockFrom };
  return { mockFrom, mockSupabase };
});

vi.mock('$lib/core/supabase/worker', () => ({ supabase: hoisted.mockSupabase }));
vi.mock('$lib/services/queue/job-queue.service.worker', () => ({ JobQueueService: { updateJobProgress: vi.fn() } }));
vi.mock('$lib/utils/job-cancellation', () => ({ checkJobCancellation: vi.fn().mockResolvedValue(undefined) }));
vi.mock('$lib/services/external/country-reverse-geocoding.service', () => ({
  getCountryForPoint: (lat: number, lon: number) => 'XX',
  normalizeCountryCode: (c: string | null) => c
}));

import { importOwnTracksWithProgress } from '$lib/services/queue/processors/import/owntracks-importer';

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.mockFrom.mockImplementation((table: string) => {
    if (table === 'tracker_data') {
      return {
        upsert: vi.fn().mockResolvedValue({ data: null, error: null })
      } as any;
    }
    return {} as any;
  });
});

describe('importOwnTracksWithProgress', () => {
  it('imports a single line', async () => {
    const line = `${Math.floor(Date.now() / 1000)},52.37,4.9`;
    const imported = await importOwnTracksWithProgress(line, 'user', 'job', 'file.csv');
    expect(imported).toBeGreaterThanOrEqual(1);
    expect(hoisted.mockFrom).toHaveBeenCalledWith('tracker_data');
  });
});


