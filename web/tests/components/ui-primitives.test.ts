import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';

import Input from '$lib/components/ui/input/index.svelte';
import Card from '$lib/components/ui/card/index.svelte';
import Badge from '$lib/components/ui/badge/index.svelte';

describe('ui primitives — accessibility', () => {
	describe('Input', () => {
		it('marks the field aria-invalid and shows the error with role="alert"', () => {
			const { getByRole, getByPlaceholderText } = render(Input, {
				props: { error: 'Invalid email', placeholder: 'Email' }
			});

			expect(getByPlaceholderText('Email')).toHaveAttribute('aria-invalid', 'true');
			expect(getByRole('alert')).toHaveTextContent('Invalid email');
		});

		it('does not set aria-invalid when there is no error', () => {
			const { getByPlaceholderText } = render(Input, {
				props: { placeholder: 'Name' }
			});
			expect(getByPlaceholderText('Name')).not.toHaveAttribute('aria-invalid');
		});

		it('honours an explicit invalid prop even without an error message', () => {
			const { getByPlaceholderText } = render(Input, {
				props: { invalid: true, placeholder: 'X' }
			});
			expect(getByPlaceholderText('X')).toHaveAttribute('aria-invalid', 'true');
		});
	});

	describe('Card', () => {
		it('renders a tokenized surface', () => {
			const { container } = render(Card, { props: {} as never });
			expect(container.firstChild).toHaveClass('bg-card');
			expect(container.firstChild).toHaveClass('border-border');
		});
	});

	describe('Badge', () => {
		it('applies the destructive variant token', () => {
			const { container } = render(Badge, {
				props: { variant: 'destructive' } as never
			});
			expect(container.firstChild).toHaveClass('bg-destructive');
		});

		it('defaults to the primary variant', () => {
			const { container } = render(Badge, { props: {} as never });
			expect(container.firstChild).toHaveClass('bg-primary');
		});
	});
});
