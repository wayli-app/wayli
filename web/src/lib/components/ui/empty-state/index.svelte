<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	type Props = {
		/** Leading icon (rendered in muted-foreground). */
		icon?: Snippet;
		title: string;
		/** Inline description; falls back to the default children snippet if omitted. */
		description?: string;
		/** Optional call-to-action (button/link) rendered below. */
		cta?: Snippet;
		children?: Snippet;
		class?: string;
	};

	let { icon, title, description, cta, children, class: className = '' }: Props = $props();
</script>

<div class={cn('flex flex-col items-center justify-center rounded-lg p-8 text-center', className)}>
	{#if icon}
		<div class="text-muted-foreground mb-4">{@render icon()}</div>
	{/if}
	<h3 class="text-foreground mb-1 text-base font-semibold">{title}</h3>
	{#if description}
		<p class="text-muted-foreground mb-4 max-w-sm text-sm">{description}</p>
	{:else if children}
		<div class="text-muted-foreground mb-4 max-w-sm text-sm">{@render children()}</div>
	{/if}
	{#if cta}
		{@render cta()}
	{/if}
</div>
