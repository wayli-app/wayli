<script lang="ts">
	import type { Snippet } from 'svelte';
	import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-svelte';
	import { cn } from '$lib/utils';

	type Variant = 'error' | 'warning' | 'success' | 'info';

	type Props = {
		variant?: Variant;
		/** Optional bold title above the body. */
		title?: string;
		class?: string;
		children: Snippet;
	};

	let { variant = 'info', title, class: className = '', children }: Props = $props();

	const config: Record<Variant, { icon: typeof AlertCircle; classes: string }> = {
		error: {
			icon: AlertCircle,
			classes: 'text-destructive bg-destructive/10 border-destructive/30'
		},
		warning: { icon: AlertTriangle, classes: 'text-warning bg-warning/10 border-warning/30' },
		success: { icon: CheckCircle2, classes: 'text-success bg-success/10 border-success/30' },
		info: { icon: Info, classes: 'text-info bg-info/10 border-info/30' }
	};

	const Icon = $derived(config[variant].icon);
</script>

<div
	role="alert"
	class={cn('flex gap-3 rounded-lg border p-3 text-sm', config[variant].classes, className)}
>
	<Icon class="h-5 w-5 flex-shrink-0" aria-hidden="true" />
	<div class="flex-1">
		{#if title}<p class="font-medium">{title}</p>{/if}
		<div class={title ? 'mt-0.5' : ''}>
			{@render children()}
		</div>
	</div>
</div>
