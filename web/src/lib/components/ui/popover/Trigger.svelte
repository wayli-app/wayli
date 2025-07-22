<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import { useAriaButton } from '$lib/accessibility/aria-button';

	const toggleOpen = () => {
		const open = getContext<Writable<boolean>>('popover:open');
		open.update((v: boolean) => !v);
	};
</script>

<div
  use:useAriaButton={{ label: 'Toggle popover' }}
  on:click={toggleOpen}
>
  <slot />
</div>
