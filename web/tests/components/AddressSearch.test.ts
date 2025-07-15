import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import AddressSearch from '../../lib/components/ui/address-search/index.svelte';

// Mock the geocoding service
vi.mock('../../lib/services/external/nominatim.service', () => ({
  searchAddress: vi.fn()
}));

describe('AddressSearch Component', () => {
  it('should render with default props', () => {
    const { getByRole, getByText } = render(AddressSearch, {
      props: {
        label: 'Address',
        placeholder: 'Enter address...'
      }
    });

    expect(getByText('Address')).toBeInTheDocument();
    expect(getByRole('textbox')).toHaveAttribute('placeholder', 'Enter address...');
  });

  it('should show required indicator when required prop is true', () => {
    const { getByText } = render(AddressSearch, {
      props: {
        label: 'Address',
        required: true
      }
    });

    const requiredIndicator = getByText('*');
    expect(requiredIndicator).toHaveClass('text-red-500');
  });

  it('should be disabled when disabled prop is true', () => {
    const { getByRole } = render(AddressSearch, {
      props: {
        label: 'Address',
        disabled: true
      }
    });

    expect(getByRole('textbox')).toBeDisabled();
  });

  it('should emit address selection event', async () => {
    const mockAddress = {
      display_name: '123 Main St, City, Country',
      coordinates: { lat: 40.7128, lng: -74.0060 }
    };

    const { getByRole, component } = render(AddressSearch, {
      props: {
        label: 'Address'
      }
    });

    const input = getByRole('textbox');

    // Mock the address selection
    let selectedAddress: any = null;
    component.$on('addressSelected', (event) => {
      selectedAddress = event.detail;
    });

    // Simulate address selection
    await component.$set({ selectedAddress: mockAddress });

    expect(selectedAddress).toEqual(mockAddress);
  });

  it('should handle input changes', async () => {
    const { getByRole } = render(AddressSearch, {
      props: {
        label: 'Address'
      }
    });

    const input = getByRole('textbox') as HTMLInputElement;

    await fireEvent.input(input, { target: { value: '123 Main St' } });

    expect(input.value).toBe('123 Main St');
  });

  it('should show loading state during search', async () => {
    const { getByRole, getByText } = render(AddressSearch, {
      props: {
        label: 'Address'
      }
    });

    const input = getByRole('textbox');

    // Simulate search loading state
    await fireEvent.input(input, { target: { value: '123 Main St' } });

    // The component should show loading indicator
    await waitFor(() => {
      expect(getByText('Searching...')).toBeInTheDocument();
    });
  });

  it('should handle keyboard navigation', async () => {
    const { getByRole } = render(AddressSearch, {
      props: {
        label: 'Address'
      }
    });

    const input = getByRole('textbox');

    // Test arrow key navigation
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await fireEvent.keyDown(input, { key: 'ArrowUp' });
    await fireEvent.keyDown(input, { key: 'Enter' });
    await fireEvent.keyDown(input, { key: 'Escape' });

    // These should not throw errors
    expect(input).toBeInTheDocument();
  });

  it('should clear input when clear button is clicked', async () => {
    const { getByRole, getByLabelText } = render(AddressSearch, {
      props: {
        label: 'Address',
        showClearButton: true
      }
    });

    const input = getByRole('textbox') as HTMLInputElement;

    // Set initial value
    await fireEvent.input(input, { target: { value: '123 Main St' } });
    expect(input.value).toBe('123 Main St');

    // Click clear button
    const clearButton = getByLabelText('Clear address');
    await fireEvent.click(clearButton);

    expect(input.value).toBe('');
  });

  it('should show error message when search fails', async () => {
    const { getByRole, getByText } = render(AddressSearch, {
      props: {
        label: 'Address'
      }
    });

    const input = getByRole('textbox');

    // Simulate search error
    await fireEvent.input(input, { target: { value: 'invalid address' } });

    // Wait for error to appear
    await waitFor(() => {
      expect(getByText('No addresses found')).toBeInTheDocument();
    });
  });

  it('should display selected address correctly', async () => {
    const mockAddress = {
      display_name: '123 Main St, City, Country',
      coordinates: { lat: 40.7128, lng: -74.0060 }
    };

    const { getByText } = render(AddressSearch, {
      props: {
        label: 'Address',
        selectedAddress: mockAddress
      }
    });

    expect(getByText('123 Main St, City, Country')).toBeInTheDocument();
    expect(getByText('40.7128, -74.0060')).toBeInTheDocument();
  });

  it('should handle empty search results', async () => {
    const { getByRole, getByText } = render(AddressSearch, {
      props: {
        label: 'Address'
      }
    });

    const input = getByRole('textbox');

    // Simulate empty search results
    await fireEvent.input(input, { target: { value: 'nonexistent address' } });

    await waitFor(() => {
      expect(getByText('No addresses found')).toBeInTheDocument();
    });
  });

  it('should respect max suggestions limit', async () => {
    const { getByRole } = render(AddressSearch, {
      props: {
        label: 'Address',
        maxSuggestions: 3
      }
    });

    const input = getByRole('textbox');

    // Simulate search with many results
    await fireEvent.input(input, { target: { value: 'Main St' } });

    // The component should limit suggestions to 3
    await waitFor(() => {
      const suggestions = document.querySelectorAll('[data-testid="address-suggestion"]');
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });
  });
});