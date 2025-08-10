// Button.spec.ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Button from './index.svelte';

describe('Button.svelte', () => {
  it('renders default button with children', () => {
    render(Button, { children: 'Click me' });
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('data-variant', 'default');
    expect(button).toHaveAttribute('data-size', 'default');
  });

  it('applies variant and size classes', () => {
    render(Button, { variant: 'destructive', size: 'lg', children: 'Delete' });
    const button = screen.getByRole('button', { name: /delete/i });
    expect(button).toHaveAttribute('data-variant', 'destructive');
    expect(button).toHaveAttribute('data-size', 'lg');
  });

  it('renders as anchor when `as="a"`', () => {
    render(Button, { as: 'a', href: '/test', children: 'Link' });
    const link = screen.getByRole('link', { name: /link/i });
    expect(link).toHaveAttribute('href', '/test');
  });

  it('disables button when disabled=true', async () => {
    const handleClick = vi.fn();
    render(Button, { disabled: true, on: { click: handleClick }, children: 'Disabled' });
    const button = screen.getByRole('button', { name: /disabled/i });
    expect(button).toBeDisabled();
    await fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('shows loading spinner when loading=true', () => {
    render(Button, { loading: true, children: 'Loading' });
    const spinner = screen.getByTestId('loading-spinner');
    expect(spinner).toBeInTheDocument();
  });

  it('handles click events', async () => {
    const handleClick = vi.fn();
    render(Button, { on: { click: handleClick }, children: 'Click me' });
    const button = screen.getByRole('button', { name: /click me/i });
    await fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('handles keyboard events (Enter/Space)', async () => {
    const handleClick = vi.fn();
    render(Button, { on: { click: handleClick }, children: 'Press me' });
    const button = screen.getByRole('button', { name: /press me/i });
    await fireEvent.keyDown(button, { key: 'Enter' });
    await fireEvent.keyDown(button, { key: ' ' });
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it('does not trigger click handler when disabled via loading', async () => {
    const handleClick = vi.fn();
    render(Button, { loading: true, on: { click: handleClick }, children: 'Wait' });
    const button = screen.getByRole('button', { name: /wait/i });
    await fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });
});
