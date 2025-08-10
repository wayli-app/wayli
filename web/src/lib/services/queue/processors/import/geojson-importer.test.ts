// web/src/lib/services/queue/processors/import/geojson-importer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const workerHoisted = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('$lib/core/supabase/worker', () => workerHoisted);
vi.mock('$lib/services/queue/job-queue.service.worker', () => ({ JobQueueService: { updateJobProgress: vi.fn() } }));
vi.mock('$lib/utils/job-cancellation', () => ({ checkJobCancellation: vi.fn().mockResolvedValue(undefined) }));
vi.mock('$lib/services/external/country-reverse-geocoding.service', () => ({
  getCountryForPoint: () => 'XX',
  normalizeCountryCode: (c: string | null) => c
}));

import { importGeoJSONWithProgress } from './geojson-importer';

beforeEach(() => {
  vi.clearAllMocks();
  (workerHoisted.supabase.from as any) = vi.fn((table: string) => {
    if (table === 'tracker_data') {
      return { upsert: vi.fn().mockResolvedValue({ data: null, error: null }) } as any;
    }
    return {} as any;
  });
});

describe('importGeoJSONWithProgress (co-located)', () => {
  it('imports a single point feature', async () => {
    const content = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [4.9, 52.37] }, properties: { timestamp: 1700000000 } }
      ]
    });
    const count = await importGeoJSONWithProgress(content, 'user', 'job', 'file.geojson');
    expect(count).toBe(1);
    expect((workerHoisted.supabase.from as any)).toHaveBeenCalledWith('tracker_data');
  });
});

