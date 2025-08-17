/**
 * Accessibility Utilities
 * Comprehensive accessibility helpers for WCAG 2.1 AA compliance
 */

import { browser } from '$app/environment';

// Focus management
export class FocusManager {
	private focusableElements: HTMLElement[] = [];
	private currentIndex = 0;

	constructor(private container: HTMLElement) {
		this.updateFocusableElements();
	}

	private updateFocusableElements() {
		this.focusableElements = Array.from(
			this.container.querySelectorAll(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
			)
		).filter((el) => {
			const element = el as HTMLElement;
			return (
				!(element as HTMLElement & { disabled?: boolean }).disabled && element.offsetParent !== null
			);
		}) as HTMLElement[];
	}

	focusFirst() {
		if (this.focusableElements.length > 0) {
			this.focusableElements[0].focus();
			this.currentIndex = 0;
		}
	}

	focusLast() {
		if (this.focusableElements.length > 0) {
			const lastIndex = this.focusableElements.length - 1;
			this.focusableElements[lastIndex].focus();
			this.currentIndex = lastIndex;
		}
	}

	focusNext() {
		if (this.focusableElements.length > 0) {
			this.currentIndex = (this.currentIndex + 1) % this.focusableElements.length;
			this.focusableElements[this.currentIndex].focus();
		}
	}

	focusPrevious() {
		if (this.focusableElements.length > 0) {
			this.currentIndex =
				this.currentIndex === 0 ? this.focusableElements.length - 1 : this.currentIndex - 1;
			this.focusableElements[this.currentIndex].focus();
		}
	}

	trapFocus(event: KeyboardEvent) {
		if (event.key === 'Tab') {
			event.preventDefault();
			if (event.shiftKey) {
				this.focusPrevious();
			} else {
				this.focusNext();
			}
		}
	}
}

// ARIA helpers
export const ariaHelpers = {
	// Live regions for screen readers
	announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
		if (!browser) return;

		let liveRegion = document.getElementById('aria-live-region');
		if (!liveRegion) {
			liveRegion = document.createElement('div');
			liveRegion.id = 'aria-live-region';
			liveRegion.setAttribute('aria-live', priority);
			liveRegion.setAttribute('aria-atomic', 'true');
			liveRegion.style.position = 'absolute';
			liveRegion.style.left = '-10000px';
			liveRegion.style.width = '1px';
			liveRegion.style.height = '1px';
			liveRegion.style.overflow = 'hidden';
			document.body.appendChild(liveRegion);
		}

		liveRegion.textContent = message;
	},

	// Generate unique IDs
	generateId(prefix: string): string {
		return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
	},

	// Set focus with announcement
	focusWithAnnouncement(element: HTMLElement, announcement?: string) {
		element.focus();
		if (announcement) {
			this.announce(announcement);
		}
	}
};

// Keyboard navigation helpers
export const keyboardNavigation = {
	// Handle arrow key navigation in lists
	handleArrowKeys(
		event: KeyboardEvent,
		items: unknown[],
		currentIndex: number,
		onSelect: (index: number) => void
	) {
		switch (event.key) {
			case 'ArrowDown': {
				event.preventDefault();
				const nextIndex = (currentIndex + 1) % items.length;
				onSelect(nextIndex);
				break;
			}
			case 'ArrowUp': {
				event.preventDefault();
				const prevIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1;
				onSelect(prevIndex);
				break;
			}
			case 'Home':
				event.preventDefault();
				onSelect(0);
				break;
			case 'End':
				event.preventDefault();
				onSelect(items.length - 1);
				break;
		}
	},

	// Handle escape key
	handleEscape(event: KeyboardEvent, onEscape: () => void) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onEscape();
		}
	},

	// Handle enter/space for activation
	handleActivation(event: KeyboardEvent, onActivate: () => void) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onActivate();
		}
	}
};

// Color contrast utilities
export const colorContrast = {
	// Calculate relative luminance
	getLuminance(r: number, g: number, b: number): number {
		const [rs, gs, bs] = [r, g, b].map((c) => {
			c = c / 255;
			return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
		});
		return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
	},

	// Calculate contrast ratio
	getContrastRatio(luminance1: number, luminance2: number): number {
		const lighter = Math.max(luminance1, luminance2);
		const darker = Math.min(luminance1, luminance2);
		return (lighter + 0.05) / (darker + 0.05);
	},

	// Check if contrast meets WCAG AA standards
	meetsWCAGAA(contrastRatio: number, isLargeText: boolean = false): boolean {
		return isLargeText ? contrastRatio >= 3 : contrastRatio >= 4.5;
	}
};

// Screen reader utilities
export const screenReader = {
	// Hide element visually but keep it accessible to screen readers
	srOnly: 'sr-only',

	// Show element only to screen readers
	srOnlyClass: 'absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0',

	// Announce loading state
	announceLoading(message: string = 'Loading...') {
		ariaHelpers.announce(message, 'assertive');
	},

	// Announce completion
	announceComplete(message: string = 'Complete') {
		ariaHelpers.announce(message, 'polite');
	},

	// Announce error
	announceError(message: string) {
		ariaHelpers.announce(`Error: ${message}`, 'assertive');
	}
};

// Touch target utilities
export const touchTargets = {
	// Minimum touch target size (44px for mobile)
	minSize: '44px',

	// Ensure element meets minimum touch target size
	ensureMinSize(element: HTMLElement) {
		const rect = element.getBoundingClientRect();
		const minSize = 44;

		if (rect.width < minSize || rect.height < minSize) {
			const padding = Math.max(0, (minSize - Math.min(rect.width, rect.height)) / 2);
			element.style.padding = `${padding}px`;
		}
	}
};

// Form accessibility helpers
export const formAccessibility = {
	// Associate label with input
	associateLabel(input: HTMLInputElement, label: HTMLLabelElement) {
		const id = input.id || ariaHelpers.generateId('input');
		input.id = id;
		label.setAttribute('for', id);
	},

	// Add error message association
	addErrorMessage(input: HTMLInputElement, errorMessage: string) {
		const errorId = ariaHelpers.generateId('error');
		input.setAttribute('aria-describedby', errorId);
		input.setAttribute('aria-invalid', 'true');

		const errorElement = document.createElement('div');
		errorElement.id = errorId;
		errorElement.className = screenReader.srOnlyClass;
		errorElement.textContent = errorMessage;
		input.parentElement?.appendChild(errorElement);
	},

	// Remove error message association
	removeErrorMessage(input: HTMLInputElement) {
		input.removeAttribute('aria-describedby');
		input.removeAttribute('aria-invalid');

		const errorId = input.getAttribute('aria-describedby');
		if (errorId) {
			document.getElementById(errorId)?.remove();
		}
	}
};

// Animation and motion preferences
export const motionPreferences = {
	// Check if user prefers reduced motion
	prefersReducedMotion(): boolean {
		if (!browser) return false;
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	},

	// Apply reduced motion styles
	applyReducedMotion(element: HTMLElement) {
		if (this.prefersReducedMotion()) {
			element.style.animation = 'none';
			element.style.transition = 'none';
		}
	}
};

// Export all utilities
export default {
	FocusManager,
	ariaHelpers,
	keyboardNavigation,
	colorContrast,
	screenReader,
	touchTargets,
	formAccessibility,
	motionPreferences
};
