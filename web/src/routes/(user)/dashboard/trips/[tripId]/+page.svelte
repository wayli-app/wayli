<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fluxbase } from '$lib/fluxbase';
	import { userStore } from '$lib/stores/auth';
	import {
		listEntries,
		createEntry,
		updateEntry,
		deleteEntry
	} from '$lib/services/trip-entry.service';
	import type { TripEntry } from '$lib/types/journal.types';
	import TripMap from '$lib/components/TripMap.svelte';
	import TripTimeline from '$lib/components/TripTimeline.svelte';
	import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
	import PhotoGallery from '$lib/components/PhotoGallery.svelte';
	import { ArrowLeft, Plus, MapPin, Calendar, Route, Save, X } from 'lucide-svelte';

	type Trip = {
		id: string;
		title: string;
		description: string;
		start_date: string;
		end_date: string;
		image_url: string;
		metadata: Record<string, any>;
		status: string;
		visibility: string;
	};

	let trip = $state<Trip | null>(null);
	let entries = $state<TripEntry[]>([]);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);

	// Map data
	let gpsPoints = $state<Array<{ lat: number; lng: number }>>([]);
	let cityMarkers = $state<Array<{ lat: number; lng: number; label: string }>>([]);

	// Entry editor state
	let showEditor = $state(false);
	let editingEntry = $state<TripEntry | null>(null);
	let editorTitle = $state('');
	let editorBody = $state('');
	let editorDate = $state('');
	let isSaving = $state(false);

	const tripId = $derived(page.params.tripId ?? '');

	onMount(async () => {
		await loadTrip();
	});

	async function loadTrip() {
		isLoading = true;
		loadError = null;
		try {
			// Load trip details (RLS ensures owner-only)
			const { data: tripData, error: tripErr } = await fluxbase
				.from('trips')
				.select('*')
				.eq('id', tripId)
				.single();

			if (tripErr || !tripData) {
				loadError = 'Trip not found.';
				return;
			}
			trip = tripData as unknown as Trip;

			// Load journal entries
			entries = await listEntries(tripId);

			// Load GPS data for the map (scoped to trip date range)
			await loadGpsData();

			// Build city markers from metadata
			if (trip?.metadata?.visitedCitiesDetailed) {
				cityMarkers = trip.metadata.visitedCitiesDetailed
					.filter((c: any) => c.lat && c.lng)
					.map((c: any) => ({
						lat: c.lat,
						lng: c.lng,
						label: c.city || 'Unknown'
					}));
			}
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load trip.';
		} finally {
			isLoading = false;
		}
	}

	async function loadGpsData() {
		if (!trip) return;
		try {
			const { data } = await fluxbase
				.from('tracker_data')
				.select('location')
				.gte('recorded_at', `${trip.start_date}T00:00:00Z`)
				.lte('recorded_at', `${trip.end_date}T23:59:59Z`)
				.order('recorded_at', { ascending: true })
				.limit(5000);

			if (data) {
				gpsPoints = (data as any[])
					.map((row) => {
						const loc = row.location;
						// PostGIS GeoJSON: { type: 'Point', coordinates: [lng, lat] }
						if (loc?.coordinates && Array.isArray(loc.coordinates)) {
							return { lat: loc.coordinates[1], lng: loc.coordinates[0] };
						}
						return null;
					})
					.filter((p): p is { lat: number; lng: number } => p !== null);
			}
		} catch {
			// GPS data is optional — no track shown if unavailable
		}
	}

	function openNewEditor() {
		editingEntry = null;
		editorTitle = '';
		editorBody = '';
		editorDate =
			trip?.start_date ??
			new Date().toISOString().slice(0, 10) ??
			new Date().toISOString().slice(0, 10);
		showEditor = true;
	}

	function openEditEditor(entry: TripEntry) {
		editingEntry = entry;
		editorTitle = entry.title;
		editorBody = entry.body;
		editorDate = entry.entry_date;
		showEditor = true;
	}

	async function saveEntry() {
		if (!$userStore?.id) return;
		isSaving = true;
		try {
			if (editingEntry) {
				const updated = await updateEntry(editingEntry.id, {
					title: editorTitle,
					body: editorBody,
					entry_date: editorDate
				});
				entries = entries.map((e) => (e.id === updated.id ? updated : e));
			} else {
				const created = await createEntry($userStore!.id, {
					trip_id: tripId,
					title: editorTitle,
					body: editorBody,
					entry_date: editorDate
				});
				entries = [...entries, created].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
			}
			showEditor = false;
		} catch (err) {
			console.error('Failed to save entry:', err);
		} finally {
			isSaving = false;
		}
	}

	async function handleDeleteEntry(entry: TripEntry) {
		if (!confirm('Delete this entry?')) return;
		try {
			await deleteEntry(entry.id);
			entries = entries.filter((e) => e.id !== entry.id);
		} catch (err) {
			console.error('Failed to delete entry:', err);
		}
	}

	function formatDateRange(start: string, end: string): string {
		const s = new Date(start);
		const e = new Date(end);
		const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
		return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
	}

	function tripDuration(): number {
		if (!trip) return 0;
		const days = Math.ceil(
			(new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000
		);
		return Math.max(1, days + 1);
	}
</script>

{#if isLoading}
	<div class="flex items-center justify-center py-20">
		<div class="border-primary h-8 w-8 animate-spin rounded-full border-b-2"></div>
	</div>
{:else if loadError}
	<div class="py-20 text-center">
		<p class="text-muted-foreground mb-4">{loadError}</p>
		<a href="/dashboard/trips" class="text-primary hover:underline">← Back to trips</a>
	</div>
{:else if trip}
	<div class="mx-auto max-w-3xl space-y-6">
		<!-- Back link -->
		<a
			href="/dashboard/trips"
			class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
		>
			<ArrowLeft class="h-4 w-4" />
			All trips
		</a>

		<!-- Trip header -->
		<div class="bg-card border-border overflow-hidden rounded-xl border">
			{#if trip.image_url}
				<img src={trip.image_url} alt={trip.title} class="h-48 w-full object-cover" />
			{/if}
			<div class="p-6">
				<h1 class="text-foreground mb-2 text-2xl font-bold">{trip.title}</h1>
				{#if trip.description}
					<p class="text-muted-foreground mb-3 text-sm leading-relaxed">{trip.description}</p>
				{/if}
				<div class="text-muted-foreground flex flex-wrap gap-4 text-sm">
					<span class="flex items-center gap-1.5">
						<Calendar class="h-4 w-4" />
						{formatDateRange(trip.start_date, trip.end_date)}
					</span>
					<span class="flex items-center gap-1.5">
						<Route class="h-4 w-4" />
						{tripDuration()} days
					</span>
					{#if trip.metadata?.primaryCity}
						<span class="flex items-center gap-1.5">
							<MapPin class="h-4 w-4" />
							{trip.metadata.primaryCity}
						</span>
					{/if}
					{#if trip.metadata?.distanceTraveled}
						<span>{Math.round(trip.metadata.distanceTraveled).toLocaleString()} km</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Map -->
		{#if gpsPoints.length > 0 || cityMarkers.length > 0}
			<div class="bg-card border-border overflow-hidden rounded-xl border p-4">
				<h2 class="text-foreground mb-3 flex items-center gap-2 text-sm font-semibold">
					<MapPin class="h-4 w-4" />
					Map
				</h2>
				<TripMap points={gpsPoints} markers={cityMarkers} class="h-72" />
			</div>
		{/if}

		<!-- Photos -->
		<div class="bg-card border-border rounded-xl border p-4">
			<h2 class="text-foreground mb-3 text-lg font-semibold">Photos</h2>
			<PhotoGallery {tripId} />
		</div>

		<!-- Journal entries -->
		<div>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-foreground text-lg font-semibold">Journal</h2>
				{#if !showEditor}
					<button
						type="button"
						onclick={openNewEditor}
						class="bg-primary hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors"
					>
						<Plus class="h-4 w-4" />
						Add Entry
					</button>
				{/if}
			</div>

			{#if showEditor}
				<div class="bg-card border-border mb-4 space-y-3 rounded-xl border p-4">
					<div class="flex gap-3">
						<input
							type="text"
							bind:value={editorTitle}
							placeholder="Entry title (optional)"
							class="border-border focus:ring-primary flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
						/>
						<input
							type="date"
							bind:value={editorDate}
							class="border-border focus:ring-primary rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
						/>
					</div>
					<MarkdownEditor bind:value={editorBody} />
					<div class="flex justify-end gap-2">
						<button
							type="button"
							onclick={() => (showEditor = false)}
							class="border-border text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
						>
							<span class="inline-flex items-center gap-1.5"><X class="h-4 w-4" /> Cancel</span>
						</button>
						<button
							type="button"
							onclick={saveEntry}
							disabled={isSaving || !editorDate}
							class="bg-primary hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground transition-colors disabled:opacity-50"
						>
							<Save class="h-4 w-4" />
							{isSaving ? 'Saving...' : 'Save Entry'}
						</button>
					</div>
				</div>
			{/if}

			<TripTimeline {entries} canEdit={true} onEdit={openEditEditor} onDelete={handleDeleteEntry} />
		</div>
	</div>
{/if}
