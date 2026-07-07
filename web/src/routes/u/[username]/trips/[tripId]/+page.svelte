<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fluxbase } from '$lib/fluxbase';
	import { readSetting } from '$lib/utils/settings';
	import { renderMarkdown } from '$lib/utils/markdown';
	import TripMap from '$lib/components/TripMap.svelte';
	import { ArrowLeft, Calendar, Route, MapPin } from 'lucide-svelte';

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
	let gpsPoints = $state<Array<{ lat: number; lng: number }>>([]);
	let cityMarkers = $state<Array<{ lat: number; lng: number; label: string }>>([]);
	let isLoading = $state(true);
	let notFound = $state(false);
	let lightbox = $state<Media | null>(null);

	const username = $derived(page.params.username ?? '');
	const tripId = $derived(page.params.tripId ?? '');

	onMount(async () => {
		// Check if public access requires auth
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
			// Load trip (must be public — RLS enforces)
			const { data: tripData } = await fluxbase.from('trips').select('*').eq('id', tripId).single();

			if (!tripData) {
				notFound = true;
				return;
			}
			trip = tripData as unknown as Trip;

			if (trip.visibility !== 'public') {
				notFound = true;
				return;
			}

			// Load entries (cascading public-read RLS)
			const { data: entryData } = await fluxbase
				.from('trip_entries')
				.select('id, title, body, entry_date')
				.eq('trip_id', tripId)
				.order('entry_date', { ascending: true });
			entries = (entryData as unknown as Entry[]) ?? [];

			// Load media (cascading public-read RLS)
			const { data: mediaData } = await fluxbase
				.from('trip_media')
				.select('id, storage_path, thumbnail_path, caption')
				.eq('trip_id', tripId)
				.order('sort_order', { ascending: true });
			media = (mediaData as unknown as Media[]) ?? [];

			// Load GPS track via the home-redacted RPC
			const { data: trackData } = await fluxbase.rpc('get_public_trip_track', {
				trip_uuid: tripId
			});
			if (trackData) {
				gpsPoints = (trackData as any[]).map((r) => ({ lat: r.lat, lng: r.lng }));
			}

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
		} catch {
			notFound = true;
		} finally {
			isLoading = false;
		}
	});

	function formatDateRange(start: string, end: string): string {
		const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
		return `${new Date(start).toLocaleDateString(undefined, opts)} – ${new Date(end).toLocaleDateString(undefined, opts)}`;
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (lightbox = null)} />

{#if isLoading}
	<div class="flex items-center justify-center py-20">
		<div class="border-primary h-8 w-8 animate-spin rounded-full border-b-2"></div>
	</div>
{:else if notFound || !trip}
	<div class="py-20 text-center">
		<p class="text-muted-foreground text-lg">Trip not found or not public.</p>
		<a href="/u/{username}" class="text-primary mt-4 inline-block hover:underline"
			>← Back to profile</a
		>
	</div>
{:else}
	<div class="mx-auto max-w-3xl space-y-6 p-4">
		<!-- Back link -->
		<a
			href="/u/{username}"
			class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
		>
			<ArrowLeft class="h-4 w-4" />
			@{username}
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
					{#if trip.metadata?.primaryCity}
						<span class="flex items-center gap-1.5">
							<MapPin class="h-4 w-4" />
							{trip.metadata.primaryCity}
						</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Map (polyline is home-redacted) -->
		{#if gpsPoints.length > 0 || cityMarkers.length > 0}
			<div class="bg-card border-border overflow-hidden rounded-xl border p-4">
				<h2 class="text-foreground mb-3 flex items-center gap-2 text-sm font-semibold">
					<MapPin class="h-4 w-4" />
					Route
				</h2>
				<TripMap points={gpsPoints} markers={cityMarkers} class="h-72" />
			</div>
		{/if}

		<!-- Photos -->
		{#if media.length > 0}
			<div class="bg-card border-border rounded-xl border p-4">
				<h2 class="text-foreground mb-3 text-lg font-semibold">Photos</h2>
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
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

		<!-- Journal entries (read-only) -->
		{#if entries.length > 0}
			<div>
				<h2 class="text-foreground mb-4 text-lg font-semibold">Journal</h2>
				<div class="space-y-6">
					{#each entries as entry (entry.id)}
						<article class="bg-card border-border rounded-lg border p-5">
							<div class="text-muted-foreground mb-2 text-xs font-medium">
								{new Date(entry.entry_date).toLocaleDateString(undefined, {
									weekday: 'long',
									year: 'numeric',
									month: 'long',
									day: 'numeric'
								})}
							</div>
							{#if entry.title}
								<h3 class="text-foreground mb-2 text-lg font-semibold">{entry.title}</h3>
							{/if}
							{#if entry.body}
								<div class="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html renderMarkdown(entry.body)}
								</div>
							{/if}
						</article>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}

<!-- Lightbox -->
{#if lightbox}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
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
