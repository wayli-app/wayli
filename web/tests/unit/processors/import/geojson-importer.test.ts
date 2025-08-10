// web/tests/unit/processors/import/geojson-importer.test.ts
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

import { importGeoJSONWithProgress } from '$lib/services/queue/processors/import/geojson-importer';

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

describe('importGeoJSONWithProgress', () => {
  it('imports a single point feature', async () => {
    const content = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [4.9, 52.37] },
          properties: { timestamp: 1700000000 }
        }
      ]
    });

    const count = await importGeoJSONWithProgress(content, 'user', 'job', 'file.geojson');
    expect(count).toBe(1);
    expect(hoisted.mockFrom).toHaveBeenCalledWith('tracker_data');
  });
});


