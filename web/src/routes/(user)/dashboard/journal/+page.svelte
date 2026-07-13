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
	import EntryComments from '$lib/components/EntryComments.svelte';
	import EntryLikeButton from '$lib/components/EntryLikeButton.svelte';
	import TripMap from '$lib/components/TripMap.svelte';
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
		Calendar,
		ExternalLink
	} from 'lucide-svelte';

	type JournalEntry = TripEntry & {
		trip_title: string;
		trip_start_date: string;
		trip_end_date: string;
		trip_image_url: string | null;
	};

	type TripOption = { id: string; title: string; start_date: string; status?: string };
	type GpsPoint = { lat: number; lng: number; trip_id: string; date: string };

	let entries = $state<JournalEntry[]>([]);
	let trips = $state<TripOption[]>([]);
	let allGpsPoints = $state<GpsPoint[]>([]);
	let cityMarkers = $state<Array<{ lat: number; lng: number; label: string }>>([]);
	let isLoading = $state(true);
	let searchQuery = $state('');
	let publicJournalUrl = $state('');
	let activeEntryId = $state<string | null>(null);
	let selectedTripFilter = $state('');

	const filteredEntries = $derived(
		entries
			.filter((e) => !selectedTripFilter || e.trip_id === selectedTripFilter)
			.filter(
				(e) =>
					!searchQuery.trim() ||
					e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
					e.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
					e.trip_title.toLowerCase().includes(searchQuery.toLowerCase())
			)
	);

	const ENTRIES_PER_PAGE = 20;
	let visibleCount = $state(ENTRIES_PER_PAGE);
	const visibleEntries = $derived(filteredEntries.slice(0, visibleCount));
	const hasMore = $derived(visibleCount < filteredEntries.length);

	// Map points: all GPS points as lat/lng pairs
	const mapPoints = $derived(allGpsPoints.map((p) => ({ lat: p.lat, lng: p.lng })));

	// Highlighted points: GPS points for the active entry's date (or highlight window)
	const highlightPoints = $derived.by(() => {
		if (!activeEntryId) return [];
		const entry = entries.find((e) => e.id === activeEntryId);
		if (!entry) return [];

		let matched: GpsPoint[];

		// Use highlight_start/end if set, otherwise the full day
		if (entry.highlight_start && entry.highlight_end) {
			const start = new Date(entry.highlight_start).getTime();
			const end = new Date(entry.highlight_end).getTime();
			matched = allGpsPoints.filter((p) => {
				if (p.trip_id !== entry.trip_id) return false;
				const ts = new Date(p.date + 'T12:00:00Z').getTime();
				return ts >= start && ts <= end;
			});
		} else {
			matched = allGpsPoints.filter(
				(p) => p.trip_id === entry.trip_id && p.date === entry.entry_date
			);
		}

		return matched.map((p) => ({ lat: p.lat, lng: p.lng }));
	});

	// Inline editor state
	let showEditor = $state(false);
	let editingEntry = $state<JournalEntry | null>(null);
	let selectedTripId = $state('');
	let editorTitle = $state('');
	let editorBody = $state('');
	let editorDate = $state('');
	let editorHighlightStart = $state('');
	let editorHighlightEnd = $state('');
	let showHighlightEditor = $state(false);
	let isSaving = $state(false);

	let observer: IntersectionObserver | null = null;

	onMount(async () => {
		await Promise.all([loadEntries(), loadTrips(), loadPublicUrl(), loadGpsData()]);
		if (entries.length > 0) activeEntryId = entries[0].id;
		setTimeout(() => setupObserver(), 200);
	});

	function setupObserver() {
		if (observer) observer.disconnect();
		observer = new IntersectionObserver(
			(observed) => {
				for (const e of observed) {
					if (e.isIntersecting) {
						const id = (e.target as HTMLElement).dataset.entryId;
						if (id) activeEntryId = id;
					}
				}
			},
			{ rootMargin: '-30% 0px -50% 0px', threshold: 0 }
		);
		document.querySelectorAll('[data-entry-id]').forEach((el) => observer?.observe(el));
	}

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
				.select('id, title, start_date, end_date, status')
				.order('start_date', { ascending: false });
			trips = (data as unknown as TripOption[]) ?? [];
		} catch {
			// empty trips is fine
		}
	}

	async function loadGpsData() {
		try {
			const tripIds = [...new Set((await listAllEntries()).map((e) => e.trip_id))];
			if (tripIds.length === 0) return;

			const { data: userData } = await fluxbase.auth.getUser();
			const userId = userData?.user?.id;
			if (!userId) return;

			const results = await Promise.all(
				tripIds.map(async (tripId) => {
					const { data: tripRow } = await fluxbase
						.from<Record<string, any>>('trips')
						.select('start_date, end_date, metadata')
						.eq('id', tripId)
						.single();
					if (!tripRow) return { tripId, points: [] as GpsPoint[] };

					// Query tracker_data directly (owner's RLS grants access)
					const sd = (tripRow.start_date || '').slice(0, 10);
					const ed = (tripRow.end_date || '').slice(0, 10);
					const { data: trackRows, error: trackErr } = await fluxbase
						.from<Record<string, any>>('tracker_data')
						.select('location, recorded_at')
						.eq('user_id', userId)
						.gte('recorded_at', `${sd}T00:00:00Z`)
						.lte('recorded_at', `${ed}T23:59:59Z`)
						.order('recorded_at', { ascending: true })
						.limit(5000);

					if (trackErr) {
						console.error('[journal] tracker_data query error:', trackErr);
					}

					const raw = (trackRows as any[]) ?? [];
					if (raw.length === 0) return { tripId, points: [] as GpsPoint[] };

					// Downsample to max 200 points
					const stride = Math.max(1, Math.ceil(raw.length / 200));
					const points: GpsPoint[] = raw
						.filter((_, i) => i % stride === 0)
						.map((p) => {
							const loc = p.location;
							const lat = loc?.coordinates?.[1] ?? loc?.lat;
							const lng = loc?.coordinates?.[0] ?? loc?.lng;
							const date = p.recorded_at ? new Date(p.recorded_at).toISOString().slice(0, 10) : '';
							return { lat, lng, trip_id: tripId, date };
						})
						.filter((p) => p.lat != null && p.lng != null);

					// City markers from metadata
					if ((tripRow as any).metadata?.visitedCitiesDetailed) {
						for (const c of (tripRow as any).metadata.visitedCitiesDetailed) {
							if (c.lat && c.lng) {
								cityMarkers = [
									...cityMarkers,
									{ lat: c.lat, lng: c.lng, label: c.city || 'Unknown' }
								];
							}
						}
					}

					return { tripId, points };
				})
			);

			allGpsPoints = results.flatMap((r) => r.points);
		} catch (err) {
			console.error('Failed to load GPS data:', err);
		}
	}

	async function loadPublicUrl() {
		try {
			const { data: userData } = await fluxbase.auth.getUser();
			if (!userData?.user) return;
			const { data: profile } = await fluxbase
				.from('user_profiles')
				.select('username')
				.eq('id', userData.user.id)
				.single();
			if ((profile as any)?.username) {
				publicJournalUrl = `/u/${(profile as any).username}`;
			}
		} catch {
			// no username set yet
		}
	}

	function openNewEditor() {
		editingEntry = null;
		editorTitle = '';
		editorBody = '';
		editorDate = new Date().toISOString().slice(0, 10);
		editorHighlightStart = '';
		editorHighlightEnd = '';
		showHighlightEditor = false;
		selectedTripId = selectedTripFilter || trips[0]?.id || '';
		showEditor = true;
	}

	function openEditEditor(entry: JournalEntry) {
		editingEntry = entry;
		editorTitle = entry.title;
		editorBody = entry.body;
		editorDate = entry.entry_date;
		editorHighlightStart = entry.highlight_start?.slice(0, 16) ?? '';
		editorHighlightEnd = entry.highlight_end?.slice(0, 16) ?? '';
		showHighlightEditor = !!(entry.highlight_start || entry.highlight_end);
		selectedTripId = entry.trip_id;
		showEditor = true;
	}

	async function saveEntry() {
		if (!$userStore?.id || !selectedTripId || !editorDate) return;
		isSaving = true;
		try {
			const highlightStart = editorHighlightStart
				? new Date(editorHighlightStart).toISOString()
				: null;
			const highlightEnd = editorHighlightEnd ? new Date(editorHighlightEnd).toISOString() : null;

			if (editingEntry) {
				await updateEntry(editingEntry.id, {
					title: editorTitle,
					body: editorBody,
					entry_date: editorDate,
					highlight_start: highlightStart,
					highlight_end: highlightEnd
				});
			} else {
				await createEntry($userStore.id, {
					trip_id: selectedTripId,
					title: editorTitle,
					body: editorBody,
					entry_date: editorDate,
					highlight_start: highlightStart,
					highlight_end: highlightEnd
				});
			}
			showEditor = false;
			await loadEntries();
			await loadGpsData();
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

	// Re-setup observer when visible entries change
	$effect(() => {
		void visibleEntries;
		setTimeout(() => setupObserver(), 100);
	});
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
			{#if publicJournalUrl}
				<a
					href={publicJournalUrl}
					target="_blank"
					rel="noopener"
					class="border-border text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
				>
					<ExternalLink class="h-3.5 w-3.5" />
					Public journal
				</a>
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

	<!-- Trip filter bar -->
	{#if trips.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			<select
				bind:value={selectedTripFilter}
				class="border-border focus:ring-primary rounded-lg border bg-transparent px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
			>
				<option value="">All trips ({trips.length})</option>
				{#each trips as trip (trip.id)}
					<option value={trip.id}>{trip.title} ({formatShortDate(trip.start_date)})</option>
				{/each}
			</select>
			{#if entries.length > 0}
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search entries..."
					class="border-border focus:ring-primary w-40 rounded-lg border bg-transparent px-3 py-1.5 text-sm focus:w-56 focus:ring-2 focus:outline-none transition-all"
				/>
			{/if}
		</div>
	{/if}

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

			<!-- Optional map highlight -->
			<div class="border-border rounded-lg border p-3">
				<label class="flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						bind:checked={showHighlightEditor}
						class="h-4 w-4 rounded border-border"
					/>
					<span class="text-sm font-medium text-foreground">Narrow map highlight (optional)</span>
				</label>
				{#if showHighlightEditor}
					<div class="mt-3 flex gap-3">
						<label class="flex flex-1 flex-col gap-1">
							<span class="text-muted-foreground text-xs">From</span>
							<input
								type="datetime-local"
								bind:value={editorHighlightStart}
								class="border-border focus:ring-primary rounded-lg border bg-transparent px-3 py-1.5 text-xs focus:ring-2 focus:outline-none"
							/>
						</label>
						<label class="flex flex-1 flex-col gap-1">
							<span class="text-muted-foreground text-xs">To</span>
							<input
								type="datetime-local"
								bind:value={editorHighlightEnd}
								class="border-border focus:ring-primary rounded-lg border bg-transparent px-3 py-1.5 text-xs focus:ring-2 focus:outline-none"
							/>
						</label>
					</div>
					<p class="text-muted-foreground mt-2 text-xs">
						Leave empty to show the full day on the map.
					</p>
				{/if}
			</div>

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

	<!-- Split layout: entries + sticky map -->
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
		<div class="grid gap-6 lg:grid-cols-[1fr_400px]">
			<!-- Journal entries (scrollable, left on desktop) -->
			<div class="space-y-6">
				{#each visibleEntries as entry (entry.id)}
					<article
						data-entry-id={entry.id}
						onclick={() => (activeEntryId = entry.id)}
						class="bg-card border-border group flex flex-col overflow-hidden rounded-2xl border transition-all {activeEntryId ===
						entry.id
							? 'ring-primary/20 ring-2'
							: ''}"
					>
						{#if entry.trip_image_url}
							<div class="relative h-32 overflow-hidden">
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
									<a
										href="/dashboard/trips/{entry.trip_id}"
										class="text-muted-foreground hover:text-primary hover:bg-muted rounded p-1.5 transition-colors"
										aria-label="View trip details"
										title="View trip"><ExternalLink class="h-4 w-4" /></a
									>
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

							{#if entry.title}
								<h2 class="text-foreground mb-2 text-lg font-bold">{entry.title}</h2>
							{/if}

							{#if entry.body}
								<div
									class="prose prose-sm dark:prose-invert max-w-none flex-1 text-sm leading-relaxed"
								>
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html renderMarkdown(entry.body)}
								</div>
							{/if}

							<div class="mt-3">
								<PhotoGallery tripId={entry.trip_id} entryId={entry.id} />
							</div>

							<div class="border-border mt-4 flex items-start gap-3 border-t pt-3">
								<EntryLikeButton tripId={entry.trip_id} entryId={entry.id} />
								<div class="flex-1">
									<EntryComments tripId={entry.trip_id} entryId={entry.id} />
								</div>
							</div>
						</div>
					</article>
				{/each}

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
			</div>

			<!-- Sticky map (desktop only) -->
			<div class="hidden lg:block">
				<div class="sticky top-4 space-y-3">
					<div class="bg-card border-border overflow-hidden rounded-2xl border">
						<div class="border-border flex items-center gap-2 border-b px-4 py-2.5">
							<MapPin class="text-primary h-4 w-4" />
							<span class="text-foreground text-sm font-semibold">
								{#if activeEntryId}
									{entries.find((e) => e.id === activeEntryId)?.entry_date
										? new Date(
												entries.find((e) => e.id === activeEntryId)!.entry_date
											).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
										: 'Map'}
								{:else}
									Map
								{/if}
							</span>
							{#if highlightPoints.length > 0}
								<span class="text-muted-foreground ml-auto text-xs">
									{highlightPoints.length} points
								</span>
							{/if}
						</div>
						{#if mapPoints.length > 0 || cityMarkers.length > 0}
							<TripMap
								points={mapPoints}
								markers={cityMarkers}
								{highlightPoints}
								class="h-[400px]"
							/>
						{:else}
							<div
								class="flex h-64 items-center justify-center px-6 text-center text-sm text-muted-foreground"
							>
								No GPS data yet. Import location data to see your trips on the map.
							</div>
						{/if}
					</div>

					<!-- Entry navigation -->
					{#if entries.length > 1}
						<div class="bg-card border-border rounded-2xl border p-3">
							<div class="flex flex-wrap gap-1.5">
								{#each visibleEntries as entry, i (entry.id)}
									<button
										type="button"
										onclick={() => {
											activeEntryId = entry.id;
											document
												.querySelector(`[data-entry-id="${entry.id}"]`)
												?.scrollIntoView({ behavior: 'smooth', block: 'start' });
										}}
										class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors {activeEntryId ===
										entry.id
											? 'bg-primary text-primary-foreground'
											: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
									>
										{i + 1}
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Mobile map (below entries) -->
	{#if !isLoading && filteredEntries.length > 0 && (mapPoints.length > 0 || cityMarkers.length > 0)}
		<div class="bg-card border-border mt-4 overflow-hidden rounded-xl border p-3 lg:hidden">
			<div class="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
				<MapPin class="text-primary h-4 w-4" />
				{#if activeEntryId}
					Day {entries.findIndex((e) => e.id === activeEntryId) + 1}
				{:else}
					Map
				{/if}
			</div>
			<TripMap points={mapPoints} markers={cityMarkers} {highlightPoints} class="h-56" />
		</div>
	{/if}
</div>
