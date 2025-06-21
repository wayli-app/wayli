<script lang="ts">
  import { cn } from '$lib/utils';

  export let className: string = '';
</script>

<div
  class={cn(
    'rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm',
    className
  )}
  {...$$restProps}
>
  <slot />
</div>