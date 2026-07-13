<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fluxbase } from '$lib/fluxbase';
	import { readSetting } from '$lib/utils/settings';
	import { userStore } from '$lib/stores/auth';
	import { MapPin, Calendar, Route, Globe, Compass, LogIn, BookOpen } from 'lucide-svelte';

	type Profile = {
		id: string;
		username: string;
		full_name: string | null;
		avatar_url: string | null;
		cover_photo_url: string | null;
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
		// Check if current user is logged in
		try {
			const { data } = await fluxbase.auth.getUser();
			currentUserId = data?.user?.id ?? null;
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

			// Check if the current user is viewing their own profile
			isOwner = currentUserId === profile.id;

			// Load trips: if owner, load ALL (including private); otherwise only public
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
</script>

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
	<!-- Top bar -->
	<div class="fixed top-0 right-0 z-50 p-4">
		{#if isOwner}
			<a
				href="/dashboard/journal"
				class="bg-primary hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-colors"
			>
				<BookOpen class="h-4 w-4" />
				Dashboard
			</a>
		{:else}
			<a
				href="/auth/signin"
				class="bg-primary hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-colors"
			>
				<LogIn class="h-4 w-4" />
				Sign in
			</a>
		{/if}
	</div>

	<div class="mx-auto max-w-6xl px-4 py-6">
		<!-- Hero header -->
		<div class="bg-card border-border mb-8 overflow-hidden rounded-2xl border">
			<!-- Gradient banner / cover photo -->
			{#if profile.cover_photo_url}
				<img src={profile.cover_photo_url} alt="" class="h-40 w-full object-cover" />
			{:else}
				<div class="h-40 bg-gradient-to-br from-primary via-primary/70 to-primary/40"></div>
			{/if}
			<!-- Profile info -->
			<div class="px-8 pb-8">
				<div class="-mt-16 mb-4 flex items-end gap-5">
					{#if profile.avatar_url}
						<img
							src={profile.avatar_url}
							alt={profile.full_name ?? profile.username}
							class="bg-card border-border h-28 w-28 rounded-full border-4 object-cover shadow-xl"
						/>
					{:else}
						<div
							class="bg-card border-border flex h-28 w-28 items-center justify-center rounded-full border-4 text-3xl font-bold text-primary shadow-xl"
						>
							{(profile.full_name ?? profile.username)[0]?.toUpperCase()}
						</div>
					{/if}
				</div>
				<h1 class="text-foreground text-3xl font-bold">
					{profile.full_name ?? `@${profile.username}`}
				</h1>
				<p class="text-muted-foreground flex items-center gap-1.5 text-base">
					<Globe class="h-4 w-4" />
					@{profile.username}
				</p>
			</div>
		</div>

		<!-- Stats bar -->
		{#if stats.trips > 0}
			<div class="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
				<div class="bg-card border-border rounded-2xl border p-5 text-center">
					<div class="text-primary text-3xl font-bold">{stats.trips}</div>
					<div class="text-muted-foreground mt-1 text-xs uppercase tracking-wide">Trips</div>
				</div>
				<div class="bg-card border-border rounded-2xl border p-5 text-center">
					<div class="text-primary text-3xl font-bold">{stats.countries}</div>
					<div class="text-muted-foreground mt-1 text-xs uppercase tracking-wide">Countries</div>
				</div>
				<div class="bg-card border-border rounded-2xl border p-5 text-center">
					<div class="text-primary text-3xl font-bold">{stats.cities}</div>
					<div class="text-muted-foreground mt-1 text-xs uppercase tracking-wide">Cities</div>
				</div>
				<div class="bg-card border-border rounded-2xl border p-5 text-center">
					<div class="text-primary text-3xl font-bold">{formatDistance(stats.distance)}</div>
					<div class="text-muted-foreground mt-1 text-xs uppercase tracking-wide">Traveled</div>
				</div>
			</div>
		{/if}

		<!-- Section header -->
		<div class="mb-5 flex items-center gap-2">
			<Route class="text-primary h-5 w-5" />
			<h2 class="text-foreground text-lg font-semibold">Trips</h2>
		</div>

		<!-- Trip cards -->
		{#if trips.length === 0}
			<div class="bg-card border-border rounded-2xl border p-16 text-center">
				<Route class="text-muted-foreground mx-auto mb-3 h-10 w-10 opacity-40" />
				<p class="text-muted-foreground text-sm">No trips yet.</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{#each trips as trip (trip.id)}
					<a
						href="/u/{username}/trips/{trip.id}"
						class="bg-card border-border group overflow-hidden rounded-2xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
					>
						<div class="relative h-48 overflow-hidden">
							{#if trip.image_url}
								<img
									src={trip.image_url}
									alt={trip.title}
									class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
								/>
							{:else}
								<div class="bg-muted flex h-full items-center justify-center">
									<Route class="text-muted-foreground h-10 w-10" />
								</div>
							{/if}
							<div
								class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"
							></div>
							<!-- Date + visibility badges -->
							<div class="absolute bottom-2 left-2 flex items-center gap-2">
								<div
									class="rounded-md bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm"
								>
									{new Date(trip.start_date).toLocaleDateString(undefined, {
										month: 'short',
										day: 'numeric',
										year: 'numeric'
									})}
								</div>
								{#if isOwner && trip.visibility !== 'public'}
									<div
										class="rounded-md bg-amber-500/80 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm"
									>
										{trip.visibility}
									</div>
								{/if}
							</div>
						</div>
						<div class="p-5">
							<h3
								class="text-foreground mb-1 font-semibold transition-colors group-hover:text-primary"
							>
								{trip.title}
							</h3>
							{#if trip.description}
								<p class="text-muted-foreground line-clamp-2 text-sm">{trip.description}</p>
							{/if}
							{#if trip.metadata?.primaryCity}
								<div class="text-muted-foreground mt-3 flex items-center gap-1 text-xs">
									<MapPin class="h-3 w-3" />
									{trip.metadata.primaryCity}
									{#if trip.metadata?.primaryCountryCode}
										<span class="opacity-50">·</span>
										{trip.metadata.primaryCountryCode}
									{/if}
								</div>
							{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
{/if}
