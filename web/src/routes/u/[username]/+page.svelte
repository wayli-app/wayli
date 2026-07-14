<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fluxbase } from '$lib/fluxbase';
	import { readSetting } from '$lib/utils/settings';
	import { userStore } from '$lib/stores/auth';
	import { MapPin, Calendar, Route, Globe, Compass, LogIn, BookOpen } from 'lucide-svelte';
	import PannableCover from '$lib/components/PannableCover.svelte';

	type Profile = {
		id: string;
		username: string;
		full_name: string | null;
		avatar_url: string | null;
		cover_photo_url: string | null;
		cover_focal_x?: number;
		cover_focal_y?: number;
	};

	type PublicTrip = {
		id: string;
		title: string;
		description: string | null;
		start_date: string;
		end_date: string;
		image_url: string | null;
		visibility: string;
		metadata: Record<string, any> | null;
	};

	let profile = $state<Profile | null>(null);
	let trips = $state<PublicTrip[]>([]);
	let isLoading = $state(true);
	let notFound = $state(false);
	let isOwner = $state(false);
	let currentUserId = $state<string | null>(null);

	const username = $derived(page.params.username ?? '');

	const stats = $derived.by(() => {
		const cities = new Set<string>();
		const countries = new Set<string>();
		let totalDistance = 0;
		for (const trip of trips) {
			if (trip.metadata?.visitedCitiesDetailed) {
				for (const c of trip.metadata.visitedCitiesDetailed) {
					if (c.city) cities.add(c.city);
					if (c.countryCode) countries.add(c.countryCode);
				}
			}
			totalDistance += trip.metadata?.distanceTraveled ?? 0;
		}
		return {
			trips: trips.length,
			cities: cities.size,
			countries: countries.size,
			distance: totalDistance
		};
	});

	onMount(async () => {
		try {
			const { data: session } = await fluxbase.auth.getSession();
			currentUserId = session?.session?.user?.id ?? null;
		} catch {
			currentUserId = null;
		}

		const requireAuth = await readSetting(() =>
			fluxbase.settings.get('wayli.public_trips_require_auth')
		);
		if (requireAuth?.value === true || requireAuth?.value === 'true') {
			if (!currentUserId) {
				goto(`/auth/signin?redirectTo=/u/${username}`);
				return;
			}
		}

		try {
			const { data: profileData } = await fluxbase
				.from('public_profiles')
				.select('*')
				.eq('username', username)
				.single();

			if (!profileData) {
				notFound = true;
				return;
			}
			profile = profileData as unknown as Profile;
			isOwner = currentUserId === profile.id;

			let tripQuery = fluxbase
				.from('trips')
				.select('id, title, description, start_date, end_date, image_url, visibility, metadata')
				.eq('user_id', profile.id)
				.in('status', ['active', 'planned', 'completed'])
				.order('start_date', { ascending: false });

			if (!isOwner) {
				tripQuery = tripQuery.eq('visibility', 'public');
			}

			const { data: tripData } = await tripQuery;
			trips = (tripData as unknown as PublicTrip[]) ?? [];
		} catch {
			notFound = true;
		} finally {
			isLoading = false;
		}
	});

	function formatDistance(meters: number): string {
		if (meters < 1000) return `${Math.round(meters)} m`;
		return `${(meters / 1000).toFixed(0)} km`;
	}

	async function saveCoverFocal(x: number, y: number) {
		if (!isOwner || !profile) return;
		profile.cover_focal_x = x;
		profile.cover_focal_y = y;
		try {
			await fluxbase
				.from('user_profiles')
				.update({ cover_focal_x: x, cover_focal_y: y })
				.eq('id', profile.id);
		} catch {
			// non-critical
		}
	}
</script>

<svelte:head>
	<title>{profile ? `${profile.full_name ?? '@' + profile.username} · Wayli` : 'Wayli'}</title>
</svelte:head>

