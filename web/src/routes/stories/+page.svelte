<script lang="ts">
	import { onMount } from 'svelte';
	import { Sun, Moon, ArrowLeft, BookOpen, Calendar } from 'lucide-svelte';
	import LanguageSelector from '$lib/components/ui/language-selector/index.svelte';
	import { translate } from '$lib/i18n';
	import { setTheme, initializeTheme } from '$lib/stores/app-state.svelte';
	import { loadPublicSettings, getSetting } from '$lib/stores/settings.svelte';
	import { fluxbase } from '$lib/fluxbase';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { loadStories, type CommunityStory } from '$lib/services/community.service';
	import { Loader2 } from 'lucide-svelte';

	let t = $derived($translate);
	let currentTheme = $state<'light' | 'dark'>('light');
	let stories = $state<CommunityStory[]>([]);
	let isLoading = $state(true);
	let isLoadingMore = $state(false);
	let hasMore = $state(false);
	let currentUserId = $state<string | null>(null);
	const PAGE_SIZE = 12;

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
				const { data: session } = await fluxbase.auth.getSession();
				currentUserId = (session as any)?.session?.user?.id ?? null;
			} catch {
				currentUserId = null;
			}

			await loadPublicSettings();
			let requireAuth = false;
			const setting = getSetting<unknown>('wayli.public_trips_require_auth', null);
			if (setting === null) {
				try {
					const r = await fluxbase.settings.get('wayli.public_trips_require_auth');
					requireAuth = (r as any)?.value === true || (r as any)?.value === 'true';
				} catch {}
			} else {
				requireAuth =
					setting === true ||
					setting === 'true' ||
					(typeof setting === 'object' && setting && (setting as any).value === true);
			}
			if (requireAuth && !currentUserId) {
				goto(`/auth/signin?redirectTo=/stories`);
				return;
			}

			try {
				const result = await loadStories(currentUserId, PAGE_SIZE, 0);
				stories = result.stories;
				hasMore = result.hasMore;
			} catch (err) {
				console.error('Failed to load stories:', err);
			} finally {
				isLoading = false;
			}
		})();
	});

	async function loadMore() {
		if (isLoadingMore || !hasMore) return;
		isLoadingMore = true;
		try {
			const result = await loadStories(currentUserId, PAGE_SIZE, stories.length);
			stories = [...stories, ...result.stories];
			hasMore = result.hasMore;
		} catch (err) {
			console.error('Failed to load more stories:', err);
		} finally {
			isLoadingMore = false;
		}
	}

	function handleThemeChange(theme: 'light' | 'dark') {
		setTheme(theme);
		currentTheme = theme;
	}
</script>

<svelte:head>
	<title>{t('storiesPage.title')} · Wayli</title>
</svelte:head>

<div class="bg-background min-h-screen">
	<!-- Floating top bar -->
	<div class="fixed top-4 right-4 z-40 flex items-center gap-3">
		<a
			href="/"
			class="bg-background/80 text-foreground ring-border inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium shadow-lg ring-1 backdrop-blur-md transition-all hover:scale-105"
		>
			<ArrowLeft class="h-3.5 w-3.5" />
			{t('profile.home')}
		</a>
		<button
			onclick={() => handleThemeChange(currentTheme === 'light' ? 'dark' : 'light')}
			class="bg-background/80 text-foreground ring-border inline-flex h-9 w-9 items-center justify-center rounded-full shadow-lg ring-1 backdrop-blur-md transition-all hover:scale-105"
			aria-label="Toggle theme"
		>
			{#if currentTheme === 'light'}
				<Moon class="h-4 w-4" />
			{:else}
				<Sun class="h-4 w-4" />
			{/if}
		</button>
		<LanguageSelector variant="minimal" size="sm" showLabel={false} position="bottom-left" />
	</div>

	<!-- Hero -->
	<div class="relative h-[280px] w-full overflow-hidden">
		<div
			class="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-700 to-slate-500 dark:from-slate-900 dark:via-slate-800 dark:to-slate-600"
		></div>
		<div
			class="bg-primary/20 absolute -top-24 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full blur-3xl"
		></div>
		<div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/30"></div>
		<div
			class="relative mx-auto flex h-full max-w-6xl flex-col items-center justify-center px-4 text-center"
		>
			<BookOpen class="mb-3 h-10 w-10 text-white/80" />
			<h1 class="text-3xl font-extrabold tracking-tight text-white drop-shadow-lg sm:text-4xl">
				{t('storiesPage.title')}
			</h1>
			<p class="mt-2 max-w-xl text-sm text-white/70 sm:text-base">
				{t('storiesPage.subtitle')}
			</p>
		</div>
	</div>

	<!-- Content -->
	<div class="mx-auto max-w-6xl px-4 py-8">
		{#if isLoading}
			<div class="flex items-center justify-center py-20">
				<div class="border-primary h-8 w-8 animate-spin rounded-full border-2"></div>
			</div>
		{:else if stories.length === 0}
			<div
				class="text-muted-foreground flex flex-col items-center justify-center py-20 text-center"
			>
				<BookOpen class="mb-3 h-10 w-10 opacity-40" />
				<p>{t('storiesPage.empty')}</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each stories as story (story.id)}
					<a
						href={story.username ? `/u/${story.username}/trips/${story.trip_id}` : '#'}
						class="group bg-card border-border overflow-hidden rounded-2xl border transition-all hover:shadow-xl"
					>
						{#if story.trip_image_url}
							<div class="h-32 overflow-hidden">
								<img
									src={story.trip_image_url}
									alt={story.trip_title || ''}
									class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
									loading="lazy"
								/>
							</div>
						{/if}
						<div class="p-4">
							<div class="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs">
								<Calendar class="h-3 w-3" />
								{new Date(story.entry_date).toLocaleDateString(undefined, {
									month: 'long',
									day: 'numeric',
									year: 'numeric'
								})}
							</div>
							<h3 class="text-foreground mb-1 font-bold">
								{story.title || story.trip_title || 'Untitled'}
							</h3>
							{#if story.body}
								<p class="text-muted-foreground line-clamp-3 text-sm">
									{story.body
										.replace(/[#*`>\-]/g, '')
										.trim()
										.slice(0, 150)}
								</p>
							{/if}
							{#if story.username}
								<div class="text-muted-foreground/70 mt-2 text-xs">
									{t('community.by')} @{story.username}
								</div>
							{/if}
						</div>
					</a>
				{/each}
			</div>

			{#if hasMore}
				<div class="mt-8 flex justify-center">
					<button
						onclick={loadMore}
						disabled={isLoadingMore}
						class="bg-card border-border text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-full border px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
					>
						{#if isLoadingMore}
							<Loader2 class="h-4 w-4 animate-spin" />
							{t('common.status.loading')}
						{:else}
							{t('storiesPage.loadMore')}
						{/if}
					</button>
				</div>
			{/if}
		{/if}
	</div>
</div>
