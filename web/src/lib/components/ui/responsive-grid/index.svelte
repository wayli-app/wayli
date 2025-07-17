<script lang="ts">
	import { cn } from '$lib/utils';

	export let columns: 1 | 2 | 3 | 4 | 5 | 6 = 3;
	export let gap: 'sm' | 'md' | 'lg' | 'xl' = 'md';
	export let className: string = '';

	const gapClasses = {
		sm: 'gap-2',
		md: 'gap-4',
		lg: 'gap-6',
		xl: 'gap-8'
	};

	const responsiveColumns = {
		1: 'grid-cols-1',
		2: 'grid-cols-1 sm:grid-cols-2',
		3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
		4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
		5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
		6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'
	};
</script>

<div class={cn('grid', responsiveColumns[columns], gapClasses[gap], className)}>
	<slot />
</div>
