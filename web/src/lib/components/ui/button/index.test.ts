import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import Button from './index.svelte';

describe('Button Component', () => {
	it('renders with default props', () => {
		render(Button, { props: { children: 'Click me' } });

		const button = screen.getByRole('button', { name: 'Click me' });
		expect(button).toBeInTheDocument();
		expect(button).toHaveClass('inline-flex', 'items-center', 'justify-center');
	});

	it('renders with different variants', () => {
		const { rerender } = render(Button, {
			props: { variant: 'default', children: 'Default Button' }
		});

		let button = screen.getByRole('button');
		expect(button).toHaveClass('bg-primary', 'text-primary-foreground');

		rerender({ variant: 'destructive', children: 'Destructive Button' });
		button = screen.getByRole('button');
		expect(button).toHaveClass('bg-destructive', 'text-destructive-foreground');

		rerender({ variant: 'outline', children: 'Outline Button' });
		button = screen.getByRole('button');
		expect(button).toHaveClass('border', 'border-input', 'bg-background');

		rerender({ variant: 'secondary', children: 'Secondary Button' });
		button = screen.getByRole('button');
		expect(button).toHaveClass('bg-secondary', 'text-secondary-foreground');

		rerender({ variant: 'ghost', children: 'Ghost Button' });
		button = screen.getByRole('button');
		expect(button).toHaveClass('hover:bg-accent', 'hover:text-accent-foreground');

		rerender({ variant: 'link', children: 'Link Button' });
		button = screen.getByRole('button');
		expect(button).toHaveClass('text-primary', 'underline-offset-4');
	});

	it('renders with different sizes', () => {
		const { rerender } = render(Button, {
			props: { size: 'default', children: 'Default Size' }
		});

		let button = screen.getByRole('button');
		expect(button).toHaveClass('h-10', 'px-4', 'py-2');

		rerender({ size: 'sm', children: 'Small Button' });
		button = screen.getByRole('button');
		expect(button).toHaveClass('h-9', 'rounded-md', 'px-3');

		rerender({ size: 'lg', children: 'Large Button' });
		button = screen.getByRole('button');
		expect(button).toHaveClass('h-11', 'rounded-md', 'px-8');

		rerender({ size: 'icon', children: 'Icon Button' });
		button = screen.getByRole('button');
		expect(button).toHaveClass('h-10', 'w-10');
	});

	it('handles click events', async () => {
		const handleClick = vi.fn();
		render(Button, {
			props: {
				children: 'Click me',
				on: { click: handleClick }
			}
		});

		const button = screen.getByRole('button');
		await fireEvent.click(button);

		expect(handleClick).toHaveBeenCalledTimes(1);
	});

	it('can be disabled', () => {
		render(Button, {
			props: {
				disabled: true,
				children: 'Disabled Button'
			}
		});

		const button = screen.getByRole('button');
		expect(button).toBeDisabled();
		expect(button).toHaveClass('pointer-events-none', 'opacity-50');
	});

	it('renders with loading state', () => {
		render(Button, {
			props: {
				loading: true,
				children: 'Loading Button'
			}
		});

		const button = screen.getByRole('button');
		expect(button).toBeDisabled();
		expect(button).toHaveClass('pointer-events-none');

		// Check for loading spinner
		const spinner = button.querySelector('[data-testid="loading-spinner"]');
		expect(spinner).toBeInTheDocument();
	});

	it('forwards ref correctly', () => {
		let buttonRef: HTMLButtonElement;

		render(Button, {
			props: {
				children: 'Ref Button',
				bind: (el: HTMLButtonElement) => {
					buttonRef = el;
				}
			}
		});

		const button = screen.getByRole('button');
		expect(buttonRef).toBe(button);
	});

	it('applies custom classes', () => {
		render(Button, {
			props: {
				class: 'custom-class',
				children: 'Custom Button'
			}
		});

		const button = screen.getByRole('button');
		expect(button).toHaveClass('custom-class');
	});

	it('renders with icon', () => {
		render(Button, {
			props: {
				children: 'Button with Icon',
				icon: '🚀'
			}
		});

		const button = screen.getByRole('button');
		expect(button).toHaveTextContent('🚀');
		expect(button).toHaveTextContent('Button with Icon');
	});

	it('renders as different HTML elements', () => {
		const { rerender } = render(Button, {
			props: {
				as: 'a',
				href: '/test',
				children: 'Link Button'
			}
		});

		let link = screen.getByRole('link');
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute('href', '/test');

		rerender({ as: 'button', children: 'Regular Button' });
		const button = screen.getByRole('button');
		expect(button).toBeInTheDocument();
	});
});
