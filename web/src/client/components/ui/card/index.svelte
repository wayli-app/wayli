<script lang="ts">
	import { cn } from '$lib/utils';

	export let className: string = '';
</script>

<div
	class={cn(
		'rounded-lg border border-gray-200 bg-white text-gray-900 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100',
		className
	)}
	{...$$restProps}
>
	<slot />
</div>
