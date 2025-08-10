// web/src/lib/services/queue/processors/import/gpx-importer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const workerHoisted = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('$lib/core/supabase/worker', () => workerHoisted);
vi.mock('$lib/services/queue/job-queue.service.worker', () => ({ JobQueueService: { updateJobProgress: vi.fn() } }));
vi.mock('$lib/utils/job-cancellation', () => ({ checkJobCancellation: vi.fn().mockResolvedValue(undefined) }));
vi.mock('$lib/services/external/country-reverse-geocoding.service', () => ({
  getCountryForPoint: () => 'XX',
  normalizeCountryCode: (c: string | null) => c
}));

import { importGPXWithProgress } from './gpx-importer';

beforeEach(() => {
  vi.clearAllMocks();
  const mockFrom = workerHoisted.supabase.from as unknown as jest.Mock | ((t: string)=>any);
  // reset and implement
  (workerHoisted.supabase.from as any) = vi.fn((table: string) => {
    if (table === 'tracker_data') {
      return { upsert: vi.fn().mockResolvedValue({ data: null, error: null }) } as any;
    }
    return {} as any;
  });
});

describe('importGPXWithProgress (co-located)', () => {
  it('imports a waypoint', async () => {
    const gpx = `<?xml version="1.0"?><gpx><wpt lat="52.37" lon="4.9"><time>2024-01-01T00:00:00Z</time></wpt></gpx>`;
    const res = await importGPXWithProgress(gpx, 'user', 'job', 'file.gpx');
    expect(res.importedCount).toBeGreaterThanOrEqual(1);
    expect((workerHoisted.supabase.from as any)).toHaveBeenCalledWith('tracker_data');
  });
});

