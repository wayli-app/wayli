<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fluxbase } from '$lib/fluxbase';
	import { readSetting } from '$lib/utils/settings';
	import { renderMarkdown } from '$lib/utils/markdown';
	import TripMap from '$lib/components/TripMap.svelte';
	import EntryComments from '$lib/components/EntryComments.svelte';
	import EntryLikeButton from '$lib/components/EntryLikeButton.svelte';
	import { fetchTrackPoints } from '$lib/services/gps.service';
	import { ArrowLeft, Calendar, Route, MapPin, Globe, Compass, LogIn } from 'lucide-svelte';

	type Trip = {
		id: string;
		title: string;
		description: string | null;
		start_date: string;
		end_date: string;
		image_url: string | null;
		metadata: Record<string, any> | null;
		visibility: string;
	};

	type Entry = {
		id: string;
		title: string;
		body: string;
		entry_date: string;
	};

	type Media = {
		id: string;
		storage_path: string;
		thumbnail_path: string | null;
		caption: string;
	};

	let trip = $state<Trip | null>(null);
	let entries = $state<Entry[]>([]);
	let media = $state<Media[]>([]);
	let allGpsPoints = $state<Array<{ lat: number; lng: number; date: string }>>([]);
	let cityMarkers = $state<Array<{ lat: number; lng: number; label: string }>>([]);
	let isLoading = $state(true);
	let notFound = $state(false);
	let lightbox = $state<Media | null>(null);
	let activeEntryId = $state<string | null>(null);

	const username = $derived(page.params.username ?? '');
	const tripId = $derived(page.params.tripId ?? '');

	// GPS points for the active entry's date (or all if none active)
	const mapPoints = $derived(allGpsPoints.map((p) => ({ lat: p.lat, lng: p.lng })));

	const highlightPoints = $derived.by(() => {
		if (!activeEntryId) return [];
		const entry = entries.find((e) => e.id === activeEntryId);
		if (!entry) return [];
		const entryDay = (entry.entry_date || '').slice(0, 10);
		return allGpsPoints.filter((p) => p.date === entryDay).map((p) => ({ lat: p.lat, lng: p.lng }));
	});

	let entryElements = $state<Map<string, HTMLElement>>(new Map());
	let observer: IntersectionObserver | null = null;

	function setupScrollObserver() {
		if (observer) observer.disconnect();
		observer = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) {
						const id = (e.target as HTMLElement).dataset.entryId;
						if (id) activeEntryId = id;
					}
				}
			},
			{ rootMargin: '-30% 0px -50% 0px', threshold: 0 }
		);
		entryElements.forEach((el) => observer?.observe(el));
	}

	function registerEntryElement(id: string, el: HTMLElement) {
		entryElements.set(id, el);
	}

	onMount(async () => {
		const requireAuth = await readSetting(() =>
			fluxbase.settings.get('wayli.public_trips_require_auth')
		);
		if (requireAuth?.value === true || requireAuth?.value === 'true') {
			try {
				const { data } = await fluxbase.auth.getUser();
				if (!data?.user) {
					goto(`/auth/signin?redirectTo=/u/${username}/trips/${tripId}`);
					return;
				}
			} catch {
				goto(`/auth/signin?redirectTo=/u/${username}/trips/${tripId}`);
				return;
			}
		}

		try {
			let currentUserId: string | null = null;
			try {
				const { data: authData } = await fluxbase.auth.getUser();
				currentUserId = authData?.user?.id ?? null;
			} catch {
				// Not logged in
			}

			const { data: tripData } = await fluxbase.from('trips').select('*').eq('id', tripId).single();
			if (!tripData) {
				notFound = true;
				return;
			}
			trip = tripData as unknown as Trip;

			// Reject only if not public AND not the owner
			if (trip.visibility !== 'public' && (trip as any).user_id !== currentUserId) {
				notFound = true;
				return;
			}

			const { data: entryData } = await fluxbase
				.from('trip_entries')
				.select('id, title, body, entry_date')
				.eq('trip_id', tripId)
				.order('entry_date', { ascending: true });
			entries = (entryData as unknown as Entry[]) ?? [];

			const { data: mediaData } = await fluxbase
				.from('trip_media')
				.select('id, storage_path, thumbnail_path, caption')
				.eq('trip_id', tripId)
				.order('sort_order', { ascending: true });
			media = (mediaData as unknown as Media[]) ?? [];

			// Load GPS track — paginated fetch (API caps at 1000 rows per request)
			try {
				const { data: authData } = await fluxbase.auth.getUser();
				const viewerId = authData?.user?.id;
				if (viewerId && trip) {
					allGpsPoints = await fetchTrackPoints(viewerId, trip.start_date, trip.end_date, 500);
				}
			} catch {
				// Not logged in — city markers still show
			}

			if (trip?.metadata?.visitedCitiesDetailed) {
				cityMarkers = trip.metadata.visitedCitiesDetailed
					.filter((c: any) => c.lat && c.lng)
					.map((c: any) => ({ lat: c.lat, lng: c.lng, label: c.city || 'Unknown' }));
			}

			// Set initial active entry
			if (entries.length > 0) activeEntryId = entries[0].id;

			// Setup scroll observer after DOM renders
			setTimeout(() => setupScrollObserver(), 100);
		} catch {
			notFound = true;
		} finally {
			isLoading = false;
		}
	});

	function formatDateRange(start: string, end: string): string {
		const opts: Intl.DateTimeFormatOptions = {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		};
		return `${new Date(start).toLocaleDateString(undefined, opts)} – ${new Date(end).toLocaleDateString(undefined, opts)}`;
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (lightbox = null)} />

