<script lang="ts">
  import { LayoutGrid, List } from 'lucide-svelte';

  export let view: 'tile' | 'list';
</script>

<div class="flex gap-1 rounded-md border border-[rgb(218,218,221)] dark:border-[#23232a] bg-white dark:bg-[#23232a] p-1">
  <button
    class="rounded p-1.5 transition-colors cursor-pointer {view === 'list' ? 'bg-gray-100' : 'hover:bg-gray-50'}"
    on:click={() => view = 'list'}
    aria-label="List view"
  >
    <List class="h-4 w-4 text-gray-600" />
  </button>
  <button
    class="rounded p-1.5 transition-colors cursor-pointer {view === 'tile' ? 'bg-gray-100' : 'hover:bg-gray-50'}"
    on:click={() => view = 'tile'}
    aria-label="Tile view"
  >
    <LayoutGrid class="h-4 w-4 text-gray-600" />
  </button>
</div>