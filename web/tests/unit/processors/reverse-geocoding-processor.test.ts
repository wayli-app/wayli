// reverse-geocoding-processor.service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processReverseGeocodingMissing } from '$lib/services/queue/processors/reverse-geocoding-processor.service';
import type { Job } from '$lib/types/job-queue.types';

// ---- Mock dependencies ----
vi.mock('$lib/core/supabase/worker', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}));

vi.mock('$lib/services/queue/job-queue.service.worker', () => ({
  JobQueueService: {
    updateJobProgress: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('$lib/utils/job-cancellation', () => ({
  checkJobCancellation: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/utils/geocoding-utils', () => ({
  needsGeocoding: vi.fn().mockImplementation((geo) => !geo || geo === '{}'),
  isRetryableError: vi.fn().mockReturnValue(false),
  createPermanentError: vi.fn().mockReturnValue({ error: true, retryable: false }),
  createRetryableError: vi.fn().mockReturnValue({ error: true, retryable: true })
}));

vi.mock('$lib/services/external/nominatim.service', () => ({
  reverseGeocode: vi.fn().mockResolvedValue({ display_name: 'Test Location' })
}));

vi.mock('../helpers/concurrency', () => ({
  delay: vi.fn().mockResolvedValue(undefined)
}));

// Short-circuit CPU detection
vi.mock('node:os', () => ({
  cpus: () => Array(4).fill({}),
  default: { cpus: () => Array(4).fill({}) }
}));

// Import mocked modules (vi.mock is hoisted)
import { supabase } from '$lib/core/supabase/worker';
import { JobQueueService } from '$lib/services/queue/job-queue.service.worker';
import { reverseGeocode } from '$lib/services/external/nominatim.service';

describe('processReverseGeocodingMissing', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    supabase.rpc.mockResolvedValue({ error: null });

    // Chainable select/eq/not/range mock with thenable to resolve different scenarios
    let servedGeocodeBatch = false;
    supabase.from.mockImplementation((_table: string) => {
      const chain: any = {
        _sel: undefined as any,
        _opts: undefined as any,
        select: vi.fn().mockImplementation((sel: any, opts?: any) => {
          chain._sel = sel; chain._opts = opts; return chain;
        }),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        update: vi.fn().mockImplementation((_vals: any) => {
          const upd: any = {
            eq: vi.fn().mockReturnThis(),
            then: (onFulfilled: any) => { onFulfilled({ data: null, error: null }); return Promise.resolve(); }
          };
          return upd;
        }),
        then: undefined as any
      };
      chain.then = (onFulfilled: any) => {
        let result: any = { data: [], error: null };
        if (chain._opts && chain._opts.count === 'exact' && chain._opts.head === true) {
          // counts for cache init: return some numbers
          result = { count: 5, error: null };
        } else if (chain._sel === 'geocode') {
          // while loop fetch: first time return some items then empty
          if (!servedGeocodeBatch) {
            servedGeocodeBatch = true;
            result = { data: [{ geocode: null }, { geocode: '{}' }], error: null };
          } else {
            result = { data: [], error: null };
          }
        } else if (typeof chain._sel === 'string' && chain._sel.includes('user_id')) {
          // batch processing fetch
          result = { data: [{ user_id: 'user1', location: { coordinates: [1, 2] }, geocode: null, recorded_at: '2020-01-01T00:00:00Z' }], error: null };
        }
        onFulfilled(result);
        return Promise.resolve();
      };
      return chain;
    });
  });

  it('processes points needing geocoding and updates progress', async () => {
    const job: Job = { id: 'job1', created_by: 'user1', result: {} } as unknown as Job;

    await processReverseGeocodingMissing(job);

    expect(JobQueueService.updateJobProgress).toHaveBeenCalledWith(
      'job1',
      expect.any(Number),
      expect.objectContaining({
        totalProcessed: expect.any(Number),
        totalSuccess: expect.any(Number),
        totalErrors: expect.any(Number)
      })
    );

    expect(reverseGeocode).toHaveBeenCalledWith(2, 1);
  });

  it('handles case with no points needing geocoding', async () => {
    const job: Job = { id: 'job2', created_by: 'user2', result: {} } as unknown as Job;

    // Override to return no points: rewire from().select chain for this test only
    const originalFrom = supabase.from;
    supabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (onFulfilled: any) => { onFulfilled({ count: 0, data: [], error: null }); return Promise.resolve(); }
    } as any);

    await processReverseGeocodingMissing(job);

    // Expect we updated progress initially and finalized at 100%
    expect(JobQueueService.updateJobProgress).toHaveBeenCalledWith(
      'job2',
      0,
      expect.objectContaining({ totalPoints: 0 })
    );
    expect(JobQueueService.updateJobProgress).toHaveBeenCalledWith(
      'job2',
      100,
      expect.any(Object)
    );

    // restore
    supabase.from = originalFrom;
  });
});
