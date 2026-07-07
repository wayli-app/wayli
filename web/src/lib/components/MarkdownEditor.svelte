<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import { Bold, Italic, Heading, Link as LinkIcon, Eye, Pencil } from 'lucide-svelte';

	type Props = {
		value?: string;
		placeholder?: string;
	};

	let { value = $bindable(''), placeholder = 'Write your story in markdown...' }: Props = $props();

	let mode = $state<'edit' | 'preview'>('edit');

	function insert(before: string, after: string = '') {
		const el = document.getElementById('markdown-editor-textarea') as HTMLTextAreaElement | null;
		if (!el) return;
		const start = el.selectionStart;
		const end = el.selectionEnd;
		const selected = value.slice(start, end);
		value = value.slice(0, start) + before + selected + after + value.slice(end);
		el.focus();
		// Place cursor after the inserted text
		el.selectionStart = el.selectionEnd = start + before.length + selected.length + after.length;
	}
</script>

<div class="border-border bg-card overflow-hidden rounded-lg border">
	<!-- Toolbar -->
	<div class="border-border flex items-center justify-between border-b px-3 py-2">
		<div class="flex gap-1">
			<button
				type="button"
				onclick={() => insert('**', '**')}
				class="hover:bg-muted rounded p-1.5 text-sm transition-colors"
				title="Bold"><Bold class="h-4 w-4" /></button
			>
			<button
				type="button"
				onclick={() => insert('*', '*')}
				class="hover:bg-muted rounded p-1.5 text-sm transition-colors"
				title="Italic"><Italic class="h-4 w-4" /></button
			>
			<button
				type="button"
				onclick={() => insert('## ')}
				class="hover:bg-muted rounded p-1.5 text-sm transition-colors"
				title="Heading"><Heading class="h-4 w-4" /></button
			>
			<button
				type="button"
				onclick={() => insert('[', '](https://)')}
				class="hover:bg-muted rounded p-1.5 text-sm transition-colors"
				title="Link"><LinkIcon class="h-4 w-4" /></button
			>
		</div>
		<button
			type="button"
			onclick={() => (mode = mode === 'edit' ? 'preview' : 'edit')}
			class="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors"
		>
			{#if mode === 'edit'}
				<Eye class="h-3.5 w-3.5" />
				Preview
			{:else}
				<Pencil class="h-3.5 w-3.5" />
				Edit
			{/if}
		</button>
	</div>

	<!-- Editor / Preview -->
	{#if mode === 'edit'}
		<textarea
			id="markdown-editor-textarea"
			bind:value
			{placeholder}
			rows="8"
			class="focus:ring-primary w-full resize-y bg-transparent px-4 py-3 font-mono text-sm leading-relaxed focus:ring-2 focus:outline-none"
		></textarea>
	{:else}
		<div class="prose prose-sm dark:prose-invert min-h-[12rem] max-w-none px-4 py-3">
			{#if value.trim()}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html renderMarkdown(value)}
			{:else}
				<p class="text-muted-foreground">Nothing to preview yet.</p>
			{/if}
		</div>
	{/if}
</div>
