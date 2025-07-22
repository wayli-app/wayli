<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import { X } from 'lucide-svelte';
	import {
		FocusManager,
		ariaHelpers,
		keyboardNavigation,
		screenReader
	} from '$lib/accessibility/accessibility-utils';

	export let open = false;
	export let title = '';
	export let description: string | undefined = undefined;
	export let size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
	export let showCloseButton = true;
	export let closeOnBackdropClick = true;
	export let closeOnEscape = true;
	export let trapFocus = true;

	const dispatch = createEventDispatcher();

	const sizeClasses = {
		sm: 'max-w-sm',
		md: 'max-w-md',
		lg: 'max-w-lg',
		xl: 'max-w-4xl'
	};

	let modalElement: HTMLDivElement;
	let focusManager: FocusManager;
	let previousActiveElement: HTMLElement | null = null;
	let modalId: string;
	let titleId: string;
	let descriptionId: string;

	onMount(() => {
		modalId = ariaHelpers.generateId('modal');
		titleId = ariaHelpers.generateId('modal-title');
		descriptionId = ariaHelpers.generateId('modal-description');
	});

	// Handle modal open/close
	$: if (open && modalElement) {
		openModal();
	} else if (!open) {
		closeModal();
	}

	function openModal() {
		// Store the currently focused element
		previousActiveElement = document.activeElement as HTMLElement;

		// Initialize focus manager
		if (modalElement && trapFocus) {
			focusManager = new FocusManager(modalElement);
			// Focus first element after a brief delay to ensure DOM is ready
			setTimeout(() => {
				focusManager.focusFirst();
			}, 100);
		}

		// Announce modal opening
		screenReader.announceComplete(`Modal opened: ${title}`);
	}

	function closeModal() {
		// Restore focus to previous element
		if (previousActiveElement) {
			previousActiveElement.focus();
			previousActiveElement = null;
		}

		// Announce modal closing
		screenReader.announceComplete('Modal closed');
		dispatch('close', undefined);
	}

	function handleBackdropClick() {
		if (closeOnBackdropClick) {
			dispatch('close', undefined);
		}
	}

	function handleEscapeKey(event: KeyboardEvent) {
		if (closeOnEscape) {
			keyboardNavigation.handleEscape(event, () => {
				dispatch('close', undefined);
			});
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!trapFocus || !focusManager) return;

		// Handle tab for focus trapping
		if (event.key === 'Tab') {
			focusManager.trapFocus(event);
		}
	}

	onDestroy(() => {
		// Ensure focus is restored when component is destroyed
		if (previousActiveElement) {
			previousActiveElement.focus();
		}
	});
</script>

<svelte:window on:keydown={handleEscapeKey} />

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-all"
		role="dialog"
		aria-modal="true"
		aria-labelledby={titleId}
		aria-describedby={descriptionId}
		on:click={handleBackdropClick}
		transition:fade={{ duration: 200 }}
	>
		<!-- Modal Content -->
		<div
			bind:this={modalElement}
			class="relative mx-4 w-full cursor-default rounded-2xl bg-white p-8 shadow-2xl dark:bg-gray-900 {sizeClasses[
				size
			]} max-h-[90vh] overflow-y-auto"
			role="document"
			on:click|stopPropagation
			on:keydown={handleKeydown}
			transition:fade={{ duration: 200, delay: 100 }}
		>
			<!-- Header -->
			{#if title || showCloseButton}
				<div class="mb-6 flex items-start justify-between">
					{#if title}
						<h2 id={titleId} class="pr-8 text-2xl font-bold text-gray-900 dark:text-gray-100">
							{title}
						</h2>
					{/if}
					{#if showCloseButton}
						<button
							class="absolute top-4 right-4 cursor-pointer rounded-md p-2 text-gray-400 transition-colors hover:text-red-500 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:outline-none"
							on:click={() => dispatch('close', undefined)}
							aria-label="Close modal"
						>
							<X class="h-5 w-5" />
						</button>
					{/if}
				</div>
			{/if}

			<!-- Description (visually hidden but accessible) -->
			{#if description}
				<div id={descriptionId} class="sr-only">
					{description}
				</div>
			{/if}

			<!-- Content -->
			<div class="space-y-6">
				<slot />
			</div>
		</div>
	</div>
{/if}

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
