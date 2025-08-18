<script lang="ts">
	import { LayoutGrid, List } from 'lucide-svelte';

	export let view: 'tile' | 'list';
</script>

<div
	class="flex gap-1 rounded-md border border-[rgb(218,218,221)] bg-white p-1 dark:border-[#23232a] dark:bg-[#23232a]"
>
	<button
		class="cursor-pointer rounded p-1.5 transition-colors {view === 'list'
			? 'bg-gray-100'
			: 'hover:bg-gray-50'}"
		onclick={() => (view = 'list')}
		aria-label="List view"
	>
		<List class="h-4 w-4 text-gray-600" />
	</button>
	<button
		class="cursor-pointer rounded p-1.5 transition-colors {view === 'tile'
			? 'bg-gray-100'
			: 'hover:bg-gray-50'}"
		onclick={() => (view = 'tile')}
		aria-label="Tile view"
	>
		<LayoutGrid class="h-4 w-4 text-gray-600" />
	</button>
</div>
