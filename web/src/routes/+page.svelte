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

	onMount(() => {
		initializeTheme();
		if (browser) {
			const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
			currentTheme =
				savedTheme ??
				(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
		}

		(async () => {
			try {
				await fluxbase.auth.getSession();
			} catch {}

			let redirectUser: string | null = null;
			let communityDisabled = false;

			try {
				const resp = await fluxbase.settings.get('wayli.landing_redirect_username');
				if (typeof resp === 'string' && resp.trim()) {
					redirectUser = resp.trim();
				} else if (resp && typeof resp === 'object') {
					const v = (resp as any).value ?? (resp as any).data?.value;
					if (v && typeof v === 'string') redirectUser = v.trim();
				}
			} catch {}

			try {
				const resp = await fluxbase.settings.get('wayli.community_enabled');
				const val =
					typeof resp === 'object' && resp && 'value' in resp ? (resp as any).value : resp;
				communityDisabled = val === false || val === 'false';
			} catch {}

			if (communityDisabled) {
				if (redirectUser) {
					await goto(`/u/${redirectUser}`, { replaceState: true });
					return;
				}
				pageMode = 'signin';
				return;
			}

			pageMode = 'community';
			await loadCommunityContent();
		})();
	});

	async function loadCommunityContent() {
		try {
			const { data: sessionData } = await fluxbase.auth.getSession();
			const userId = (sessionData as any)?.user?.id;
			isLoggedIn = !!userId;
			const isAuthed = !!userId;

			// Query trips: for logged-in users, query without visibility filter
			// (RLS returns public + owned + shared). For anonymous, filter public only.
			let tripsQuery = fluxbase
				.from('trips')
				.select('id, title, image_url, user_id, metadata')
				.in('status', ['active', 'completed'])
				.order('start_date', { ascending: false })
				.limit(10);

			if (!isAuthed) {
				tripsQuery = tripsQuery.eq('visibility', 'public');
			}

			const { data: tripsData } = await tripsQuery;
			const tripsList = (tripsData as any[]) ?? [];
			if (tripsList.length === 0) return;

			// Query entries: use base table for authed users (RLS-aware),
			// public view for anonymous.
			const entriesTable = isAuthed ? 'trip_entries' : 'public_trip_entries';
			const mediaTable = isAuthed ? 'trip_media' : 'public_trip_media';

			const [entriesResult, profilesResult, mediaResult] = await Promise.all([
				fluxbase
					.from(entriesTable)
					.select(
						isAuthed
							? 'id, trip_id, title, body, entry_date, cover_media_id, status'
							: 'id, trip_id, title, body, entry_date, cover_media_id'
					)
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
					.from(mediaTable)
					.select('id, storage_path, thumbnail_path')
					.in(
						'trip_id',
						tripsList.map((t) => t.id)
					)
			]);

			const entriesList = ((entriesResult.data as any[]) ?? []).filter(
				(e) => !isAuthed || e.status === 'published'
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

			// Travelers
			const userIds = [...new Set(tripsList.map((t) => t.user_id))];
			const { data: tripCounts } = await fluxbase
				.from('trips')
				.select('user_id')
				.eq('visibility', 'public')
				.in('user_id', userIds);
			const countMap = new Map<string, number>();
			for (const tr of (tripCounts as any[]) ?? [])
				countMap.set(tr.user_id, (countMap.get(tr.user_id) ?? 0) + 1);

			const { data: profiles } = await fluxbase
				.from('public_profiles')
				.select('id, username, full_name, avatar_url')
				.in('id', userIds);
			travelers = ((profiles as any[]) ?? [])
				.map((p) => ({ ...p, trip_count: countMap.get(p.id) ?? 0 }))
				.filter((p) => p.trip_count > 0)
				.sort((a, b) => b.trip_count - a.trip_count);
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
	<div class="bg-background relative flex min-h-screen flex-col items-center justify-center p-4">
		<div class="bg-white/75 dark:bg-white/10 mb-8 rounded-3xl p-10 shadow-xl">
			<img src="/logo.svg" alt="Wayli" class="h-56 w-auto" />
		</div>
		<div class="w-full max-w-sm space-y-4 text-center">
			<p class="text-muted-foreground text-sm">{t('landing.selfHostedTagline')}</p>
			{#if $userStore?.email}
				<a
					href="/dashboard/travel"
					class="bg-primary hover:bg-primary/90 mt-4 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-primary-foreground transition-colors"
				>
					<BookOpen class="h-4 w-4" />
					{t('common.navigation.dashboard')}
				</a>
			{:else}
				<a
					href="/auth/signin"
					class="bg-primary hover:bg-primary/90 mt-4 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-primary-foreground transition-colors"
				>
					<User class="h-4 w-4" />
					{t('auth.signIn')}
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
		<LanguageSelector variant="minimal" size="sm" showLabel={false} position="bottom-right" />
	</div>
{:else if pageMode === 'community'}
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
					{t('common.navigation.dashboard')}
				</a>
			{:else}
				<a
					href="/auth/signin"
					class="bg-card border-border text-foreground inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium shadow-sm"
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
				class="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"
			></div>
			<div class="relative mx-auto max-w-6xl px-4 py-12 text-center sm:py-20">
				<div class="bg-white/75 dark:bg-white/10 mb-6 inline-flex rounded-3xl p-6 backdrop-blur-md">
					<img src="/logo.svg" alt="Wayli" class="h-20 w-auto drop-shadow-2xl" />
				</div>
				<h1 class="text-foreground text-3xl font-bold tracking-tight sm:text-4xl">
					{t('landing.selfHostedTagline')}
				</h1>
				<p class="text-muted-foreground mx-auto mt-4 max-w-2xl text-base sm:text-lg">
					{t('community.subtitle')}
				</p>
				<div class="mt-8 flex items-center justify-center gap-3">
					<a
						href="#stories"
						class="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors"
					>
						<BookOpen class="h-4 w-4" />
						{t('community.exploreStories')}
					</a>
					{#if !isLoggedIn}
						<a
							href="/auth/signin"
							class="border-border text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition-colors"
						>
							{t('landing.signIn')}
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

			<!-- Empty state -->
			{#if latestEntries.length === 0 && travelers.length === 0}
				<div class="flex flex-col items-center justify-center py-20 text-center">
					<p class="text-muted-foreground">{t('community.noStoriesYet')}</p>
					{#if $userStore?.email}
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