{#if isLoading}
	<div class="flex min-h-[60vh] items-center justify-center">
		<div class="border-primary h-10 w-10 animate-spin rounded-full border-2"></div>
	</div>
{:else if notFound}
	<div class="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-4">
		<Compass class="text-muted-foreground h-12 w-12 opacity-40" />
		<p class="text-muted-foreground text-lg">Traveler not found.</p>
		<a href="/" class="text-primary hover:underline text-sm">← Home</a>
	</div>
{:else if profile}
	<!-- Floating top bar -->
	<div class="fixed top-0 right-0 z-50 p-4">
		{#if isOwner}
			<a
				href="/dashboard/travel"
				class="bg-background/80 text-foreground ring-border inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium shadow-lg ring-1 backdrop-blur-md transition-all hover:scale-105"
			>
				<BookOpen class="h-4 w-4" />
				Dashboard
			</a>
		{:else if currentUserId}
			<a
				href="/dashboard/travel"
				class="bg-background/80 text-foreground ring-border inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium shadow-lg ring-1 backdrop-blur-md transition-all hover:scale-105"
			>
				<BookOpen class="h-4 w-4" />
				My Travel
			</a>
		{:else}
			<a
				href="/auth/signin"
				class="bg-background/80 text-foreground ring-border inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium shadow-lg ring-1 backdrop-blur-md transition-all hover:scale-105"
			>
				<LogIn class="h-4 w-4" />
				Sign in
			</a>
		{/if}
	</div>

	<!-- Full-bleed hero -->
	<div class="relative h-[420px] w-full overflow-hidden">
		{#if profile.cover_photo_url}
			<PannableCover
				src={profile.cover_photo_url}
				focalX={profile.cover_focal_x ?? 0.5}
				focalY={profile.cover_focal_y ?? 0.5}
				editable={isOwner}
				onFocalChange={saveCoverFocal}
				class="h-full w-full"
			/>
		{:else}
			<div class="h-full w-full bg-gradient-to-br from-slate-800 via-slate-700 to-slate-500"></div>
		{/if}
		<!-- Gradient overlays for text legibility -->
		<div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30"></div>

		<!-- Hero content -->
		<div class="absolute inset-bottom-0 bottom-0 mx-auto max-w-6xl px-6 pb-8">
			<div class="flex items-end gap-5">
				<!-- Avatar -->
				{#if profile.avatar_url}
					<img
						src={profile.avatar_url}
						alt={profile.full_name ?? profile.username}
						class="h-28 w-28 rounded-3xl border-2 border-white/20 object-cover shadow-2xl"
					/>
				{:else}
					<div
						class="flex h-28 w-28 items-center justify-center rounded-3xl border-2 border-white/20 bg-white/10 text-4xl font-bold text-white shadow-2xl backdrop-blur-sm"
					>
						{(profile.full_name ?? profile.username)[0]?.toUpperCase()}
					</div>
				{/if}
				<!-- Name + handle -->
				<div class="pb-2">
					<h1 class="text-3xl font-bold tracking-tight text-white drop-shadow-lg sm:text-4xl">
						{profile.full_name ?? `@${profile.username}`}
					</h1>
					<p class="flex items-center gap-1.5 text-base text-white/70">
						<Globe class="h-4 w-4" />
						@{profile.username}
					</p>
				</div>
			</div>
			<!-- Stats pills -->
			{#if stats.trips > 0}
				<div class="mt-5 flex flex-wrap gap-3">
					<div
						class="flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm backdrop-blur-md"
					>
						<Route class="h-4 w-4 text-white/60" />
						<span class="font-bold text-white">{stats.trips}</span>
						<span class="text-white/60">{stats.trips === 1 ? 'trip' : 'trips'}</span>
					</div>
					<div
						class="flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm backdrop-blur-md"
					>
						<Globe class="h-4 w-4 text-white/60" />
						<span class="font-bold text-white">{stats.countries}</span>
						<span class="text-white/60">{stats.countries === 1 ? 'country' : 'countries'}</span>
					</div>
					<div
						class="flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm backdrop-blur-md"
					>
						<MapPin class="h-4 w-4 text-white/60" />
						<span class="font-bold text-white">{stats.cities}</span>
						<span class="text-white/60">{stats.cities === 1 ? 'city' : 'cities'}</span>
					</div>
					<div
						class="flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm backdrop-blur-md"
					>
						<Route class="h-4 w-4 text-white/60" />
						<span class="font-bold text-white">{formatDistance(stats.distance)}</span>
						<span class="text-white/60">traveled</span>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Trip cards -->
	<div class="mx-auto max-w-6xl px-4 py-10">
		{#if trips.length === 0}
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<Route class="text-muted-foreground mb-4 h-12 w-12 opacity-30" />
				<p class="text-muted-foreground text-lg">No trips yet.</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each trips as trip, i (trip.id)}
					<a
						href="/u/{username}/trips/{trip.id}"
						class="group relative aspect-[16/10] overflow-hidden rounded-2xl shadow-lg transition-all duration-500 hover:-translate-y-1 hover:shadow-xl animate-fade-in-up"
						style="animation-delay: {i * 60}ms"
					>
						<!-- Background image -->
						{#if trip.image_url}
							<img
								src={trip.image_url}
								alt={trip.title}
								class="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
								loading="lazy"
							/>
						{:else}
							<div class="absolute inset-0 bg-gradient-to-br from-slate-600 to-slate-800"></div>
						{/if}
						<!-- Gradient overlay -->
						<div
							class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent transition-opacity duration-500 group-hover:from-black/90"
						></div>

						<!-- Top date badge -->
						<div class="absolute top-3 left-3 flex gap-2">
							<div
								class="rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white backdrop-blur-md"
							>
								{new Date(trip.start_date).toLocaleDateString(undefined, {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})}
							</div>
							{#if isOwner && trip.visibility !== 'public'}
								<div
									class="rounded-full bg-amber-500/80 px-3 py-1 text-xs font-medium text-white backdrop-blur-md"
								>
									{trip.visibility}
								</div>
							{/if}
						</div>

						<!-- Bottom content -->
						<div class="absolute right-0 bottom-0 left-0 p-4">
							<h3 class="mb-0.5 text-base font-bold tracking-tight text-white drop-shadow-md">
								{trip.title}
							</h3>
							<div class="flex items-center gap-2 text-xs text-white/50">
								{new Date(trip.start_date).toLocaleDateString(undefined, {
									month: 'short',
									day: 'numeric'
								})}
								– {new Date(trip.end_date).toLocaleDateString(undefined, {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})}
							</div>
							{#if trip.metadata?.primaryCity}
								<div class="mt-1 flex items-center gap-1 text-[10px] text-white/40">
									<MapPin class="h-3 w-3" />
									{trip.metadata.primaryCity}
								</div>
							{/if}
							{#if trip.metadata?.image_attribution?.photographer}
								<p class="mt-0.5 text-[9px] text-white/25">
									Photo: {trip.metadata.image_attribution.photographer}/Pexels
								</p>
							{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
{/if}
