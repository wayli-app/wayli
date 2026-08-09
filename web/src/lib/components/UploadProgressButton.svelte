<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Upload, Loader2 } from 'lucide-svelte';
	import { translate } from '$lib/i18n';
	import { subscribe, type UploadProgress } from '$lib/stores/upload-store';

	let t = $derived($translate);

	let uploadsMap = $state<Map<string, UploadProgress>>(new Map());
	let unsub: (() => void) | null = null;

	const activeUploads = $derived(
		Array.from(uploadsMap.values())
			.filter((u) => u.status === 'uploading' || u.status === 'processing')
			.sort((a, b) => b.percentage - a.percentage)
	);

	// For multiple concurrent uploads, show the average progress.
	const overallPct = $derived(
		activeUploads.length === 0
			? 0
			: Math.round(activeUploads.reduce((sum, u) => sum + u.percentage, 0) / activeUploads.length)
	);
	const isProcessing = $derived(activeUploads.some((u) => u.status === 'processing'));

	onMount(() => {
		unsub = subscribe((map) => {
			uploadsMap = new Map(map);
		});
	});

	onDestroy(() => {
		if (!browser) return;
		unsub?.();
	});

	// Circle progress geometry.
	const RADIUS = 9;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
	let dashOffset = $derived(CIRCUMFERENCE * (1 - overallPct / 100));
</script>

{#if activeUploads.length > 0}
	<div class="relative flex min-h-[44px] min-w-[44px] items-center justify-center p-1">
		<div class="relative flex items-center justify-center">
			{#if isProcessing}
				<!-- Processing phase: indeterminate spinner -->
				<Loader2 class="text-primary h-5 w-5 animate-spin" />
			{:else}
				<!-- Upload phase: circular progress ring -->
				<svg class="h-6 w-6 -rotate-90" viewBox="0 0 24 24">
					<circle
						cx="12"
						cy="12"
						r={RADIUS}
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						class="text-muted/40"
					/>
					<circle
						cx="12"
						cy="12"
						r={RADIUS}
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						class="text-primary transition-all duration-300"
						stroke-dasharray={CIRCUMFERENCE}
						stroke-dashoffset={dashOffset}
					/>
				</svg>
			{/if}
			<Upload
				class="text-primary absolute h-3 w-3"
				style={isProcessing ? '' : 'transform: rotate(0deg);'}
			/>
		</div>
		<!-- Percentage label or count badge -->
		<span
			class="text-muted-foreground absolute -right-0.5 -bottom-0.5 text-[9px] leading-none font-bold tabular-nums"
		>
			{#if activeUploads.length > 1}
				{activeUploads.length}
			{:else if !isProcessing}
				{overallPct}%
			{/if}
		</span>
	</div>

	<!-- Tooltip with file details on hover -->
	{#if activeUploads.length === 1}
		<div
			class="bg-popover text-popover-foreground pointer-events-none absolute top-full right-0 z-50 mt-1 hidden max-w-[220px] rounded-lg border p-2 text-xs shadow-lg group-hover:block"
		>
			<p class="truncate font-medium">{activeUploads[0].fileName}</p>
			<p class="text-muted-foreground">
				{isProcessing
					? t('notifications.processingUpload')
					: t('notifications.uploading', { percent: Math.round(overallPct) })}
			</p>
		</div>
	{:else}
		<div
			class="bg-popover text-popover-foreground pointer-events-none absolute top-full right-0 z-50 mt-1 hidden max-w-[220px] rounded-lg border p-2 text-xs shadow-lg group-hover:block"
		>
			<p class="font-medium">{activeUploads.length} uploads</p>
			<p class="text-muted-foreground">
				{isProcessing
					? t('notifications.processingUpload')
					: t('notifications.uploading', { percent: Math.round(overallPct) })}
			</p>
		</div>
	{/if}
{/if}

<style>
	/* The tooltip needs a group wrapper to show on hover. */
	.group {
		position: relative;
	}
	.group:hover > div {
		display: block;
	}
</style>
