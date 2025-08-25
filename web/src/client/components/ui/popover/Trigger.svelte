<script lang="ts">
	import { getContext } from 'svelte';

	import { useAriaButton } from '$lib/accessibility/aria-button';

	import type { Writable } from 'svelte/store';

	const toggleOpen = () => {
		const open = getContext<Writable<boolean>>('popover:open');
		open.update((v: boolean) => !v);
	};
</script>

<button
	use:useAriaButton={{ label: 'Toggle popover' }}
	onclick={toggleOpen}
	        onkeydown={(e) => e.key === 'Enter' && toggleOpen()}
        tabindex="0"
>
	<slot />
</button>
