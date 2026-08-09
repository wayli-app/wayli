<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Upload, Loader2 } from 'lucide-svelte';
	import { fade } from 'svelte/transition';
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
</script>

{#if activeUploads.length > 0}
	<div
		class="flex items-center gap-2.5 px-3"
		transition:fade={{ duration: 200 }}
		role="status"
		aria-live="polite"
	>
		<!-- Icon -->
		<div class="text-primary shrink-0">
			{#if isProcessing}
				<Loader2 class="h-4 w-4 animate-spin" />
			{:else}
				<Upload class="h-4 w-4" />
			{/if}
		</div>

		<!-- Filename + horizontal progress bar -->
		<div class="flex min-w-0 flex-col gap-1" style="width: 160px;">
			<div class="flex items-center justify-between gap-2">
				<span class="text-muted-foreground truncate text-xs font-medium">
					{#if activeUploads.length === 1}
						{activeUploads[0].fileName}
					{:else}
						{activeUploads.length} files
					{/if}
				</span>
				<span class="text-muted-foreground shrink-0 text-xs font-medium tabular-nums">
					{#if isProcessing}
						…
					{:else}
						{overallPct}%
					{/if}
				</span>
			</div>
			<div class="bg-muted h-1.5 w-full overflow-hidden rounded-full">
				<div
					class="bg-primary h-full rounded-full transition-all duration-300"
					style="width: {isProcessing ? 100 : overallPct}%"
				></div>
			</div>
		</div>
	</div>
{/if}
