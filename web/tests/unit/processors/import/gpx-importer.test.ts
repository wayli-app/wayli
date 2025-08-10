// web/tests/unit/processors/import/gpx-importer.test.ts
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

import { importGPXWithProgress } from '$lib/services/queue/processors/import/gpx-importer';

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

describe('importGPXWithProgress', () => {
  it('imports a waypoint', async () => {
    const gpx = `<?xml version="1.0"?><gpx><wpt lat="52.37" lon="4.9"><time>2024-01-01T00:00:00Z</time></wpt></gpx>`;
    const res = await importGPXWithProgress(gpx, 'user', 'job', 'file.gpx');
    expect(res.importedCount).toBeGreaterThanOrEqual(1);
    expect(hoisted.mockFrom).toHaveBeenCalledWith('tracker_data');
  });
});


