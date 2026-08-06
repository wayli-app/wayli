<script lang="ts">
	import { onMount } from 'svelte';
	import { Sun, Moon, User, BookOpen, Globe, Calendar } from 'lucide-svelte';
	import LanguageSelector from '$lib/components/ui/language-selector/index.svelte';
	import { translate, messages } from '$lib/i18n';
	import { setTheme, initializeTheme } from '$lib/stores/app-state.svelte';
	import { loadPublicSettings, getSetting, allSettings } from '$lib/stores/settings.svelte';
	import { userStore } from '$lib/stores/auth';
	import { fluxbase } from '$lib/fluxbase';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	let t = $derived($translate);
	let currentTheme = $state<'light' | 'dark'>('light');
	let latestEntries = $state<
		Array<{
			id: string;
			trip_id: string;
			title: string;
			body: string;
			entry_date: string;
			trip_title?: string;
			trip_image_url?: string | null;
			username?: string;
		}>
	>([]);
	let travelers = $state<
		Array<{
			id: string;
			username: string;
			full_name: string | null;
			avatar_url: string | null;
			trip_count: number;
		}>
	>([]);
	let pageMode = $state<'loading' | 'signin' | 'community'>('loading');
	let isLoggedIn = $state(false);
	// Display name fetched from user_profiles (the source of truth for full_name).
	// The raw SDK User on userStore has no name field, so we fetch it on mount.
	let profileFullName = $state<string | null>(null);
	// Username fetched alongside full_name — shown in the account pill as @username.
	let profileUsername = $state<string | null>(null);
	// The signed-in user's own trips — shown when there are no public stories yet
	// so the landing page is still useful to a logged-in visitor.
	let myTrips = $state<
		Array<{
			id: string;
			title: string;
			image_url: string | null;
			start_date: string;
			status: string;
			visibility: string;
		}>
	>([]);

	// Render signed-in state from the reactive userStore (kept in sync by the
	// SessionManager in the root layout), not the one-shot isLoggedIn flag —
	// the latter can go stale if the session is validated/cleared after mount.
	// The display name falls back through the fetched profile name, signup
	// metadata, and email so the button always shows something meaningful.
	let displayName = $derived(
		profileFullName ||
			($userStore?.full_name as string | undefined) ||
			(($userStore?.metadata as Record<string, unknown> | null)?.full_name as string) ||
			(($userStore?.metadata as Record<string, unknown> | null)?.first_name as string) ||
			$userStore?.email ||
			''
	);

	onMount(() => {
		initializeTheme();
		if (browser) {
			const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
			currentTheme =
				savedTheme ??
				(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
		}

		(async () => {
			// Restore session first — capture the result for all subsequent logic.
			// The landing page is a public route; the SDK might not have initialized
			// the auth listener yet, so we must call getSession() explicitly.
			let sessionUserId: string | null = null;
			try {
				const { data: sessionData } = await fluxbase.auth.getSession();
				sessionUserId = (sessionData as any)?.user?.id ?? null;
			} catch {}
			isLoggedIn = !!sessionUserId;

			// Read landing settings from the central settings store (populated by a
			// single bulk fetch in the root layout). The batch endpoint unwraps the
			// stored `{value: x}` so we read the raw value. These keys are marked
			// is_public on write, so this works for anonymous visitors too — fixing
			// the previous behavior where anon never saw the redirect/gating.
			await loadPublicSettings();
			const redirectRaw = getSetting<unknown>('wayli.landing_redirect_username', null);
			const redirectUser =
				typeof redirectRaw === 'string' && redirectRaw.trim()
					? redirectRaw.trim()
					: (() => {
							// Tolerate the wrapped shape too (older writes / single-key reads).
							const v = (redirectRaw as any)?.value ?? (redirectRaw as any)?.data?.value;
							return v && typeof v === 'string' ? v.trim() : null;
						})();
			const communityRaw = getSetting<unknown>('wayli.community_enabled', null);
			const communityDisabled =
				communityRaw === false ||
				communityRaw === 'false' ||
				(typeof communityRaw === 'object' &&
					communityRaw &&
					((communityRaw as any).value === false ||
						(communityRaw as any).value === 'false'));

			if (communityDisabled) {
				if (redirectUser) {
					await goto(`/u/${redirectUser}`, { replaceState: true });
					return;
				}
				pageMode = 'signin';
				return;
			}

			pageMode = 'community';
			// Only fetch community content when authenticated. The /api/v1/tables/*
			// data routes are auth-required, so an anonymous query 401s (the SDK's
			// .from('trips') resolves to GET /api/v1/tables/trips). Skip it for anon
			// visitors instead of firing a wasted request; they see the empty state.
			if (sessionUserId) {
				// Fetch the signed-in user's display name from user_profiles (the
				// raw SDK User has no name field). Mirrors AppNav.svelte.
				try {
					const { data: profile } = await fluxbase
						.from('user_profiles')
						.select('full_name, username')
						.eq('id', sessionUserId)
						.maybeSingle();
					if ((profile as any)?.full_name) {
						profileFullName = (profile as any).full_name;
					}
					if ((profile as any)?.username) {
						profileUsername = (profile as any).username;
					}
				} catch {}

				await loadCommunityContent();

				// Always show the signed-in user's own trips alongside the public
				// stories — the user should be able to see their own (private)
				// stories regardless of whether public stories exist.
				await loadMyTrips(sessionUserId);
			}
		})();
	});

	// Load community content for an authenticated visitor. The /api/v1/tables/*
	// data routes are auth-required, so this is only called when signed in — an
	// anonymous visitor would get a 401 on every query. (Anonymous community
	// browsing is gated at the call site; see onMount.)
	async function loadCommunityContent() {
		try {
			// Query trips: RLS returns public + owned + shared for the signed-in
			// user. Include 'planned' so the user's own draft trips appear.
			const { data: tripsData } = await fluxbase
				.from('trips')
				.select('id, title, image_url, user_id, metadata')
				.in('status', ['active', 'completed', 'planned'])
				.order('start_date', { ascending: false })
				.limit(10);

			const tripsList = (tripsData as any[]) ?? [];
			if (tripsList.length === 0) return;

			const [entriesResult, profilesResult, mediaResult] = await Promise.all([
				fluxbase
					.from('trip_entries')
					.select('id, trip_id, title, body, entry_date, cover_media_id, status')
					.in(
						'trip_id',
						tripsList.map((t) => t.id)
					)
					.order('entry_date', { ascending: false })
					.limit(6),
				fluxbase
					.from('public_profiles')
					.select('id, username')
					.in('id', [...new Set(tripsList.map((t) => t.user_id))]),
				fluxbase
					.from('trip_media')
					.select('id, storage_path, thumbnail_path')
					.in(
						'trip_id',
						tripsList.map((t) => t.id)
					)
			]);

			const entriesList = ((entriesResult.data as any[]) ?? []).filter(
				(e) => e.status === 'published'
			);
			const profileMap = new Map<string, string>();
			for (const p of (profilesResult.data as any[]) ?? []) profileMap.set(p.id, p.username);
			const tripMap = new Map<string, any>();
			for (const tr of tripsList) tripMap.set(tr.id, tr);
			const mediaMap = new Map<string, string>();
			for (const m of (mediaResult.data as any[]) ?? []) {
				mediaMap.set(m.id, m.thumbnail_path ?? m.storage_path);
			}

			latestEntries = entriesList.map((e) => {
				const trip = tripMap.get(e.trip_id);
				const entryCover = e.cover_media_id ? mediaMap.get(e.cover_media_id) : null;
				return {
					...e,
					trip_title: trip?.title,
					trip_image_url: entryCover ?? trip?.image_url,
					username: trip ? profileMap.get(trip.user_id) : undefined
				};
			});

			// Travelers directory — discoverable users who have at least one
			// trip (any visibility the caller can see via RLS). Previously this
			// only listed users with ≥1 PUBLIC trip, so a user with only private
			// trips never appeared. Now we count any visible trip and respect
			// each user's discoverability setting (discoverable !== 'nobody').
			const userIds = [...new Set(tripsList.map((t) => t.user_id))];
			// Count each user's visible trips (RLS-scoped; no visibility filter
			// so private-trip users are included).
			const { data: tripCounts } = await fluxbase
				.from('trips')
				.select('user_id')
				.in('user_id', userIds);
			const countMap = new Map<string, number>();
			for (const tr of (tripCounts as any[]) ?? [])
				countMap.set(tr.user_id, (countMap.get(tr.user_id) ?? 0) + 1);

			const { data: profiles } = await fluxbase
				.from('public_profiles')
				.select('id, username, full_name, avatar_url, discoverable')
				.in('id', userIds);
			travelers = ((profiles as any[]) ?? [])
				// Respect discoverability: hide users who opted out. Treat a
				// missing/null value as the default 'everyone' (column default).
				.filter((p) => ((p as any).discoverable ?? 'everyone') !== 'nobody')
				.map((p) => {
					const { discoverable: _d, ...rest } = p as any;
					return { ...rest, trip_count: countMap.get(p.id) ?? 0 };
				})
				.filter((p) => p.trip_count > 0)
				.sort((a, b) => b.trip_count - a.trip_count);
		} catch (err) {
			console.error('Failed to load community content:', err);
		}
	}

	// Load the signed-in user's own trips (RLS-scoped to owner). Shown as a
	// fallback when no public/visible stories exist, so the landing page still
	// gives the user something relevant. Matches TripsService.getTrips fields.
	async function loadMyTrips(userId: string) {
		try {
			const { data } = await fluxbase
				.from('trips')
				.select('id, title, image_url, start_date, status, visibility')
				.eq('user_id', userId)
				.in('status', ['active', 'completed', 'planned'])
				.order('start_date', { ascending: false })
				.limit(6);
			myTrips = (data as any[]) ?? [];
		} catch (err) {
			console.error('Failed to load my trips:', err);
		}
	}

	function handleThemeChange(theme: 'light' | 'dark') {
		setTheme(theme);
		currentTheme = theme;
	}
</script>

<svelte:head>
	<title>Wayli · Travel Stories</title>
</svelte:head>

{#if pageMode === 'loading'}
	<div class="bg-background flex min-h-screen items-center justify-center">
		<div class="border-primary h-10 w-10 animate-spin rounded-full border-2"></div>
	</div>
{:else if pageMode === 'signin'}
	<div class="bg-background relative flex min-h-screen flex-col items-center justify-center p-4">
		<div class="mb-8 rounded-3xl bg-white/75 p-10 shadow-xl">
			<img src="/logo.svg" alt="Wayli" class="h-56 w-auto" />
		</div>
		<div class="w-full max-w-sm space-y-4 text-center">
			<p class="text-muted-foreground text-sm">{t('landing.selfHostedTagline')}</p>
			{#if $userStore}
				{#if displayName}
					<p class="text-foreground text-sm font-medium">{displayName}</p>
				{/if}
				<a
					href="/dashboard/travel"
					class="bg-primary hover:bg-primary/90 text-primary-foreground mt-4 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium transition-colors"
				>
					<BookOpen class="h-4 w-4" />
					{t('common.navigation.dashboard')}
				</a>
			{:else}
				<a
					href="/auth/signin"
					class="bg-primary hover:bg-primary/90 text-primary-foreground mt-4 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium transition-colors"
				>
					<User class="h-4 w-4" />
					{t('auth.signIn')}
				</a>
			{/if}
		</div>
		<div
			class="bg-background/80 border-border fixed top-4 right-4 z-40 flex items-center gap-2 rounded-full border px-2 py-1 shadow-sm backdrop-blur-md"
		>
			<button
				onclick={() => handleThemeChange('light')}
				class="cursor-pointer rounded-lg p-2 transition-colors {currentTheme === 'light'
					? 'bg-primary/10 text-primary'
					: 'text-muted-foreground'}"
			>
				<Sun class="h-4 w-4" />
			</button>
			<button
				onclick={() => handleThemeChange('dark')}
				class="cursor-pointer rounded-lg p-2 transition-colors {currentTheme === 'dark'
					? 'bg-primary/10 text-primary'
					: 'text-muted-foreground'}"
			>
				<Moon class="h-4 w-4" />
			</button>
			<LanguageSelector variant="minimal" size="sm" showLabel={false} position="bottom-right" />
		</div>
	</div>
{:else if pageMode === 'community'}
	<div class="bg-background min-h-screen">
		<!-- Top bar -->
		<div
			class="bg-background/80 border-border fixed top-4 right-4 z-40 flex items-center gap-3 rounded-full border px-2 py-1 shadow-sm backdrop-blur-md"
		>
			<LanguageSelector variant="minimal" size="sm" showLabel={false} position="bottom-right" />
			<div class="flex gap-2">
				<button
					onclick={() => handleThemeChange('light')}
					class="cursor-pointer rounded-lg p-2 transition-colors {currentTheme === 'light'
						? 'bg-primary/10 text-primary'
						: 'text-muted-foreground hover:bg-muted'}"
				>
					<Sun class="h-4 w-4" />
				</button>
				<button
					onclick={() => handleThemeChange('dark')}
					class="cursor-pointer rounded-lg p-2 transition-colors {currentTheme === 'dark'
						? 'bg-primary/10 text-primary'
						: 'text-muted-foreground hover:bg-muted'}"
				>
					<Moon class="h-4 w-4" />
				</button>
			</div>
			{#if $userStore}
				<a
					href="/dashboard/account-settings"
					title={profileUsername ? `@${profileUsername}` : displayName || t('common.navigation.accountSettings')}
					class="bg-primary hover:bg-primary/90 text-primary-foreground inline-flex max-w-[10rem] items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
				>
					<User class="h-4 w-4 shrink-0" />
					<span class="truncate">{profileUsername ? `@${profileUsername}` : displayName || t('common.navigation.dashboard')}</span>
				</a>
			{:else}
				<a
					href="/auth/signin"
					class="text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
				>
					<User class="h-4 w-4" />
					{t('auth.signIn')}
				</a>
			{/if}
		</div>

		<!-- Hero -->
		<div
			class="relative overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-white dark:from-slate-900 dark:via-slate-800 dark:to-slate-700"
		>
			<div
				class="from-background absolute inset-0 bg-gradient-to-t via-transparent to-transparent"
			></div>
			<div class="relative mx-auto max-w-6xl px-4 py-12 text-center sm:py-20">
				<div class="mb-6 inline-flex rounded-3xl bg-white/75 p-6 backdrop-blur-md">
					<img src="/logo.svg" alt="Wayli" class="h-20 w-auto drop-shadow-2xl" />
				</div>
				<h1
					class="from-primary via-primary to-primary/60 bg-gradient-to-r bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl"
				>
					{t('landing.heroHeadline')}
				</h1>
				<p class="text-muted-foreground mx-auto mt-4 max-w-2xl text-base sm:text-lg">
					{t('landing.heroSubtext')}
				</p>
				<div class="mt-8 flex items-center justify-center gap-3">
					{#if latestEntries.length > 0 || myTrips.length > 0}
						<a
							href="#stories"
							class="bg-primary hover:bg-primary/90 text-primary-foreground inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
						>
							<BookOpen class="h-4 w-4" />
							{t('community.exploreStories')}
						</a>
					{:else if $userStore}
						<a
							href="/dashboard/travel"
							class="bg-primary hover:bg-primary/90 text-primary-foreground inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
						>
							<BookOpen class="h-4 w-4" />
							{t('landing.goToDashboard')}
						</a>
					{:else}
						<a
							href="/auth/signin"
							class="bg-primary hover:bg-primary/90 text-primary-foreground inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
						>
							<User class="h-4 w-4" />
							{t('auth.signIn')}
						</a>
					{/if}
				</div>
			</div>
		</div>

		<!-- Content -->
		<div id="stories" class="mx-auto max-w-6xl px-4 py-6">
			<!-- Latest Stories -->
			{#if latestEntries.length > 0}
				<div class="mb-16">
					<div class="mb-6 flex items-center gap-2">
						<BookOpen class="text-primary h-5 w-5" />
						<h2 class="text-foreground text-xl font-bold">{t('community.latestStories')}</h2>
					</div>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{#each latestEntries as entry (entry.id)}
							<a
								href={entry.username ? `/u/${entry.username}/trips/${entry.trip_id}` : '#'}
								class="group bg-card border-border overflow-hidden rounded-xl border transition-all hover:shadow-lg"
							>
								{#if entry.trip_image_url}
									<div class="h-32 overflow-hidden">
										<img
											src={entry.trip_image_url}
											alt={entry.trip_title || ''}
											class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
											loading="lazy"
										/>
									</div>
								{/if}
								<div class="p-4">
									<div class="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs">
										<Calendar class="h-3 w-3" />
										{new Date(entry.entry_date).toLocaleDateString(undefined, {
											month: 'long',
											day: 'numeric',
											year: 'numeric'
										})}
									</div>
									<h3 class="text-foreground mb-1 font-bold">
										{entry.title || entry.trip_title || 'Untitled'}
									</h3>
									{#if entry.body}
										<p class="text-muted-foreground line-clamp-3 text-sm">
											{entry.body
												.replace(/[#*`>\-]/g, '')
												.trim()
												.slice(0, 150)}
										</p>
									{/if}
									{#if entry.username}
										<div class="text-muted-foreground/70 mt-2 text-xs">
											{t('community.by')} @{entry.username}
										</div>
									{/if}
								</div>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Travelers Directory -->
			{#if travelers.length > 0}
				<div class="mb-16">
					<h2 class="text-foreground mb-6 text-xl font-bold">{t('community.travelers')}</h2>
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{#each travelers as traveler (traveler.id)}
							<a
								href="/u/{traveler.username}"
								class="bg-card border-border flex items-center gap-3 rounded-xl border p-4 transition-all hover:shadow-md"
							>
								{#if traveler.avatar_url}
									<img
										src={traveler.avatar_url}
										alt=""
										class="h-12 w-12 rounded-full object-cover"
									/>
								{:else}
									<div
										class="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
									>
										{traveler.username[0]?.toUpperCase()}
									</div>
								{/if}
								<div>
									<p class="text-foreground font-medium">@{traveler.username}</p>
									<p class="text-muted-foreground text-xs">
										{traveler.trip_count}
										{traveler.trip_count === 1 ? t('common.trip') : t('common.trips')}
									</p>
								</div>
							</a>
						{/each}
					</div>
				</div>
			{/if}

		<!-- Your trips (shown to signed-in users alongside public stories) -->
		{#if $userStore && myTrips.length > 0}
				<div class="mb-16">
					<div class="mb-6 flex items-center gap-2">
						<BookOpen class="text-primary h-5 w-5" />
						<h2 class="text-foreground text-xl font-bold">{t('community.yourTrips')}</h2>
					</div>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{#each myTrips as trip (trip.id)}
							<a
								href="/dashboard/travel"
								class="group bg-card border-border overflow-hidden rounded-xl border transition-all hover:shadow-lg"
							>
								{#if trip.image_url}
									<div class="h-32 overflow-hidden">
										<img
											src={trip.image_url}
											alt={trip.title}
											class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
											loading="lazy"
										/>
									</div>
								{/if}
								<div class="p-4">
									<div class="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs">
										<Calendar class="h-3 w-3" />
										{new Date(trip.start_date).toLocaleDateString(undefined, {
											month: 'long',
											day: 'numeric',
											year: 'numeric'
										})}
									</div>
									<h3 class="text-foreground mb-1 font-bold">{trip.title || 'Untitled'}</h3>
								</div>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Empty state (only when there's truly nothing to show) -->
			{#if latestEntries.length === 0 && travelers.length === 0 && myTrips.length === 0}
				<div class="flex flex-col items-center justify-center py-20 text-center">
					<p class="text-muted-foreground">{t('community.noStoriesYet')}</p>
					{#if $userStore}
						<a href="/dashboard/travel" class="text-primary mt-4 text-sm hover:underline">
							{t('community.publishFirstTrip')}
						</a>
					{:else}
						<a href="/auth/signin" class="text-primary mt-4 text-sm hover:underline">
							{t('community.signInToShare')}
						</a>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}
