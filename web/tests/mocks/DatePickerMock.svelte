<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  export let isOpen: boolean = false;
  export let startDate: Date | null = null;
  export let endDate: Date | null = null;
  // accepted but unused in mock
  export const isRange: boolean = false;
  export const showPresets: boolean = false;
  export const presets: Array<{ label: string; startDate: Date; endDate: Date }> = [];
  const dispatch = createEventDispatcher();

  function close() {
    isOpen = false;
    dispatch('close');
  }

  function setRange(s: Date, e: Date) {
    startDate = s;
    endDate = e;
    dispatch('change');
    // Immediately close after selection to mimic real component behavior
    close();
  }
</script>

{#if isOpen}
  <div data-testid="datepicker">
    <button data-testid="setRange" onclick={() => setRange(new Date('2023-01-01'), new Date('2023-01-02'))}>set</button>
    <button data-testid="close" onclick={close}>close</button>
  </div>
{/if}


