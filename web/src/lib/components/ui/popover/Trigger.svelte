<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';

	const toggleOpen = () => {
		const open = getContext<Writable<boolean>>('popover:open');
		open.update((v: boolean) => !v);
	};
</script>

<div
	on:click={toggleOpen}
	role="button"
	tabindex="0"
	on:keydown={(e) => e.key === 'Enter' && toggleOpen()}
>
	<slot />
</div>
