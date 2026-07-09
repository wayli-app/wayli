<script lang="ts">
	import { onMount } from 'svelte';
	import { userStore } from '$lib/stores/auth';
	import { fluxbase } from '$lib/fluxbase';
	import {
		listAllEntries,
		createEntry,
		updateEntry,
		deleteEntry
	} from '$lib/services/trip-entry.service';
	import type { TripEntry } from '$lib/types/journal.types';
	import { renderMarkdown } from '$lib/utils/markdown';
	import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
	import PhotoGallery from '$lib/components/PhotoGallery.svelte';
	import {
		BookOpen,
		Plus,
		MapPin,
		Pencil,
		Trash2,
		Save,
		X,
		Loader2,
		ArrowRight,
		Calendar
	} from 'lucide-svelte';

	type JournalEntry = TripEntry & {
		trip_title: string;
		trip_start_date: string;
		trip_end_date: string;
		trip_image_url: string | null;
	};

	type TripOption = { id: string; title: string; start_date: string };

	let entries = $state<JournalEntry[]>([]);
	let trips = $state<TripOption[]>([]);
	let isLoading = $state(true);
	let searchQuery = $state('');

	const filteredEntries = $derived(
		searchQuery.trim()
			? entries.filter(
					(e) =>
						e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
						e.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
						e.trip_title.toLowerCase().includes(searchQuery.toLowerCase())
				)
			: entries
	);

	const ENTRIES_PER_PAGE = 20;
	let visibleCount = $state(ENTRIES_PER_PAGE);

	const visibleEntries = $derived(filteredEntries.slice(0, visibleCount));
	const hasMore = $derived(visibleCount < filteredEntries.length);

	// Inline editor state
	let showEditor = $state(false);
	let editingEntry = $state<JournalEntry | null>(null);
	let selectedTripId = $state('');
	let editorTitle = $state('');
	let editorBody = $state('');
	let editorDate = $state('');
	let isSaving = $state(false);

	onMount(async () => {
		await Promise.all([loadEntries(), loadTrips()]);
	});

	async function loadEntries() {
		isLoading = true;
		try {
			entries = await listAllEntries();
		} catch (err) {
			console.error('Failed to load journal entries:', err);
		} finally {
			isLoading = false;
		}
	}

	async function loadTrips() {
		try {
			const { data } = await fluxbase
				.from('trips')
				.select('id, title, start_date')
				.order('start_date', { ascending: false });
			trips = (data as unknown as TripOption[]) ?? [];
		} catch {
			// empty trips is fine
		}
	}

	function openNewEditor() {
		editingEntry = null;
		editorTitle = '';
		editorBody = '';
		editorDate = new Date().toISOString().slice(0, 10);
		selectedTripId = trips[0]?.id ?? '';
		showEditor = true;
	}

	function openEditEditor(entry: JournalEntry) {
		editingEntry = entry;
		editorTitle = entry.title;
		editorBody = entry.body;
		editorDate = entry.entry_date;
		selectedTripId = entry.trip_id;
		showEditor = true;
	}

	async function saveEntry() {
		if (!$userStore?.id || !selectedTripId || !editorDate) return;
		isSaving = true;
		try {
			if (editingEntry) {
				await updateEntry(editingEntry.id, {
					title: editorTitle,
					body: editorBody,
					entry_date: editorDate
				});
			} else {
				await createEntry($userStore.id, {
					trip_id: selectedTripId,
					title: editorTitle,
					body: editorBody,
					entry_date: editorDate
				});
			}
			showEditor = false;
			await loadEntries();
		} catch (err) {
			console.error('Failed to save entry:', err);
		} finally {
			isSaving = false;
		}
	}

	async function handleDelete(entry: JournalEntry) {
		if (!confirm('Delete this journal entry?')) return;
		try {
			await deleteEntry(entry.id);
			entries = entries.filter((e) => e.id !== entry.id);
		} catch (err) {
			console.error('Failed to delete entry:', err);
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString(undefined, {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	function formatShortDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="space-y-6">
	<!-- Page header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<BookOpen class="text-primary h-6 w-6" />
			<div>
				<h1 class="text-foreground text-xl font-bold">Journal</h1>
				<p class="text-muted-foreground text-sm">
					{filteredEntries.length}
					{filteredEntries.length === 1 ? 'entry' : 'entries'}
					{#if trips.length > 0}· {trips.length} {trips.length === 1 ? 'trip' : 'trips'}{/if}
				</p>
			</div>
		</div>
		<div class="flex items-center gap-2">
			{#if entries.length > 0}
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search..."
					class="border-border focus:ring-primary w-32 rounded-lg border bg-transparent px-3 py-1.5 text-sm focus:w-56 focus:ring-2 focus:outline-none transition-all"
				/>
			{/if}
			{#if !showEditor && trips.length > 0}
				<button
					type="button"
					onclick={openNewEditor}
					class="bg-primary hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground transition-colors"
				>
					<Plus class="h-4 w-4" />
					New Entry
				</button>
			{/if}
		</div>
	</div>

	<!-- Inline editor -->
	{#if showEditor}
		<div class="bg-card border-border space-y-3 rounded-xl border p-5">
			<div class="flex items-center justify-between">
				<h2 class="text-foreground text-lg font-semibold">
					{editingEntry ? 'Edit Entry' : 'New Journal Entry'}
				</h2>
				<button
					type="button"
					onclick={() => (showEditor = false)}
					class="text-muted-foreground hover:text-foreground rounded-lg p-1.5 transition-colors"
					aria-label="Close editor"><X class="h-5 w-5" /></button
				>
			</div>

			<div class="flex gap-3">
				<label class="flex flex-1 flex-col gap-1">
					<span class="text-muted-foreground text-xs font-medium">Trip</span>
					<select
						bind:value={selectedTripId}
						class="border-border focus:ring-primary rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
					>
						<option value="" disabled>Select a trip...</option>
						{#each trips as trip (trip.id)}
							<option value={trip.id}>{trip.title} ({formatShortDate(trip.start_date)})</option>
						{/each}
					</select>
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-muted-foreground text-xs font-medium">Date</span>
					<input
						type="date"
						bind:value={editorDate}
						class="border-border focus:ring-primary rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
					/>
				</label>
			</div>

			<input
				type="text"
				bind:value={editorTitle}
				placeholder="Entry title (optional)"
				class="border-border focus:ring-primary w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
			/>

			<MarkdownEditor bind:value={editorBody} />

			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (showEditor = false)}
					class="border-border text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={saveEntry}
					disabled={isSaving || !selectedTripId || !editorDate}
					class="bg-primary hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground transition-colors disabled:opacity-50"
				>
					{#if isSaving}
						<Loader2 class="h-4 w-4 animate-spin" />
						Saving...
					{:else}
						<Save class="h-4 w-4" />
						Save Entry
					{/if}
				</button>
			</div>
		</div>
	{/if}

	<!-- Journal feed -->
	{#if isLoading}
		<div class="flex items-center justify-center py-12">
			<div class="border-primary h-8 w-8 animate-spin rounded-full border-b-2"></div>
		</div>
	{:else if filteredEntries.length === 0 && !showEditor}
		<div class="bg-card border-border rounded-xl border p-16 text-center">
			<BookOpen class="text-muted-foreground mx-auto mb-4 h-12 w-12 opacity-40" />
			<h3 class="text-foreground mb-1 text-lg font-medium">No journal entries yet</h3>
			<p class="text-muted-foreground mb-4 text-sm">
				{trips.length > 0
					? 'Write your first story by clicking "New Entry".'
					: 'You need at least one trip before you can write journal entries.'}
			</p>
			{#if trips.length > 0}
				<button
					type="button"
					onclick={openNewEditor}
					class="bg-primary hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground transition-colors"
				>
					<Plus class="h-4 w-4" />
					Write your first entry
				</button>
			{/if}
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			{#each visibleEntries as entry (entry.id)}
				<article
					class="bg-card border-border group flex flex-col overflow-hidden rounded-2xl border transition-all duration-300 hover:shadow-lg"
				>
					<!-- Trip cover image banner -->
					{#if entry.trip_image_url}
						<div class="relative h-40 overflow-hidden">
							<img src={entry.trip_image_url} alt="" class="h-full w-full object-cover" />
							<div
								class="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent"
							></div>
							<a
								href="/dashboard/trips/{entry.trip_id}"
								class="text-foreground absolute bottom-2 left-3 inline-flex items-center gap-1.5 text-sm font-medium"
							>
								<MapPin class="text-primary h-3.5 w-3.5" />
								{entry.trip_title}
							</a>
						</div>
					{/if}

					<div class="flex flex-1 flex-col p-5">
						<!-- Date + actions -->
						<div class="mb-3 flex items-center justify-between gap-3">
							<div class="flex items-center gap-2">
								<div
									class="bg-primary/10 text-primary flex h-10 w-10 flex-col items-center justify-center rounded-lg text-[10px] font-bold uppercase leading-tight"
								>
									{new Date(entry.entry_date).toLocaleDateString(undefined, { month: 'short' })}
									<span class="text-base font-extrabold">
										{new Date(entry.entry_date).getDate()}
									</span>
								</div>
								<div>
									{#if !entry.trip_image_url}
										<a
											href="/dashboard/trips/{entry.trip_id}"
											class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium transition-colors"
										>
											<MapPin class="h-3 w-3" />
											{entry.trip_title}
										</a>
									{/if}
									<p class="text-muted-foreground flex items-center gap-1 text-xs">
										<Calendar class="h-3 w-3" />
										{new Date(entry.entry_date).toLocaleDateString(undefined, {
											month: 'short',
											day: 'numeric',
											year: 'numeric'
										})}
									</p>
								</div>
							</div>
							<div class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
								<button
									type="button"
									onclick={() => openEditEditor(entry)}
									class="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1.5 transition-colors"
									aria-label="Edit entry"><Pencil class="h-4 w-4" /></button
								>
								<button
									type="button"
									onclick={() => handleDelete(entry)}
									class="text-muted-foreground hover:text-destructive hover:bg-muted rounded p-1.5 transition-colors"
									aria-label="Delete entry"><Trash2 class="h-4 w-4" /></button
								>
							</div>
						</div>

						<!-- Title -->
						{#if entry.title}
							<h2 class="text-foreground mb-2 text-lg font-bold">{entry.title}</h2>
						{/if}

						<!-- Body -->
						{#if entry.body}
							<div
								class="prose prose-sm dark:prose-invert max-w-none flex-1 text-sm leading-relaxed"
							>
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html renderMarkdown(entry.body)}
							</div>
						{/if}

						<!-- Photos for this entry -->
						<div class="mt-3">
							<PhotoGallery tripId={entry.trip_id} entryId={entry.id} />
						</div>

						<!-- Footer -->
						<div class="border-border mt-4 flex items-center border-t pt-3">
							<a
								href="/dashboard/trips/{entry.trip_id}"
								class="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs font-medium transition-colors"
							>
								View trip details
								<ArrowRight class="h-3 w-3" />
							</a>
						</div>
					</div>
				</article>
			{/each}
		</div>

		<!-- Load more -->
		{#if hasMore}
			<div class="flex justify-center pt-2">
				<button
					type="button"
					onclick={() => (visibleCount += ENTRIES_PER_PAGE)}
					class="border-border text-foreground hover:bg-muted rounded-lg border px-6 py-2 text-sm font-medium transition-colors"
				>
					Load more entries
				</button>
			</div>
		{/if}
	{/if}
</div>
