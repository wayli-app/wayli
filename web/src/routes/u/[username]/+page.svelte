<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fluxbase } from '$lib/fluxbase';
	import { readSetting } from '$lib/utils/settings';
	import { userStore } from '$lib/stores/auth';
	import {
		MapPin,
		Calendar,
		Route,
		Globe,
		Compass,
		LogIn,
		BookOpen,
		EyeOff,
		Sun,
		Moon,
		ArrowLeft
	} from 'lucide-svelte';
	import { setTheme, state as appState } from '$lib/stores/app-state.svelte';
	import PannableCover from '$lib/components/PannableCover.svelte';
	import WorldMap from '$lib/components/WorldMap.svelte';
	import { translate } from '$lib/i18n';

	let t = $derived($translate);

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
		entry_count?: number;
	};

	let profile = $state<Profile | null>(null);
	let trips = $state<PublicTrip[]>([]);
	let isLoading = $state(true);
	let notFound = $state(false);
	let isOwner = $state(false);
	let journalOnly = $state(false);
	let sortBy = $state<'recent' | 'oldest' | 'title' | 'duration' | 'entries'>('recent');
	let sortReverse = $state(false);
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
			distance: totalDistance,
			tripsWithJournal: trips.filter((t) => (t.entry_count ?? 0) > 0).length
		};
	});

	// World map: visited countries from all trips
	const visitedCountries = $derived.by(() => {
		const codes = new Set<string>();
		for (const trip of trips) {
			const meta = trip.metadata;
			if (meta?.visitedCountryCodes) {
				for (const c of meta.visitedCountryCodes) codes.add(String(c).toUpperCase());
			}
			if (meta?.visitedCitiesDetailed) {
				for (const c of meta.visitedCitiesDetailed) {
					if (c.countryCode) codes.add(String(c.countryCode).toUpperCase());
				}
			}
		}
		return [...codes];
	});

	const visibleTrips = $derived.by(() => {
		let result = journalOnly ? trips.filter((t) => (t.entry_count ?? 0) > 0) : [...trips];
		switch (sortBy) {
			case 'title':
				result = result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
				break;
			case 'duration':
				result = result.sort((a, b) => {
					const da = new Date(a.end_date).getTime() - new Date(a.start_date).getTime();
					const db = new Date(b.end_date).getTime() - new Date(b.start_date).getTime();
					return db - da;
				});
				break;
			case 'entries':
				result = result.sort((a, b) => (b.entry_count ?? 0) - (a.entry_count ?? 0));
				break;
			default:
				result = result.sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
		}
		if (sortReverse) result = result.reverse();
		return result;
	});

	onMount(async () => {
		try {
			const { data: session } = await fluxbase.auth.getSession();
			currentUserId = session?.session?.user?.id ?? null;
		} catch {
			currentUserId = null;
		}

		let requireAuth = false;
		try {
			const setting = await readSetting(() =>
				fluxbase.settings.get('wayli.public_trips_require_auth')
			);
			requireAuth = setting?.value === true || setting?.value === 'true';
		} catch {
			// Settings endpoint requires auth — default to open for anonymous
		}
		if (requireAuth && !currentUserId) {
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

			// Fetch journal entry counts per trip
			if (trips.length > 0) {
				try {
					const { data: entryCounts } = await fluxbase
						.from('public_trip_entries')
						.select('trip_id')
						.in(
							'trip_id',
							trips.map((t) => t.id)
						);
					if (entryCounts) {
						const counts = new Map<string, number>();
						for (const e of entryCounts as any[]) {
							counts.set(e.trip_id, (counts.get(e.trip_id) ?? 0) + 1);
						}
						trips = trips.map((t) => ({ ...t, entry_count: counts.get(t.id) ?? 0 }));
					}
				} catch {
					// non-critical
				}
			}
		} catch {
			notFound = true;
		} finally {
			isLoading = false;
		}
	});

	function formatDistance(meters: number): string {
		if (!meters || meters < 1) return '0 km';
		if (meters < 1000) return `${Math.round(meters)} m`;
		const km = meters / 1000;
		if (km < 100) return `${km.toFixed(0)} km`;
		if (km < 10000) return `${km.toLocaleString(undefined, { maximumFractionDigits: 0 })} km`;
		return `${(km / 1000).toFixed(0)}k km`;
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
		<p class="text-muted-foreground text-lg">{t('profile.travelerNotFound')}</p>
		<a href="/" class="text-primary hover:underline text-sm">{t('profile.home')}</a>
	</div>
{:else if profile}
	<!-- Floating top bar -->
	<div class="fixed top-0 right-0 z-50 flex items-center gap-2 p-4">
		{#if currentUserId}
			<a
				href="/dashboard/feed"
				class="bg-background/80 text-foreground ring-border inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium shadow-lg ring-1 backdrop-blur-md transition-all hover:scale-105"
			>
				<ArrowLeft class="h-3.5 w-3.5" />
				Explore
			</a>
		{/if}
		<button
			type="button"
			onclick={() => setTheme(appState.theme === 'dark' ? 'light' : 'dark')}
			class="bg-background/80 text-foreground ring-border inline-flex h-9 w-9 items-center justify-center rounded-full shadow-lg ring-1 backdrop-blur-md transition-all hover:scale-105"
			title="Toggle theme"
		>
			{#if appState.theme === 'dark'}
				<Sun class="h-4 w-4" />
			{:else}
				<Moon class="h-4 w-4" />
			{/if}
		</button>
		{#if isOwner}
			<a
				href="/dashboard/travel"
				class="bg-background/80 text-foreground ring-border inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium shadow-lg ring-1 backdrop-blur-md transition-all hover:scale-105"
			>
				<BookOpen class="h-4 w-4" />
				{t('common.navigation.dashboard')}
			</a>
		{:else if currentUserId}
			<a
				href="/dashboard/travel"
				class="bg-background/80 text-foreground ring-border inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium shadow-lg ring-1 backdrop-blur-md transition-all hover:scale-105"
			>
				<BookOpen class="h-4 w-4" />
				{t('profile.myTravel')}
			</a>
		{:else}
			<a
				href="/auth/signin"
				class="bg-background/80 text-foreground ring-border inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium shadow-lg ring-1 backdrop-blur-md transition-all hover:scale-105"
			>
				<LogIn class="h-4 w-4" />
				{t('auth.signIn')}
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
						<span class="text-white/60"
							>{stats.trips === 1 ? t('common.trip') : t('common.trips')}</span
						>
					</div>
					<div
						class="flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm backdrop-blur-md"
					>
						<Globe class="h-4 w-4 text-white/60" />
						<span class="font-bold text-white">{stats.countries}</span>
						<span class="text-white/60"
							>{stats.countries === 1 ? t('common.country') : t('common.countries')}</span
						>
					</div>
					<div
						class="flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm backdrop-blur-md"
					>
						<MapPin class="h-4 w-4 text-white/60" />
						<span class="font-bold text-white">{stats.cities}</span>
						<span class="text-white/60"
							>{stats.cities === 1 ? t('common.city') : t('common.cities')}</span
						>
					</div>
					<div
						class="flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm backdrop-blur-md"
					>
						<Route class="h-4 w-4 text-white/60" />
						<span class="font-bold text-white">{formatDistance(stats.distance)}</span>
						<span class="text-white/60">{t('profile.traveled')}</span>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- World map -->
	{#if visitedCountries.length > 0}
		<div class="mx-auto max-w-6xl px-4 pt-8">
			<div class="bg-card border-border rounded-2xl border p-4">
				<div class="mb-3 flex items-center justify-between">
					<h3 class="text-foreground text-sm font-bold uppercase tracking-wide">Where I've Been</h3>
					<span class="text-muted-foreground text-xs">
						{visitedCountries.length}
						{visitedCountries.length === 1 ? 'country' : 'countries'}
					</span>
				</div>
				<WorldMap {visitedCountries} class="h-56" />
			</div>
		</div>
	{/if}

	<!-- Trip cards -->
	<div class="mx-auto max-w-6xl px-4 py-10">
		{#if trips.length === 0}
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<Route class="text-muted-foreground mb-4 h-12 w-12 opacity-30" />
				<p class="text-muted-foreground text-lg">{t('profile.noTrips')}</p>
			</div>
		{:else}
			<!-- Sort + filter buttons -->
			<div class="mb-6 flex flex-wrap items-center gap-2">
				{#each [['recent', 'Recent'], ['duration', 'Longest'], ['entries', 'Most entries'], ['title', 'A–Z']] as [value, label] (value)}
					<button
						type="button"
						onclick={() => {
							if (sortBy === value && !sortReverse) {
								sortReverse = true;
							} else if (sortBy === value && sortReverse) {
								sortBy = 'recent';
								sortReverse = false;
							} else {
								sortBy = value as typeof sortBy;
								sortReverse = false;
							}
						}}
						class="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors {sortBy ===
						value
							? 'border-primary bg-primary/10 text-primary'
							: 'border-border text-muted-foreground hover:text-foreground'}"
					>
						{label}
						{#if sortBy === value}
							<span class="text-[10px] opacity-60">{sortReverse ? '↓' : '↑'}</span>
						{/if}
					</button>
				{/each}
				{#if stats.tripsWithJournal > 0}
					<div class="mx-1 h-4 w-px bg-border"></div>
					<button
						type="button"
						onclick={() => (journalOnly = !journalOnly)}
						class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors {journalOnly
							? 'border-primary bg-primary/10 text-primary'
							: 'border-border text-muted-foreground hover:text-foreground'}"
					>
						<BookOpen class="h-3.5 w-3.5" />
						{journalOnly ? 'All trips' : `Trips with journal (${stats.tripsWithJournal})`}
					</button>
				{/if}
			</div>
			<div
				class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4"
				style="grid-auto-flow: dense; grid-auto-rows: 120px;"
			>
				{#each visibleTrips as trip, i (trip.id)}
					{@const hasJournal = (trip.entry_count ?? 0) > 0}
					{@const tripDays = Math.max(
						1,
						Math.ceil(
							(new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000
						)
					)}
					{@const isLarge = hasJournal || tripDays >= 7}
					<a
						href="/u/{username}/trips/{trip.id}"
						class="group relative overflow-hidden rounded-xl shadow-md transition-all duration-500 hover:shadow-xl animate-fade-in-up {isLarge
							? 'col-span-2 row-span-2'
							: ''}"
						style="animation-delay: {i * 40}ms"
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
									class="flex items-center justify-center rounded-full bg-amber-500/80 p-1.5 text-white backdrop-blur-md"
									title={trip.visibility}
								>
									<EyeOff class="h-3 w-3" />
								</div>
							{/if}
							{#if (trip.entry_count ?? 0) > 0}
								<div
									class="flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md"
								>
									<BookOpen class="h-3 w-3" />
									{trip.entry_count}
								</div>
							{/if}
						</div>

						<!-- Bottom content -->
						<div class="absolute right-0 bottom-0 left-0 p-3 sm:p-4">
							<h3
								class="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-base {hasJournal
									? ''
									: 'truncate'}"
							>
								{trip.title}
							</h3>
							{#if hasJournal}
								<div class="mt-0.5 flex items-center gap-2 text-xs text-white/50">
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
								{#if (trip.entry_count ?? 0) > 0}
									<div class="mt-1 flex items-center gap-1 text-[10px] text-white/40">
										<BookOpen class="h-3 w-3" />
										{trip.entry_count} entries
									</div>
								{/if}
							{/if}
							{#if trip.metadata?.primaryCity && hasJournal}
								<div class="mt-1 flex items-center gap-1 text-[10px] text-white/40">
									<MapPin class="h-3 w-3" />
									{trip.metadata.primaryCity}
								</div>
							{/if}
							{#if trip.metadata?.image_attribution?.photographer}
								<p class="mt-0.5 text-[9px] text-white/25">
									{t('common.photoCredit', {
										photographer: trip.metadata.image_attribution.photographer
									})}
								</p>
							{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
{/if}
