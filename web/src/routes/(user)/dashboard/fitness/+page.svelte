<script lang="ts">
	import { Activity, ChevronRight, Dumbbell, UploadCloud } from 'lucide-svelte';
	import { onMount } from 'svelte';

	import { translate } from '$lib/i18n';
	import { fluxbase } from '$lib/fluxbase';
	import {
		formatDistance,
		formatDuration,
		groupByMonth,
		sportTheme,
		type FitnessActivity
	} from '$lib/utils/fitness';

	let t = $derived($translate);

	let activities = $state<FitnessActivity[]>([]);
	let loading = $state(true);

	const groups = $derived(groupByMonth(activities));

	onMount(async () => {
		try {
			const { data, error } = await fluxbase
				.from<Record<string, any>>('fitness_activities')
				.select('*')
				.order('started_at', { ascending: false })
				.range(0, 199);
			if (error) {
				console.error('Failed to load fitness activities:', error);
			} else {
				activities = (data ?? []) as unknown as FitnessActivity[];
			}
		} finally {
			loading = false;
		}
	});

	function formatStart(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		});
	}

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}
</script>

<svelte:head>
	<title>{t('fitness.title')} · Wayli</title>
</svelte:head>

<div>
	<!-- Header -->
	<div class="mb-8 flex items-center gap-3">
		<div
			class="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-fuchsia-500/20"
		>
			<Activity class="h-6 w-6 text-white" />
		</div>
		<div>
			<div class="flex items-center gap-2">
				<h1 class="text-foreground text-xl font-bold">{t('fitness.title')}</h1>
				<span
					class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold tracking-wide text-amber-700 uppercase dark:bg-amber-900/40 dark:text-amber-300"
				>
					{t('fitness.betaBadge')}
				</span>
			</div>
			<p class="text-muted-foreground text-sm">{t('fitness.subtitle')}</p>
		</div>
	</div>

	{#if loading}
		<!-- Loading skeleton -->
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
			{#each Array(3) as _}
				<div class="bg-card border-border animate-pulse rounded-xl border p-5">
					<div class="bg-muted mb-4 h-3 w-24 rounded-full"></div>
					<div class="bg-muted mb-2 h-8 w-32 rounded-lg"></div>
					<div class="bg-muted h-3 w-40 rounded-full"></div>
				</div>
			{/each}
		</div>
	{:else if activities.length === 0}
		<!-- Empty state -->
		<div
			class="bg-card border-border flex flex-col items-center rounded-xl border p-14 text-center"
		>
			<div class="bg-muted mb-4 flex h-14 w-14 items-center justify-center rounded-full">
				<UploadCloud class="text-muted-foreground h-7 w-7" />
			</div>
			<h2 class="text-foreground text-lg font-semibold">{t('fitness.emptyTitle')}</h2>
			<p class="text-muted-foreground mt-1 max-w-md text-sm">{t('fitness.emptyHint')}</p>
			<a
				href="/dashboard/import-export"
				class="bg-primary hover:bg-primary/90 mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
			>
				<UploadCloud class="h-4 w-4" />
				{t('importExport.importData')}
			</a>
		</div>
	{:else}
		{#each groups as group (group.label)}
			<section class="mb-8">
				<h2 class="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
					{group.label}
				</h2>
				<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{#each group.activities as activity (activity.id)}
						{@const theme = sportTheme(activity.sport)}
						<a
							href="/dashboard/fitness/{activity.id}"
							class="bg-card border-border group hover:border-primary/40 relative overflow-hidden rounded-xl border transition-all hover:shadow-lg"
						>
							<!-- Sport gradient accent -->
							<div class="h-1.5 w-full bg-gradient-to-r {theme.gradient}"></div>
							<div class="p-5">
								<div class="mb-3 flex items-center justify-between">
									<div class="flex items-center gap-2">
										<span
											class="{theme.text} flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br {theme.gradient} bg-clip-text"
										>
											<Dumbbell class="h-4 w-4 text-white" />
										</span>
										<div>
											<p class="text-foreground text-sm font-semibold">
												{t(theme.labelKey)}
											</p>
											<p class="text-muted-foreground text-xs">
												{formatStart(activity.started_at)} · {formatTime(activity.started_at)}
											</p>
										</div>
									</div>
									<ChevronRight
										class="text-muted-foreground group-hover:text-primary h-5 w-5 transition-colors"
									/>
								</div>

								<div class="mb-3 flex items-baseline gap-3">
									<span class="text-foreground text-2xl font-bold tabular-nums">
										{formatDistance(activity.total_distance_m)}
									</span>
									<span class="text-muted-foreground text-sm tabular-nums">
										{formatDuration(activity.moving_time_s ?? activity.elapsed_time_s)}
									</span>
								</div>

								<div
									class="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums"
								>
									{#if activity.avg_heartrate != null}
										<span
											>❤️ {activity.avg_heartrate}<span class="opacity-60"
												>/{activity.max_heartrate ?? '—'}</span
											> bpm</span
										>
									{/if}
									{#if activity.avg_power != null}
										<span
											>⚡ {activity.avg_power}<span class="opacity-60"
												>/{activity.max_power ?? '—'}</span
											> W</span
										>
									{/if}
									{#if activity.calories != null}
										<span>🔥 {activity.calories} kcal</span>
									{/if}
								</div>

								{#if activity.manufacturer}
									<p class="text-muted-foreground/70 mt-3 text-[11px] tracking-wide uppercase">
										{activity.manufacturer}{activity.product ? ` · ${activity.product}` : ''}
									</p>
								{/if}
							</div>
						</a>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</div>
