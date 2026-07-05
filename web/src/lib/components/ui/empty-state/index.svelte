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
		<div class="mb-4 text-muted-foreground">{@render icon()}</div>
	{/if}
	<h3 class="mb-1 text-base font-semibold text-foreground">{title}</h3>
	{#if description}
		<p class="mb-4 max-w-sm text-sm text-muted-foreground">{description}</p>
	{:else if children}
		<div class="mb-4 max-w-sm text-sm text-muted-foreground">{@render children()}</div>
	{/if}
	{#if cta}
		{@render cta()}
	{/if}
</div>
