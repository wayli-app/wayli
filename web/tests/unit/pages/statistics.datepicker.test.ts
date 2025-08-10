import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import StatisticsPage from '$routes/(user)/dashboard/statistics/+page.svelte?client';

vi.mock('@svelte-plugins/datepicker', async () => {
  const mod = await import('../../mocks/DatePickerMock.svelte');
  return { DatePicker: mod.default };
});

vi.mock('$lib/i18n', async () => {
  const { readable } = await import('svelte/store');
  return {
    translate: readable((key: string) => key),
    currentLocale: readable('en'),
    getCountryNameReactive: () => 'Country'
  } as any;
});

vi.mock('$lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: {} } }) } } }));

vi.mock('$lib/services/api/service-adapter', () => ({
  ServiceAdapter: class {
    edgeFunctionsService = {
      getTrackerDataWithMode: vi.fn().mockResolvedValue({ total: 0, locations: [], hasMore: false, statistics: { geopoints: 0 } })
    };
  }
}));

// Mock leaflet usage in component
vi.mock('leaflet', () => ({
  default: {
    map: () => ({ getContainer: () => ({ appendChild: () => {} }), removeLayer: () => {}, fitBounds: () => {}, getZoom: () => 2, getCenter: () => ({ lat: 0, lng: 0 }), flyTo: () => {}, invalidateSize: () => {} }),
    tileLayer: () => ({ addTo: () => ({}) }),
    featureGroup: () => ({ getBounds: () => ({}) }),
    circleMarker: () => ({ bindPopup: () => ({ setContent: () => {} }), on: () => ({ getPopup: () => ({ setContent: () => {} }) }), addTo: () => ({}) })
  }
}));

describe('Statistics date picker', () => {
  it('opens and closes after selecting end date, can re-open', async () => {
    const { getByRole, queryByTestId, getByTestId } = render(StatisticsPage);

    // open picker
    const openButton = getByRole('button', { name: /select date range/i });
    await fireEvent.click(openButton);
    expect(queryByTestId('datepicker')).toBeTruthy();

    // select range
    await fireEvent.click(getByTestId('setRange'));
    expect(queryByTestId('datepicker')).toBeFalsy();

    // re-open
    await fireEvent.click(openButton);
    expect(queryByTestId('datepicker')).toBeTruthy();
  });
});


