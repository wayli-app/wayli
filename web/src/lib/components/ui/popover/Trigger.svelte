<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';

	const toggleOpen = () => {
		const open = getContext<Writable<boolean>>('popover:open');
		open.update((v: boolean) => !v);
	};
</script>

<div onclick={toggleOpen}>
	<slot />
</div>

