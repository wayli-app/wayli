// Button.spec.ts
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import Button from './index.svelte';

describe('Button.svelte', () => {
	it('renders default button with children', () => {
		render(Button, { props: {} }, { slots: { default: 'Click me' } });
		const button = screen.getByRole('button');
		expect(button).toBeInTheDocument();
		expect(button).toHaveAttribute('data-variant', 'default');
		expect(button).toHaveAttribute('data-size', 'default');
	});

	it('applies variant and size classes', () => {
		render(Button, { props: { variant: 'destructive', size: 'lg' } }, { slots: { default: 'Delete' } });
		const button = screen.getByRole('button');
		expect(button).toHaveAttribute('data-variant', 'destructive');
		expect(button).toHaveAttribute('data-size', 'lg');
	});

	it('renders as anchor when `as="a"`', () => {
		render(Button, { props: { as: 'a', href: '/test' } }, { slots: { default: 'Link' } });
		const link = screen.getByRole('link');
		expect(link).toHaveAttribute('href', '/test');
	});

	it('disables button when disabled=true', async () => {
		const handleClick = vi.fn();
		render(Button, { props: { disabled: true, on: { click: handleClick } } }, { slots: { default: 'Disabled' } });
		const button = screen.getByRole('button');
		expect(button).toBeDisabled();
		await fireEvent.click(button);
		expect(handleClick).not.toHaveBeenCalled();
	});

	it('shows loading spinner when loading=true', () => {
		render(Button, { props: { loading: true } }, { slots: { default: 'Loading' } });
		const spinner = screen.getByTestId('loading-spinner');
		expect(spinner).toBeInTheDocument();
	});

	it('handles click events', async () => {
		const handleClick = vi.fn();
		render(Button, { props: { on: { click: handleClick } } }, { slots: { default: 'Click me' } });
		const button = screen.getByRole('button');
		await fireEvent.click(button);
		expect(handleClick).toHaveBeenCalledTimes(1);
	});

	it('handles keyboard events (Enter/Space)', async () => {
		const handleClick = vi.fn();
		render(Button, { props: { on: { click: handleClick } } }, { slots: { default: 'Press me' } });
		const button = screen.getByRole('button');
		await fireEvent.keyDown(button, { key: 'Enter' });
		await fireEvent.keyDown(button, { key: ' ' });
		expect(handleClick).toHaveBeenCalledTimes(2);
	});

	it('does not trigger click handler when disabled via loading', async () => {
		const handleClick = vi.fn();
		render(Button, { props: { loading: true, on: { click: handleClick } } }, { slots: { default: 'Wait' } });
		const button = screen.getByRole('button');
		await fireEvent.click(button);
		expect(handleClick).not.toHaveBeenCalled();
	});
});
