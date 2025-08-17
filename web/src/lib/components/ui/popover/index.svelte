<script lang="ts">
	import { fade } from 'svelte';

	import { useAriaButton } from '$lib/accessibility/aria-button';

	export let open = false;
	export let align: 'start' | 'center' | 'end' = 'center';
	export let class_name = '';
	export let onOpen: (() => void) | undefined = undefined;
	export let onClose: (() => void) | undefined = undefined;

	function handleTriggerClick() {
		open = !open;
		if (open && onOpen) {
			onOpen();
		} else if (!open && onClose) {
			onClose();
		}
	}

	function handleClickOutside() {
		open = false;
		if (onClose) {
			onClose();
		}
	}

	function handleBackdropKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleClickOutside();
		}
	}
</script>

<div class="relative">
	<!-- Trigger -->
	<div
		use:useAriaButton={{ label: 'Toggle popover menu' }}
		on:click={handleTriggerClick}
		aria-expanded={open}
		aria-haspopup="true"
		class="cursor-pointer"
	>
		<slot name="trigger" />
	</div>

	<!-- Backdrop -->
	{#if open}
		<div
			class="fixed inset-0 z-40"
			on:click={handleClickOutside}
			on:keydown={handleBackdropKeydown}
			transition:fade={{ duration: 100 }}
			aria-roledescription="Backdrop"
			aria-label="Backdrop"
			role="presentation"
		></div>
	{/if}

	<!-- Content -->
	{#if open}
		<div
			class={`ring-opacity-5 absolute z-50 mt-2 min-w-[8rem] origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black focus:outline-none ${
				align === 'start' ? 'left-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-0'
			} ${class_name}`}
			transition:fade={{ duration: 100 }}
			role="dialog"
			aria-modal="true"
		>
			<slot name="content" />
		</div>
	{/if}
</div>
