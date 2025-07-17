<script lang="ts">
	import { cn } from '$lib/utils';

	type ButtonVariants = {
		variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
		size?: 'default' | 'sm' | 'lg' | 'icon';
	};

	const buttonVariants = {
		variant: {
			default: 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700',
			destructive: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700',
			outline:
				'border border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700',
			secondary:
				'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600',
			ghost: 'hover:bg-gray-100 dark:hover:bg-gray-700',
			link: 'text-blue-600 underline-offset-4 hover:underline dark:text-blue-400'
		},
		size: {
			default: 'h-10 px-4 py-2',
			sm: 'h-9 rounded-md px-3 text-sm',
			lg: 'h-11 rounded-md px-8',
			icon: 'h-10 w-10'
		}
	};

	export let variant: ButtonVariants['variant'] = 'default';
	export let size: ButtonVariants['size'] = 'default';
	export let className: string = '';
	export let disabled = false;
	export let type: 'button' | 'submit' | 'reset' = 'button';

	// Ensure variant and size have valid values
	$: buttonVariant = variant || 'default';
	$: buttonSize = size || 'default';
</script>

<button
	{type}
	{disabled}
	class={cn(
		'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
		buttonVariants.variant[buttonVariant],
		buttonVariants.size[buttonSize],
		className
	)}
	on:click
	on:keydown
	{...$$restProps}
>
	<slot />
</button>
