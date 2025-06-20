<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  export let image: string;
  export let title: string;
  export let date: string;
  export let lat: number;
  export let lng: number;
</script>

<div
  class="group relative overflow-hidden rounded-xl border border-gray-200 dark:border-[#23232a] bg-white dark:bg-[#23232a] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
  on:mouseenter={() => dispatch('mouseenter', { lat, lng })}
  on:mouseleave={() => dispatch('mouseleave')}
  role="button"
  tabindex="0"
  aria-label={title}
>
  <div class="aspect-[4/3] overflow-hidden">
    <img
      src={image}
      alt={title}
      class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
    />
  </div>
  <div class="p-4">
    <h3 class="font-medium text-gray-900 dark:text-gray-100">{title}</h3>
    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{date}</p>
  </div>
</div>