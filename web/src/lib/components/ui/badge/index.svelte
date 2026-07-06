<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	type Props = {
		variant?: 'default' | 'secondary' | 'destructive' | 'outline';
		class?: string;
		children?: Snippet;
		[key: string]: unknown;
	};

	let {
		variant = 'default',
		class: className = '',
		children,
		...rest
	}: Props = $props();

	const variants = {
		default: 'bg-primary text-primary-foreground hover:bg-primary/80',
		secondary: 'bg-muted text-muted-foreground hover:bg-muted/80',
		destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/80',
		outline: 'text-foreground'
	} as const;

	const variantClass = $derived(variants[variant]);
</script>

<div
	class={cn(
		'focus:ring-ring inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none',
		variantClass,
		className
	)}
	{...rest}
>
	{@render children?.()}
</div>
