<script lang="ts">
  import { cn } from '$lib/utils';

  type BadgeVariants = {
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  };

  const badgeVariants = {
    variant: {
      default: 'bg-primary text-primary-foreground hover:bg-primary/80',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/80',
      outline: 'text-foreground'
    }
  } as const;

  export let variant: BadgeVariants['variant'] = 'default';
  export let className: string = '';

  $: variantClass = badgeVariants.variant[variant ?? 'default'];
</script>

<div
  class={cn(
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
    variantClass,
    className
  )}
  {...$$restProps}
>
  <slot />
</div>