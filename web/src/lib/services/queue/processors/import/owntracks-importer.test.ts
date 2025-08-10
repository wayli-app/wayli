// web/src/lib/services/queue/processors/import/owntracks-importer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const workerHoisted = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('$lib/core/supabase/worker', () => workerHoisted);
vi.mock('$lib/services/queue/job-queue.service.worker', () => ({ JobQueueService: { updateJobProgress: vi.fn() } }));
vi.mock('$lib/utils/job-cancellation', () => ({ checkJobCancellation: vi.fn().mockResolvedValue(undefined) }));
vi.mock('$lib/services/external/country-reverse-geocoding.service', () => ({
  getCountryForPoint: () => 'XX',
  normalizeCountryCode: (c: string | null) => c
}));

import { importOwnTracksWithProgress } from './owntracks-importer';

beforeEach(() => {
  vi.clearAllMocks();
  (workerHoisted.supabase.from as any) = vi.fn((table: string) => {
    if (table === 'tracker_data') {
      return { upsert: vi.fn().mockResolvedValue({ data: null, error: null }) } as any;
    }
    return {} as any;
  });
});

describe('importOwnTracksWithProgress (co-located)', () => {
  it('imports a single line', async () => {
    const line = `${Math.floor(Date.now() / 1000)},52.37,4.9`;
    const imported = await importOwnTracksWithProgress(line, 'user', 'job', 'file.csv');
    expect(imported).toBeGreaterThanOrEqual(1);
    expect((workerHoisted.supabase.from as any)).toHaveBeenCalledWith('tracker_data');
  });
});

