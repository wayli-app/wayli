<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { fade } from 'svelte/transition';
	import { useAriaButton } from '$lib/accessibility/aria-button';

	export let open = false;
	export let align: 'start' | 'center' | 'end' = 'center';
	export let class_name = '';

	const dispatch = createEventDispatcher();

	function handleTriggerClick() {
		open = !open;
		dispatch(open ? 'open' : 'close', undefined);
	}

	function handleClickOutside() {
		open = false;
		dispatch('close', undefined);
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
