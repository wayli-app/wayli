<script lang="ts">
	import { LayoutGrid, List } from 'lucide-svelte';

	export let view: 'tile' | 'list';
</script>

<div
	class="border-border dark:border-border dark:bg-card flex gap-1 rounded-md border bg-white p-1"
>
	<button
		class="cursor-pointer rounded p-1.5 transition-colors {view === 'list'
			? 'bg-gray-100'
			: 'hover:bg-muted'}"
		onclick={() => (view = 'list')}
		aria-label="List view"
	>
		<List class="h-4 w-4 text-gray-600" />
	</button>
	<button
		class="cursor-pointer rounded p-1.5 transition-colors {view === 'tile'
			? 'bg-gray-100'
			: 'hover:bg-muted'}"
		onclick={() => (view = 'tile')}
		aria-label="Tile view"
	>
		<LayoutGrid class="h-4 w-4 text-gray-600" />
	</button>
</div>
