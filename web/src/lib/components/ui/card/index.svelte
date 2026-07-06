<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	type Props = {
		class?: string;
		children?: Snippet;
		[key: string]: unknown;
	};

	let { class: className = '', children, ...rest }: Props = $props();
</script>

<div
	class={cn('bg-card text-foreground border-border rounded-lg border shadow-sm', className)}
	{...rest}
>
	{@render children?.()}
</div>
