<script lang="ts">
	import { onMount } from 'svelte';
	import { Sun, Moon, User, BookOpen, Globe, Calendar } from 'lucide-svelte';
	import LanguageSelector from '$lib/components/ui/language-selector/index.svelte';
	import { translate, messages } from '$lib/i18n';
	import { setTheme, initializeTheme } from '$lib/stores/app-state.svelte';
	import { userStore } from '$lib/stores/auth';
	import { fluxbase } from '$lib/fluxbase';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import WorldMap from '$lib/components/WorldMap.svelte';
	import { renderMarkdown } from '$lib/utils/markdown';

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
	let visitedCountries = $state<string[]>([]);
	let pageMode = $state<'loading' | 'redirect' | 'signin' | 'community'>('loading');

	onMount(() => {
		initializeTheme();
		if (browser) {
			const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
			currentTheme =
				savedTheme ??
				(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
		}

		(async () => {
			// Resolve auth (non-blocking — just populate store)
			try {
				await fluxbase.auth.getSession();
			} catch {}

			// Read settings via the settings API (works for anonymous users)
			let redirectUser: string | null = null;
			let communityDisabled = false;

			try {
				const resp = await fluxbase.settings.get('wayli.landing_redirect_username');
				if (resp && typeof resp === 'string') redirectUser = resp.trim();
				else if (resp && typeof resp === 'object' && 'value' in (resp as any)) {
					const v = (resp as any).value;
					if (v && typeof v === 'string') redirectUser = v.trim();
				}
			} catch {
				// Setting doesn't exist — fine
			}

			try {
				const resp = await fluxbase.settings.get('wayli.community_enabled');
				const val =
					typeof resp === 'object' && resp && 'value' in resp ? (resp as any).value : resp;
				communityDisabled = val === false || val === 'false';
			} catch {
				// Setting doesn't exist — default to community enabled
			}

			// Decide page mode
			if (communityDisabled && redirectUser) {
				// Single-user mode with redirect configured
				pageMode = 'redirect';
				await goto(`/u/${redirectUser}`, { replaceState: true });
				return;
			}

			if (communityDisabled && !redirectUser) {
				// No community, no redirect → minimal sign-in page
				pageMode = 'signin';
				return;
			}

			// Community hub (default when setting not set or explicitly enabled)
			pageMode = 'community';
			await loadCommunityContent();
		})();
	});

	async function loadCommunityContent() {
		// Fetch latest public entries + community data in parallel
		try {
			const { data: publicTrips } = await fluxbase
				.from('trips')
				.select('id, title, image_url, user_id, metadata')
				.eq('visibility', 'public')
				.in('status', ['active', 'completed'])
				.order('start_date', { ascending: false })
				.limit(10);

			const tripsList = (publicTrips as any[]) ?? [];

			if (tripsList.length > 0) {
				// Fetch entries + usernames in parallel
				const [entriesResult, profilesResult] = await Promise.all([
					fluxbase
						.from('public_trip_entries')
						.select('id, trip_id, title, body, entry_date')
						.in(
							'trip_id',
							tripsList.map((t) => t.id)
						)
						.order('entry_date', { ascending: false })
						.limit(6),
					fluxbase
						.from('public_profiles')
						.select('id, username')
						.in('id', [...new Set(tripsList.map((t) => t.user_id))])
				]);

				const entriesList = (entriesResult.data as any[]) ?? [];
				const profileMap = new Map<string, string>();
				for (const p of (profilesResult.data as any[]) ?? []) {
					profileMap.set(p.id, p.username);
				}

				const tripMap = new Map<string, any>();
				for (const t of tripsList) tripMap.set(t.id, t);

				latestEntries = entriesList.map((e) => {
					const trip = tripMap.get(e.trip_id);
					return {
						...e,
						trip_title: trip?.title,
						trip_image_url: trip?.image_url,
						username: trip ? profileMap.get(trip.user_id) : undefined
					};
				});

				// Aggregate visited countries
				const codes = new Set<string>();
				for (const trip of tripsList) {
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
				visitedCountries = [...codes];

				// Travelers directory
				const userIds = [...new Set(tripsList.map((t) => t.user_id))];
				const { data: tripCounts } = await fluxbase
					.from('trips')
					.select('user_id')
					.eq('visibility', 'public')
					.in('user_id', userIds);

				const countMap = new Map<string, number>();
				for (const t of (tripCounts as any[]) ?? []) {
					countMap.set(t.user_id, (countMap.get(t.user_id) ?? 0) + 1);
				}

				const { data: profiles } = await fluxbase
					.from('public_profiles')
					.select('id, username, full_name, avatar_url')
					.in('id', userIds);

				travelers = ((profiles as any[]) ?? [])
					.map((p) => ({ ...p, trip_count: countMap.get(p.id) ?? 0 }))
					.filter((p) => p.trip_count > 0)
					.sort((a, b) => b.trip_count - a.trip_count);
			}
		} catch (err) {
			console.error('Failed to load community content:', err);
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
	<!-- Minimal sign-in page (community disabled, no redirect) -->
	<div class="bg-background flex min-h-screen flex-col items-center justify-center p-4">
		<div class="w-full max-w-sm space-y-6 text-center">
			<h1 class="text-foreground text-3xl font-bold">Wayli</h1>
			<p class="text-muted-foreground text-sm">
				Privacy-first location tracking and travel journal.
			</p>
			{#if $userStore?.email}
				<a
					href="/dashboard/travel"
					class="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-primary-foreground transition-colors"
				>
					<BookOpen class="h-4 w-4" />
					Go to Dashboard
				</a>
			{:else}
				<a
					href="/auth/signin"
					class="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-primary-foreground transition-colors"
				>
					<User class="h-4 w-4" />
					Sign in
				</a>
			{/if}
		</div>

		<div class="fixed right-4 top-4 flex gap-2">
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
		</div>
	</div>
{:else if pageMode === 'community'}
	<!-- Community hub -->
	<div class="bg-background min-h-screen">
		<!-- Top bar -->
		<div class="fixed right-4 top-4 z-40 flex items-center gap-3">
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
			{#if $userStore?.email}
				<a
					href="/dashboard/travel"
					class="bg-card border-border text-foreground inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium shadow-sm"
				>
					<User class="h-4 w-4" />
					Dashboard
				</a>
			{:else}
				<a
					href="/auth/signin"
					class="bg-card border-border text-foreground inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium shadow-sm"
				>
					<User class="h-4 w-4" />
					Sign in
				</a>
			{/if}
		</div>

		<!-- Hero -->
		<div
			class="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700"
		>
			<div
				class="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"
			></div>
			<div class="relative mx-auto max-w-6xl px-4 py-16 text-center sm:py-24">
				<h1 class="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">Wayli</h1>
				<p class="mx-auto mt-4 max-w-xl text-lg text-white/60">
					Discover travel stories from our community
				</p>
			</div>
		</div>

		<!-- Content -->
		<div class="mx-auto max-w-6xl px-4 py-10">
			<!-- Latest Stories -->
			{#if latestEntries.length > 0}
				<div class="mb-12">
					<div class="mb-6 flex items-center gap-2">
						<BookOpen class="text-primary h-5 w-5" />
						<h2 class="text-foreground text-xl font-bold">Latest Stories</h2>
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
										<div class="text-muted-foreground/70 mt-2 text-xs">by @{entry.username}</div>
									{/if}
								</div>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Community World Map -->
			{#if visitedCountries.length > 0}
				<div class="mb-12">
					<div class="mb-3 flex items-center gap-2">
						<Globe class="text-primary h-5 w-5" />
						<h2 class="text-foreground text-xl font-bold">Where We've Been</h2>
						<span class="text-muted-foreground ml-auto text-sm"
							>{visitedCountries.length} countries</span
						>
					</div>
					<div class="bg-card border-border rounded-2xl border p-4">
						<WorldMap {visitedCountries} class="h-64" />
					</div>
				</div>
			{/if}

			<!-- Travelers Directory -->
			{#if travelers.length > 0}
				<div class="mb-12">
					<div class="mb-3 flex items-center gap-2">
						<h2 class="text-foreground text-xl font-bold">Travelers</h2>
					</div>
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
										{traveler.trip_count === 1 ? 'trip' : 'trips'}
									</p>
								</div>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Empty state -->
			{#if latestEntries.length === 0 && travelers.length === 0}
				<div class="flex flex-col items-center justify-center py-20 text-center">
					<Globe class="text-muted-foreground mb-4 h-12 w-12 opacity-30" />
					<p class="text-muted-foreground">No public stories yet.</p>
					{#if $userStore?.email}
						<a href="/dashboard/travel" class="text-primary mt-4 text-sm hover:underline">
							Publish your first trip →
						</a>
					{:else}
						<a href="/auth/signin" class="text-primary mt-4 text-sm hover:underline">
							Sign in to share your stories →
						</a>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}
