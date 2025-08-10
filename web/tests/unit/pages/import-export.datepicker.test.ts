import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import ImportExportPage from '$routes/(user)/dashboard/import-export/+page.svelte?client';

vi.mock('@svelte-plugins/datepicker', async () => {
  const mod = await import('../../mocks/DatePickerMock.svelte');
  return { DatePicker: mod.default };
});

vi.mock('$env/static/public', () => ({
  PUBLIC_SUPABASE_URL: 'http://localhost',
  PUBLIC_SUPABASE_ANON_KEY: 'anon'
}));

vi.mock('$lib/i18n', async () => {
  const { readable } = await import('svelte/store');
  return { translate: readable((key: string) => key) } as any;
});

vi.mock('$lib/stores/auth', () => ({ sessionStore: { subscribe: (fn: any) => { fn({}); return () => {}; } } }));

vi.mock('$lib/services/api/service-adapter', () => ({
  ServiceAdapter: class {
    getJobs = vi.fn().mockResolvedValue([]);
    getExportJobs = vi.fn().mockResolvedValue([]);
  }
}));
vi.mock('$lib/services/job-creation.service', () => ({ jobCreationService: { createExportJob: vi.fn() } }));

describe('Import/Export date picker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('opens, selects range, and closes properly', async () => {
    const { getByRole, queryByTestId, getByTestId } = render(ImportExportPage);

    const openButton = getByRole('button', { name: /select export date range/i });
    await fireEvent.click(openButton);
    expect(queryByTestId('datepicker')).toBeTruthy();

    await fireEvent.click(getByTestId('setRange'));
    // handleDateChange closes after timeout; advance timers
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();

    expect(queryByTestId('datepicker')).toBeFalsy();

    // Done: ensure it closed after selecting range
  });
});


