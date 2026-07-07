<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import { Pencil, Trash2, Calendar } from 'lucide-svelte';
	import type { TripEntry } from '$lib/types/journal.types';

	type Props = {
		entries: TripEntry[];
		canEdit?: boolean;
		onEdit?: (entry: TripEntry) => void;
		onDelete?: (entry: TripEntry) => void;
	};

	let { entries, canEdit = false, onEdit, onDelete }: Props = $props();
</script>

{#if entries.length === 0}
	<div class="text-muted-foreground py-8 text-center text-sm">
		No journal entries yet. Click "Add Entry" to start writing.
	</div>
{:else}
	<div class="space-y-6">
		{#each entries as entry (entry.id)}
			<article class="border-border bg-card relative rounded-lg border p-5 pl-6">
				<!-- Timeline dot + line -->
				<div class="bg-primary absolute top-5 left-0 h-3 w-3 -translate-x-1/2 rounded-full"></div>
				<div class="border-border absolute top-8 bottom-0 left-0 w-px -translate-x-1/2"></div>

				<!-- Header -->
				<div class="mb-3 flex items-start justify-between gap-3">
					<div>
						<div class="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
							<Calendar class="h-3.5 w-3.5" />
							{new Date(entry.entry_date).toLocaleDateString(undefined, {
								weekday: 'long',
								year: 'numeric',
								month: 'long',
								day: 'numeric'
							})}
						</div>
						{#if entry.title}
							<h3 class="text-foreground text-lg font-semibold">{entry.title}</h3>
						{/if}
					</div>
					{#if canEdit}
						<div class="flex gap-1">
							<button
								type="button"
								onclick={() => onEdit?.(entry)}
								class="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1.5 transition-colors"
								aria-label="Edit entry"><Pencil class="h-4 w-4" /></button
							>
							<button
								type="button"
								onclick={() => onDelete?.(entry)}
								class="text-muted-foreground hover:text-destructive hover:bg-muted rounded p-1.5 transition-colors"
								aria-label="Delete entry"><Trash2 class="h-4 w-4" /></button
							>
						</div>
					{/if}
				</div>

				<!-- Body -->
				{#if entry.body}
					<div class="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html renderMarkdown(entry.body)}
					</div>
				{/if}
			</article>
		{/each}
	</div>
{/if}
