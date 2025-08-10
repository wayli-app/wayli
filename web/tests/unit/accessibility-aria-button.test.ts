// src/tests/unit/accessibility-aria-button.test.ts
// Tests for the useAriaButton accessibility action

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAriaButton } from '$lib/accessibility/aria-button';

describe('useAriaButton', () => {
	let element: HTMLElement;

	beforeEach(() => {
		element = document.createElement('div');
		document.body.appendChild(element);
	});

	afterEach(() => {
		document.body.removeChild(element);
	});

	describe('Basic functionality', () => {
		it('should add role="button" to the element', () => {
			const action = useAriaButton(element);

			expect(element.getAttribute('role')).toBe('button');

			action.destroy();
		});

		it('should add tabindex="0" to the element', () => {
			const action = useAriaButton(element);

			expect(element.getAttribute('tabindex')).toBe('0');

			action.destroy();
		});

		it('should make the element focusable', () => {
			const action = useAriaButton(element);

			element.focus();
			expect(document.activeElement).toBe(element);

			action.destroy();
		});
	});

	describe('ARIA label', () => {
		it('should add aria-label when provided', () => {
			const action = useAriaButton(element, { label: 'Click me' });

			expect(element.getAttribute('aria-label')).toBe('Click me');

			action.destroy();
		});

		it('should not add aria-label when not provided', () => {
			const action = useAriaButton(element);

			expect(element.getAttribute('aria-label')).toBeNull();

			action.destroy();
		});

		it('should update aria-label when options change', () => {
			const action = useAriaButton(element, { label: 'Initial label' });
			expect(element.getAttribute('aria-label')).toBe('Initial label');

			// Simulate updating with new options
			action.destroy();
			const newAction = useAriaButton(element, { label: 'Updated label' });
			expect(element.getAttribute('aria-label')).toBe('Updated label');

			newAction.destroy();
		});
	});

	describe('Keyboard event handling', () => {
		it('should trigger click event on Enter key', () => {
			const action = useAriaButton(element);
			let clickTriggered = false;

			element.addEventListener('click', () => {
				clickTriggered = true;
			});

			const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
			element.dispatchEvent(enterEvent);

			expect(clickTriggered).toBe(true);

			action.destroy();
		});

		it('should trigger click event on Space key', () => {
			const action = useAriaButton(element);
			let clickTriggered = false;

			element.addEventListener('click', () => {
				clickTriggered = true;
			});

			const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
			element.dispatchEvent(spaceEvent);

			expect(clickTriggered).toBe(true);

			action.destroy();
		});

		it('should prevent default behavior for Enter key', () => {
			const action = useAriaButton(element);

			const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
			const preventDefaultSpy = vi.spyOn(enterEvent, 'preventDefault');

			element.dispatchEvent(enterEvent);

			expect(preventDefaultSpy).toHaveBeenCalled();

			action.destroy();
		});

		it('should prevent default behavior for Space key', () => {
			const action = useAriaButton(element);

			const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
			const preventDefaultSpy = vi.spyOn(spaceEvent, 'preventDefault');

			element.dispatchEvent(spaceEvent);

			expect(preventDefaultSpy).toHaveBeenCalled();

			action.destroy();
		});

		it('should not trigger click for other keys', () => {
			const action = useAriaButton(element);
			let clickTriggered = false;

			element.addEventListener('click', () => {
				clickTriggered = true;
			});

			const otherEvent = new KeyboardEvent('keydown', { key: 'Tab' });
			element.dispatchEvent(otherEvent);

			expect(clickTriggered).toBe(false);

			action.destroy();
		});

		it('should not prevent default for other keys', () => {
			const action = useAriaButton(element);

			const otherEvent = new KeyboardEvent('keydown', { key: 'Tab' });
			const preventDefaultSpy = vi.spyOn(otherEvent, 'preventDefault');

			element.dispatchEvent(otherEvent);

			expect(preventDefaultSpy).not.toHaveBeenCalled();

			action.destroy();
		});
	});

	describe('Cleanup', () => {
		it('should remove event listeners on destroy', () => {
			const action = useAriaButton(element);
			let clickTriggered = false;

			element.addEventListener('click', () => {
				clickTriggered = true;
			});

			// Test that it works before destroy
			const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
			element.dispatchEvent(enterEvent);
			expect(clickTriggered).toBe(true);

			// Reset and destroy
			clickTriggered = false;
			action.destroy();

			// Test that it doesn't work after destroy
			element.dispatchEvent(enterEvent);
			expect(clickTriggered).toBe(false);
		});

		it('should preserve existing attributes when destroyed', () => {
			element.setAttribute('data-test', 'value');
			element.setAttribute('class', 'existing-class');

			const action = useAriaButton(element, { label: 'Test' });
			action.destroy();

			expect(element.getAttribute('data-test')).toBe('value');
			expect(element.getAttribute('class')).toBe('existing-class');
		});

		it('should not throw error when destroyed multiple times', () => {
			const action = useAriaButton(element);

			expect(() => {
				action.destroy();
				action.destroy();
			}).not.toThrow();
		});
	});

	describe('Integration with existing attributes', () => {
		it('should work with existing role attribute', () => {
			element.setAttribute('role', 'presentation');

			const action = useAriaButton(element);

			expect(element.getAttribute('role')).toBe('button');

			action.destroy();
		});

		it('should work with existing tabindex attribute', () => {
			element.setAttribute('tabindex', '-1');

			const action = useAriaButton(element);

			expect(element.getAttribute('tabindex')).toBe('0');

			action.destroy();
		});

		it('should work with existing aria-label attribute', () => {
			element.setAttribute('aria-label', 'Existing label');

			const action = useAriaButton(element, { label: 'New label' });

			expect(element.getAttribute('aria-label')).toBe('New label');

			action.destroy();
		});
	});

	describe('Edge cases', () => {
		it('should handle empty label option', () => {
        const action = useAriaButton(element, { label: '' });

        expect(element.getAttribute('aria-label')).toBeNull();

			action.destroy();
		});

		it('should handle null label option', () => {
			const action = useAriaButton(element, { label: null as unknown as string });

			expect(element.getAttribute('aria-label')).toBeNull();

			action.destroy();
		});

		it('should handle undefined options', () => {
			const action = useAriaButton(element, undefined);

			expect(element.getAttribute('role')).toBe('button');
			expect(element.getAttribute('tabindex')).toBe('0');
			expect(element.getAttribute('aria-label')).toBeNull();

			action.destroy();
		});

		it('should handle element that is not in DOM', () => {
			const detachedElement = document.createElement('div');
			const action = useAriaButton(detachedElement);

			expect(detachedElement.getAttribute('role')).toBe('button');
			expect(detachedElement.getAttribute('tabindex')).toBe('0');

			action.destroy();
		});
	});

	describe('Accessibility compliance', () => {
		it('should meet WCAG 2.1 AA requirements for keyboard accessibility', () => {
			const action = useAriaButton(element, { label: 'Accessible button' });

			// Check that element is focusable
			expect(element.getAttribute('tabindex')).toBe('0');

			// Check that element has proper role
			expect(element.getAttribute('role')).toBe('button');

			// Check that element has accessible name
			expect(element.getAttribute('aria-label')).toBe('Accessible button');

			// Test keyboard interaction
			let clickTriggered = false;
			element.addEventListener('click', () => {
				clickTriggered = true;
			});

			element.focus();
			const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
			element.dispatchEvent(enterEvent);

			expect(clickTriggered).toBe(true);

			action.destroy();
		});

		it('should support screen reader navigation', () => {
			const action = useAriaButton(element, { label: 'Screen reader button' });

			// Element should be discoverable by screen readers
			expect(element.getAttribute('role')).toBe('button');
			expect(element.getAttribute('aria-label')).toBe('Screen reader button');

			// Element should be focusable for keyboard navigation
			expect(element.getAttribute('tabindex')).toBe('0');

			action.destroy();
		});
	});
});