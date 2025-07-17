<script lang="ts">
	import { cn } from '$lib/utils';

	export let type: string = 'text';
	export let className: string = '';
	export let disabled = false;
	export let value: string = '';
</script>

<input
	{type}
	{disabled}
	bind:value
	class={cn(
		'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	on:input
	on:change
	on:focus
	on:blur
	{...$$restProps}
/>
