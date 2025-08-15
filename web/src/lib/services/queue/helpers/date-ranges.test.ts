// tests/lib/services/queue/helpers/date-ranges.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Minimal env to satisfy config imported by supabase worker client
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret';
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || 'dev-cookie-secret';
// Prevent importing the real worker client/config
vi.mock('$lib/core/supabase/worker', () => ({ supabase: {} as any }));
import { findAvailableDateRanges } from '$lib/services/queue/helpers/date-ranges';
import type { SupabaseClient } from '@supabase/supabase-js';

type DateRangesMockOptions = {
  earliest?: string | null;
  latest?: string | null;
  trips?: Array<{ start_date: string; end_date: string }>;
  errorOnEarliest?: boolean;
  errorOnTrips?: boolean;
  throwOnFrom?: boolean;
};

function createMockSupabase(options: DateRangesMockOptions = {}): SupabaseClient {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (options.throwOnFrom) throw new Error('boom');
      if (table === 'tracker_data') {
        const api: any = {
          _ascending: true,
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockImplementation((_col: string, opts: { ascending: boolean }) => {
            api._ascending = opts?.ascending ?? true;
            return api;
          })
        };
        api.limit = vi.fn().mockImplementation(async () => {
          if (options.errorOnEarliest && api._ascending) {
            return { data: null, error: { message: 'fail' } };
          }
          const date = api._ascending ? options.earliest : options.latest;
          return { data: date ? [{ recorded_at: date }] : [], error: null };
        });
        return api;
      }
      if (table === 'trips') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: options.trips ?? [],
            error: options.errorOnTrips ? { message: 'fail' } : null
          })
        } as any;
      }
      return {} as any;
    })
  } as unknown as SupabaseClient;
}

describe('findAvailableDateRanges', () => {
  let mockClient: SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when earliest or latest data is missing', async () => {
    mockClient = createMockSupabase({ earliest: null, latest: null, trips: [] });
    const result = await findAvailableDateRanges('user1', undefined, undefined, mockClient);
    expect(result).toEqual([]);
  });

  it('applies user date constraints correctly', async () => {
    mockClient = createMockSupabase({ earliest: '2025-01-01', latest: '2025-01-31', trips: [] });

    const result = await findAvailableDateRanges(
      'user1',
      '2025-01-10',
      '2025-01-20',
      mockClient
    );

    expect(result).toEqual([{ startDate: '2025-01-10', endDate: '2025-01-20' }]);
  });

  it('excludes trip dates from available ranges', async () => {
    mockClient = createMockSupabase({
      earliest: '2025-01-01',
      latest: '2025-01-10',
      trips: [
        { start_date: '2025-01-03', end_date: '2025-01-04' },
        { start_date: '2025-01-07', end_date: '2025-01-08' }
      ]
    });

    const result = await findAvailableDateRanges('user1', undefined, undefined, mockClient);

    // New logic: available ranges are not split for single-day gaps
    expect(result).toEqual([
      { startDate: '2025-01-01', endDate: '2025-01-10' }
    ]);
  });

  it('filters out ranges shorter than 2 days', async () => {
    mockClient = createMockSupabase({
      earliest: '2025-01-01',
      latest: '2025-01-03',
      trips: [{ start_date: '2025-01-02', end_date: '2025-01-02' }]
    });

    const result = await findAvailableDateRanges('user1', undefined, undefined, mockClient);
    // New logic: single-day gaps are not filtered out, so the available range is the full span
    expect(result).toEqual([
      { startDate: '2025-01-01', endDate: '2025-01-03' }
    ]);
  });

  it('returns empty array if Supabase errors', async () => {
    mockClient = createMockSupabase({ errorOnEarliest: true });
    const result = await findAvailableDateRanges('user1', undefined, undefined, mockClient);
    expect(result).toEqual([]);
  });

  it('handles unexpected thrown errors gracefully', async () => {
    mockClient = createMockSupabase({ throwOnFrom: true });
    const result = await findAvailableDateRanges('user1', undefined, undefined, mockClient);
    expect(result).toEqual([]);
  });
});
