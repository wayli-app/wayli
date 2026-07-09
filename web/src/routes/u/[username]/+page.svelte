<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fluxbase } from '$lib/fluxbase';
	import { readSetting } from '$lib/utils/settings';
	import { MapPin, Calendar, Route, Globe, Compass } from 'lucide-svelte';

	type Profile = {
		id: string;
		username: string;
		full_name: string | null;
		avatar_url: string | null;
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

	const username = $derived(page.params.username ?? '');

	// Compute stats from trips
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
		const requireAuth = await readSetting(() =>
			fluxbase.settings.get('wayli.public_trips_require_auth')
		);
		if (requireAuth?.value === true || requireAuth?.value === 'true') {
			try {
				const { data } = await fluxbase.auth.getUser();
				if (!data?.user) {
					goto(`/auth/signin?redirectTo=/u/${username}`);
					return;
				}
			} catch {
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

			const { data: tripData } = await fluxbase
				.from('trips')
				.select('id, title, description, start_date, end_date, image_url, visibility, metadata')
				.eq('user_id', profile.id)
				.eq('visibility', 'public')
				.order('start_date', { ascending: false });

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
	<div class="mx-auto max-w-4xl">
		<!-- Hero header -->
		<div class="bg-card border-border mb-6 overflow-hidden rounded-2xl border">
			<!-- Gradient banner -->
			<div class="h-32 bg-gradient-to-br from-primary to-primary/60"></div>
			<!-- Profile info -->
			<div class="px-6 pb-6">
				<div class="-mt-12 mb-4 flex items-end gap-4">
					{#if profile.avatar_url}
						<img
							src={profile.avatar_url}
							alt={profile.full_name ?? profile.username}
							class="bg-card border-border h-24 w-24 rounded-full border-4 object-cover shadow-lg"
						/>
					{:else}
						<div
							class="bg-card border-border flex h-24 w-24 items-center justify-center rounded-full border-4 text-2xl font-bold text-primary shadow-lg"
						>
							{(profile.full_name ?? profile.username)[0]?.toUpperCase()}
						</div>
					{/if}
				</div>
				<h1 class="text-foreground text-3xl font-bold">
					{profile.full_name ?? `@${profile.username}`}
				</h1>
				<p class="text-muted-foreground flex items-center gap-1.5 text-sm">
					<Globe class="h-4 w-4" />
					@{profile.username}
				</p>
			</div>
		</div>

		<!-- Stats bar -->
		{#if stats.trips > 0}
			<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
				<div class="bg-card border-border rounded-xl border p-4 text-center">
					<div class="text-primary text-2xl font-bold">{stats.trips}</div>
					<div class="text-muted-foreground text-xs uppercase tracking-wide">Trips</div>
				</div>
				<div class="bg-card border-border rounded-xl border p-4 text-center">
					<div class="text-primary text-2xl font-bold">{stats.countries}</div>
					<div class="text-muted-foreground text-xs uppercase tracking-wide">Countries</div>
				</div>
				<div class="bg-card border-border rounded-xl border p-4 text-center">
					<div class="text-primary text-2xl font-bold">{stats.cities}</div>
					<div class="text-muted-foreground text-xs uppercase tracking-wide">Cities</div>
				</div>
				<div class="bg-card border-border rounded-xl border p-4 text-center">
					<div class="text-primary text-2xl font-bold">{formatDistance(stats.distance)}</div>
					<div class="text-muted-foreground text-xs uppercase tracking-wide">Traveled</div>
				</div>
			</div>
		{/if}

		<!-- Section header -->
		<div class="mb-4 flex items-center gap-2">
			<Route class="text-primary h-5 w-5" />
			<h2 class="text-foreground text-lg font-semibold">Trips</h2>
		</div>

		<!-- Trip cards -->
		{#if trips.length === 0}
			<div class="bg-card border-border rounded-xl border p-12 text-center">
				<Route class="text-muted-foreground mx-auto mb-3 h-10 w-10 opacity-40" />
				<p class="text-muted-foreground text-sm">No public trips yet.</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{#each trips as trip (trip.id)}
					<a
						href="/u/{username}/trips/{trip.id}"
						class="bg-card border-border group overflow-hidden rounded-xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
					>
						<!-- Cover image -->
						<div class="relative h-44 overflow-hidden">
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
							<!-- Gradient overlay for text readability -->
							<div
								class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"
							></div>
							<!-- Date badge -->
							<div
								class="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm"
							>
								{new Date(trip.start_date).toLocaleDateString(undefined, {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})}
							</div>
						</div>
						<!-- Card body -->
						<div class="p-4">
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
