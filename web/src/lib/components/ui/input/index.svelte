<script lang="ts">
	import { cn } from '$lib/utils';

	type Props = {
		type?: string;
		value?: string | number;
		disabled?: boolean;
		invalid?: boolean;
		/** When set, the input is marked aria-invalid and the message renders below with role="alert". */
		error?: string;
		class?: string;
		[key: string]: unknown;
	};

	let {
		type = 'text',
		value = $bindable(''),
		disabled = false,
		invalid = false,
		error,
		class: className = '',
		...rest
	}: Props = $props();

	const isInvalid = $derived(invalid || !!error);
</script>

<input
	{type}
	{disabled}
	bind:value
	aria-invalid={isInvalid ? 'true' : undefined}
	class={cn(
		'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
		isInvalid && 'border-destructive focus-visible:ring-destructive',
		className
	)}
	{...rest}
/>
{#if error}
	<p class="text-destructive mt-1 text-sm" role="alert">{error}</p>
{/if}
