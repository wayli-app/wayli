// web/src/lib/accessibility/aria-button.ts
/**
 * Svelte action to make any element behave like an accessible button.
 * Adds role="button", tabindex=0, and keyboard handlers for Enter/Space.
 *
 * Usage:
 * <div use:useAriaButton={{ label: 'Open menu' }} on:click={...}>...</div>
 *
 * @param node The element to enhance
 * @param options Optional: { label?: string }
 */
export function useAriaButton(node: HTMLElement, options?: { label?: string }) {
	node.setAttribute('role', 'button');
	node.setAttribute('tabindex', '0');
	if (options?.label) {
		node.setAttribute('aria-label', options.label);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			node.click();
		}
	}

	node.addEventListener('keydown', handleKeydown);

	return {
		update(newOptions?: { label?: string }) {
			if (newOptions?.label) {
				node.setAttribute('aria-label', newOptions.label);
			} else {
				node.removeAttribute('aria-label');
			}
		},
		destroy() {
			node.removeEventListener('keydown', handleKeydown);
		}
	};
}
