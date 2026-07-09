<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { fluxbase } from '$lib/fluxbase';
	import { renderMarkdown } from '$lib/utils/markdown';
	import TripMap from '$lib/components/TripMap.svelte';
	import { ArrowLeft, Calendar, Route, MapPin, Globe, LogIn } from 'lucide-svelte';

	type SharedTrip = {
		trip: {
			id: string;
			title: string;
			description: string;
			start_date: string;
			end_date: string;
			image_url: string | null;
			metadata: Record<string, any>;
		};
		entries: Array<{
			id: string;
			title: string;
			body: string;
			entry_date: string;
		}>;
		media: Array<{
			id: string;
			storage_path: string;
			thumbnail_path: string | null;
			caption: string;
		}>;
		owner: {
			username: string;
			full_name: string | null;
			avatar_url: string | null;
		};
	};

	let data = $state<SharedTrip | null>(null);
	let gpsPoints = $state<Array<{ lat: number; lng: number }>>([]);
	let cityMarkers = $state<Array<{ lat: number; lng: number; label: string }>>([]);
	let isLoading = $state(true);
	let notFound = $state(false);
	let lightbox = $state<{ storage_path: string; caption: string } | null>(null);

	const token = $derived(page.params.token ?? '');

	onMount(async () => {
		try {
			const { data: result, error } = await fluxbase.rpc('get_shared_trip', {
				p_token: token
			});

			if (error || !result) {
				notFound = true;
				return;
			}

			data = result as unknown as SharedTrip;

			// Load GPS track (share_token grants access)
			const { data: trackData } = await fluxbase.rpc('get_public_trip_track', {
				trip_uuid: data.trip.id
			});
			if (trackData) {
				gpsPoints = (trackData as any[]).map((r) => ({ lat: r.lat, lng: r.lng }));
			}

			// City markers
			if (data.trip.metadata?.visitedCitiesDetailed) {
				cityMarkers = data.trip.metadata.visitedCitiesDetailed
					.filter((c: any) => c.lat && c.lng)
					.map((c: any) => ({ lat: c.lat, lng: c.lng, label: c.city || 'Unknown' }));
			}
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
{:else if notFound || !data}
	<div class="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-4">
		<Globe class="text-muted-foreground h-12 w-12 opacity-40" />
		<p class="text-muted-foreground text-lg">Trip not found.</p>
		<p class="text-muted-foreground text-sm">This share link may have been revoked.</p>
		<a href="/" class="text-primary hover:underline text-sm">← Home</a>
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

	<div class="mx-auto max-w-3xl space-y-6 p-4 pt-16">
		<!-- Owner link -->
		<a
			href="/u/{data.owner.username}"
			class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
		>
			<ArrowLeft class="h-4 w-4" />
			{data.owner.full_name ?? `@${data.owner.username}`}
		</a>

		<!-- Trip header -->
		<div class="bg-card border-border overflow-hidden rounded-2xl border">
			{#if data.trip.image_url}
				<img src={data.trip.image_url} alt={data.trip.title} class="h-48 w-full object-cover" />
			{/if}
			<div class="p-6">
				<h1 class="text-foreground mb-2 text-2xl font-bold">{data.trip.title}</h1>
				{#if data.trip.description}
					<p class="text-muted-foreground mb-3 text-sm leading-relaxed">{data.trip.description}</p>
				{/if}
				<div class="text-muted-foreground flex flex-wrap gap-4 text-sm">
					<span class="flex items-center gap-1.5">
						<Calendar class="h-4 w-4" />
						{formatDateRange(data.trip.start_date, data.trip.end_date)}
					</span>
					{#if data.trip.metadata?.primaryCity}
						<span class="flex items-center gap-1.5">
							<MapPin class="h-4 w-4" />
							{data.trip.metadata.primaryCity}
						</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Map -->
		{#if gpsPoints.length > 0 || cityMarkers.length > 0}
			<div class="bg-card border-border overflow-hidden rounded-2xl border p-4">
				<h2 class="text-foreground mb-3 flex items-center gap-2 text-sm font-semibold">
					<MapPin class="h-4 w-4" />
					Route
				</h2>
				<TripMap points={gpsPoints} markers={cityMarkers} class="h-72" />
			</div>
		{/if}

		<!-- Photos -->
		{#if data.media.length > 0}
			<div class="bg-card border-border rounded-2xl border p-4">
				<h2 class="text-foreground mb-3 text-lg font-semibold">Photos</h2>
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
					{#each data.media as item (item.id)}
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
		{#if data.entries.length > 0}
			<div>
				<h2 class="text-foreground mb-4 text-lg font-semibold">Journal</h2>
				<div class="space-y-4">
					{#each data.entries as entry (entry.id)}
						<article class="bg-card border-border rounded-2xl border p-5">
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
