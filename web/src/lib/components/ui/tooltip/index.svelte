<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { onMount, onDestroy } from 'svelte';

	export let text: string = '';
	export let position: 'top' | 'bottom' | 'left' | 'right' = 'top';
	export let show = false;

	const dispatch = createEventDispatcher();

	let tooltipElement: HTMLDivElement;
	let triggerElement: HTMLElement;

	function handleMouseEnter() {
		show = true;
	}

	function handleMouseLeave() {
		show = false;
	}

	// Position the tooltip relative to the trigger element
	function positionTooltip() {
		if (!tooltipElement || !triggerElement) return;

		const triggerRect = triggerElement.getBoundingClientRect();
		const tooltipRect = tooltipElement.getBoundingClientRect();

		let top = 0;
		let left = 0;

		switch (position) {
			case 'top':
				top = triggerRect.top - tooltipRect.height - 8;
				left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
				break;
			case 'bottom':
				top = triggerRect.bottom + 8;
				left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
				break;
			case 'left':
				top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
				left = triggerRect.left - tooltipRect.width - 8;
				break;
			case 'right':
				top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
				left = triggerRect.right + 8;
				break;
		}

		// Ensure tooltip stays within viewport
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		if (left < 8) left = 8;
		if (left + tooltipRect.width > viewportWidth - 8) {
			left = viewportWidth - tooltipRect.width - 8;
		}
		if (top < 8) top = 8;
		if (top + tooltipRect.height > viewportHeight - 8) {
			top = viewportHeight - tooltipRect.height - 8;
		}

		tooltipElement.style.top = `${top}px`;
		tooltipElement.style.left = `${left}px`;
	}

	$: if (show && tooltipElement) {
		// Use requestAnimationFrame to ensure DOM is updated
		requestAnimationFrame(() => {
			positionTooltip();
		});
	}
</script>

<div
	bind:this={triggerElement}
	on:mouseenter={handleMouseEnter}
	on:mouseleave={handleMouseLeave}
	class="relative inline-block"
>
	<slot />
</div>

{#if show}
	<div
		bind:this={tooltipElement}
		class="fixed z-50 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-lg pointer-events-none whitespace-nowrap transition-opacity duration-200"
		style="opacity: {show ? '1' : '0'}"
	>
		{text}
		<!-- Arrow -->
		<div class="absolute w-2 h-2 bg-gray-900 transform rotate-45 {position === 'top' ? 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2' : position === 'bottom' ? 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2' : position === 'left' ? 'right-0 top-1/2 -translate-y-1/2 translate-x-1/2' : 'left-0 top-1/2 -translate-y-1/2 -translate-x-1/2'}"></div>
	</div>
{/if}