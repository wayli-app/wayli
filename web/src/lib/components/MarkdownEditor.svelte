<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import {
		Bold,
		Italic,
		Heading,
		Link as LinkIcon,
		Eye,
		Pencil,
		ImagePlus,
		Loader2
	} from 'lucide-svelte';

	type Props = {
		value?: string;
		placeholder?: string;
		/**
		 * When provided, an image button appears: it hands the picked file to
		 * this handler (which uploads it) and inserts the returned markdown
		 * token at the cursor — photos inline in the text.
		 */
		onPickImage?: (file: File) => Promise<string>;
	};

	let {
		value = $bindable(''),
		placeholder = 'Write your story in markdown...',
		onPickImage
	}: Props = $props();

	let mode = $state<'edit' | 'preview'>('edit');
	let uploading = $state(false);
	let fileInput = $state<HTMLInputElement>();
	let textarea = $state<HTMLTextAreaElement>();

	function insert(before: string, after: string = '') {
		const el = textarea;
		if (!el) return;
		const start = el.selectionStart;
		const end = el.selectionEnd;
		const selected = value.slice(start, end);
		value = value.slice(0, start) + before + selected + after + value.slice(end);
		el.focus();
		// Place cursor after the inserted text
		el.selectionStart = el.selectionEnd = start + before.length + selected.length + after.length;
	}

	async function handleImageSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !onPickImage) return;
		uploading = true;
		try {
			const token = await onPickImage(file);
			insert(`\n\n${token}\n\n`);
		} catch (err) {
			console.error('Image upload failed:', err);
		} finally {
			uploading = false;
		}
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
			{#if onPickImage}
				<input
					bind:this={fileInput}
					type="file"
					accept="image/*"
					class="hidden"
					onchange={handleImageSelect}
				/>
				<button
					type="button"
					onclick={() => fileInput?.click()}
					disabled={uploading}
					class="hover:bg-muted rounded p-1.5 text-sm transition-colors disabled:opacity-50"
					title="Add photo in text"
				>
					{#if uploading}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<ImagePlus class="h-4 w-4" />
					{/if}
				</button>
			{/if}
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
			bind:this={textarea}
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