{#if isLoading}
	<div class="flex min-h-screen items-center justify-center bg-background">
		<div class="border-primary h-10 w-10 animate-spin rounded-full border-2"></div>
	</div>
{:else if notFound || !trip}
	<div class="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-4">
		<Compass class="text-muted-foreground h-12 w-12 opacity-40" />
		<p class="text-muted-foreground text-lg">Trip not found or not public.</p>
		<a href="/u/{username}" class="text-primary hover:underline text-sm">← Back to profile</a>
	</div>
{:else}
	<!-- Top bar -->
	<div class="fixed top-0 right-0 z-50 p-4">
		<a
			href="/auth/signin"
			class="bg-primary hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-colors"
		>
			<LogIn class="h-4 w-4" />
			Sign in
		</a>
	</div>

	<div class="mx-auto max-w-7xl px-4 pt-16">
		<!-- Back link -->
		<a
			href="/u/{username}"
			class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
		>
			<ArrowLeft class="h-4 w-4" />
			@{username}
		</a>

		<!-- Trip header -->
		<div class="bg-card border-border mt-2 overflow-hidden rounded-2xl border">
			{#if trip.image_url}
				<img src={trip.image_url} alt={trip.title} class="h-40 w-full object-cover sm:h-56" />
			{/if}
			<div class="p-6">
				<h1 class="text-foreground mb-2 text-2xl font-bold sm:text-3xl">{trip.title}</h1>
				{#if trip.description}
					<p class="text-muted-foreground mb-3 text-sm leading-relaxed">{trip.description}</p>
				{/if}
				<div class="text-muted-foreground flex flex-wrap gap-4 text-sm">
					<span class="flex items-center gap-1.5">
						<Calendar class="h-4 w-4" />
						{formatDateRange(trip.start_date, trip.end_date)}
					</span>
					{#if trip.metadata?.primaryCity}
						<span class="flex items-center gap-1.5">
							<MapPin class="h-4 w-4" />
							{trip.metadata.primaryCity}
						</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Split layout: sticky map + scrollable feed -->
		<div class="mt-6 grid gap-6 lg:grid-cols-[1fr_400px]">
			<!-- Journal feed (scrollable, left on desktop / full on mobile) -->
			<div class="space-y-6">
				<!-- Photos (above entries) -->
				{#if media.length > 0}
					<div class="bg-card border-border rounded-2xl border p-4">
						<h2 class="text-foreground mb-3 text-lg font-semibold">Photos</h2>
						<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
							{#each media as item (item.id)}
								<button
									type="button"
									onclick={() => (lightbox = item)}
									class="aspect-square overflow-hidden rounded-lg"
									aria-label="View photo"
								>
									<img
										src={item.thumbnail_path ?? item.storage_path}
										alt={item.caption || 'Photo'}
										class="h-full w-full object-cover transition-transform hover:scale-105"
										loading="lazy"
									/>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Journal entries -->
				{#if entries.length > 0}
					{#each entries as entry (entry.id)}
						<article
							data-entry-id={entry.id}
							onclick={() => (activeEntryId = entry.id)}
							class="bg-card border-border scroll-mt-4 rounded-2xl border p-6 transition-shadow cursor-pointer {activeEntryId ===
							entry.id
								? 'ring-primary/20 ring-2'
								: ''}"
						>
							<div class="text-muted-foreground mb-3 flex items-center gap-2 text-xs font-medium">
								<div
									class="bg-primary/10 text-primary flex h-9 w-9 flex-col items-center justify-center rounded-lg text-[10px] font-bold uppercase leading-tight"
								>
									{new Date(entry.entry_date).toLocaleDateString(undefined, { month: 'short' })}
									<span class="text-sm font-extrabold">
										{new Date(entry.entry_date).getDate()}
									</span>
								</div>
								{new Date(entry.entry_date).toLocaleDateString(undefined, {
									weekday: 'long',
									year: 'numeric',
									month: 'long',
									day: 'numeric'
								})}
							</div>
							{#if entry.title}
								<h3 class="text-foreground mb-2 text-xl font-bold">{entry.title}</h3>
							{/if}
							{#if entry.body}
								<div class="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html renderMarkdown(entry.body)}
								</div>
							{/if}

							<!-- Per-entry engagement -->
							<div class="border-border mt-4 flex items-start gap-3 border-t pt-3">
								<EntryLikeButton {tripId} entryId={entry.id} />
								<div class="flex-1">
									<EntryComments {tripId} entryId={entry.id} />
								</div>
							</div>
						</article>
					{/each}
				{:else}
					<div class="bg-card border-border rounded-2xl border p-12 text-center">
						<MapPin class="text-muted-foreground mx-auto mb-3 h-10 w-10 opacity-40" />
						<p class="text-muted-foreground text-sm">No journal entries for this trip.</p>
					</div>
				{/if}
			</div>

			<!-- Sticky map (right sidebar on desktop, hidden on mobile) -->
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
										: 'Route'}
								{:else}
									Route
								{/if}
							</span>
							{#if activeEntryId}
								<span class="text-muted-foreground ml-auto text-xs">
									{highlightPoints.length} points
								</span>
							{/if}
						</div>
						<TripMap points={mapPoints} markers={cityMarkers} {highlightPoints} class="h-[400px]" />
					</div>

					<!-- Mini entry navigation -->
					{#if entries.length > 1}
						<div class="bg-card border-border rounded-2xl border p-3">
							<div class="flex flex-wrap gap-1.5">
								{#each entries as entry, i (entry.id)}
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
	</div>
{/if}

<!-- Mobile map (below header, collapsible) -->
{#if !isLoading && !notFound && trip && (allGpsPoints.length > 0 || cityMarkers.length > 0)}
	<div class="bg-card border-border mt-4 overflow-hidden rounded-xl border p-3 lg:hidden">
		<div class="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
			<MapPin class="text-primary h-4 w-4" />
			{#if activeEntryId}
				Day {entries.findIndex((e) => e.id === activeEntryId) + 1}
			{:else}
				Route
			{/if}
		</div>
		<TripMap points={mapPoints} markers={cityMarkers} {highlightPoints} class="h-56" />
	</div>
{/if}

<!-- Lightbox -->
{#if lightbox}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
		onclick={() => (lightbox = null)}
		role="presentation"
	>
		<img
			src={lightbox.storage_path}
			alt={lightbox.caption || 'Photo'}
			class="max-h-[85vh] max-w-full rounded-lg object-contain"
			role="presentation"
		/>
	</div>
{/if}
