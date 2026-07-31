<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	type Props = {
		class?: string;
		children?: Snippet;
	};

	let { class: className = '', children }: Props = $props();
</script>

<div class={cn('bg-muted animate-pulse rounded-md', className)}>
	{@render children?.()}
</div>
