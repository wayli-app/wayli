/**
 * Svelte action that traps keyboard focus inside an element while it is "active".
 *
 * Intended for overlays (mobile sidebars, drawers, modals) where keyboard users
 * must not Tab into the visually-covered content behind them. The action:
 *   - moves focus into the element when activated,
 *   - keeps Tab/Shift-Tab cycling within the element's focusable descendants,
 *   - restores focus to the previously-focused element on deactivation.
 *
 * Usage:
 *   <div use:focusTrap={active}>…</div>
 *
 * Pass a reactive boolean; the trap engages when it becomes `true` and
 * releases when it becomes `false`. No-op on `false`.
 */

const FOCUSABLE = [
	'a[href]',
	'button:not([disabled])',
	'textarea',
	'input',
	'select',
	'[tabindex]:not([tabindex="-1"])'
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		(el) => el.offsetParent !== null || el === document.activeElement
	);
}

export function focusTrap(node: HTMLElement, active: boolean) {
	let previouslyFocused: HTMLElement | null = null;
	let enabled = false;

	function onKeydown(e: KeyboardEvent) {
		if (!enabled || e.key !== 'Tab') return;
		const focusable = getFocusable(node);
		if (focusable.length === 0) {
			e.preventDefault();
			return;
		}

		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		if (e.shiftKey) {
			if (document.activeElement === first || !node.contains(document.activeElement)) {
				e.preventDefault();
				last.focus();
			}
		} else {
			if (document.activeElement === last || !node.contains(document.activeElement)) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	function engage() {
		if (enabled) return;
		enabled = true;
		previouslyFocused = document.activeElement as HTMLElement | null;
		document.addEventListener('keydown', onKeydown, true);
		// Move focus to the first focusable element (or the container itself).
		queueMicrotask(() => {
			const focusable = getFocusable(node);
			if (focusable.length > 0) {
				focusable[0].focus();
			} else {
				node.setAttribute('tabindex', '-1');
				node.focus();
			}
		});
	}

	function release() {
		if (!enabled) return;
		enabled = false;
		document.removeEventListener('keydown', onKeydown, true);
		previouslyFocused?.focus();
		previouslyFocused = null;
	}

	// Engage on mount if already active; `update` reacts to later changes.
	if (active) engage();

	return {
		update(next: boolean) {
			if (next) {
				engage();
			} else {
				release();
			}
		},
		destroy() {
			release();
		}
	};
}
