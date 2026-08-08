<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { flip } from 'svelte/animate';
	import { fade, fly } from 'svelte/transition';
	import {
		Bell,
		Check,
		CheckCheck,
		Clock,
		Download,
		Upload,
		MapPin,
		Route,
		FileDown,
		Trash2,
		X,
		Loader2,
		CircleAlert
	} from 'lucide-svelte';

	import { translate } from '$lib/i18n';
	import { fluxbase } from '$lib/fluxbase';
	import { toast } from 'svelte-sonner';

	import {
		getActiveJobsMap,
		subscribe as subscribeJobs,
		type JobStoreJob
	} from '$lib/stores/job-store';
	import { unreadCount, refreshUnread } from '$lib/stores/notifications';
	import {
		listNotifications,
		markRead,
		markAllRead,
		deleteNotification
	} from '$lib/services/notifications.service';
	import type { AppNotification } from '$lib/types/notification.types';

	let t = $derived($translate);

	// --- Panel open state + click-outside ---
	let open = $state(false);
	let panelEl: HTMLDivElement | null = null;
	let buttonEl: HTMLButtonElement | null = null;

	// --- Live job data (active jobs only) ---
	let activeJobsMap = $state<Map<string, JobStoreJob>>(new Map());
	const activeJobs = $derived(
		Array.from(activeJobsMap.values())
			.filter((j) => j.status === 'pending' || j.status === 'running')
			.sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
	);

	// --- Persistent notifications ---
	let notifications = $state<AppNotification[]>([]);
	let loadingNotifs = $state(false);

	const activeCount = $derived(activeJobs.length);
	const totalBadge = $derived(activeCount + ($unreadCount > 0 ? $unreadCount : 0));

	// Job-type icon config (mirrors JobProgressIndicator).
	const jobTypeIcon: Record<string, any> = {
		data_import: FileDown,
		data_import_geojson: FileDown,
		data_import_gpx: FileDown,
		data_import_owntracks: FileDown,
		data_export: Upload,
		reverse_geocoding: MapPin,
		reverse_geocoding_missing: MapPin,
		trip_generation: Route,
		trip_detection: Route
	};
	function jobIcon(name: string): any {
		const norm = name.replace(/-/g, '_');
		return jobTypeIcon[norm] ?? Clock;
	}

	function notifIcon(n: AppNotification): any {
		if (n.type === 'job_failed') return CircleAlert;
		if (n.type === 'job_cancelled') return X;
		if (n.type === 'job_completed') {
			// data exports are downloadable
			if (n.link) return Download;
			return Check;
		}
		return Bell;
	}

	// Detect mobile for sheet vs. popover rendering.
	let isMobile = $state(false);
	function updateMobile() {
		isMobile = window.matchMedia('(max-width: 767px)').matches;
	}

	let unsubJobs: (() => void) | null = null;

	onMount(() => {
		updateMobile();
		window.addEventListener('resize', updateMobile);
		activeJobsMap = new Map(getActiveJobsMap());
		unsubJobs = subscribeJobs(() => {
			activeJobsMap = new Map(getActiveJobsMap());
		});
		document.addEventListener('click', handleDocClick);
	});

	onDestroy(() => {
		window.removeEventListener('resize', updateMobile);
		unsubJobs?.();
		document.removeEventListener('click', handleDocClick);
	});

	function handleDocClick(e: MouseEvent) {
		if (!open) return;
		const target = e.target as Node;
		if (panelEl && panelEl.contains(target)) return;
		if (buttonEl && buttonEl.contains(target)) return;
		open = false;
	}

	async function togglePanel() {
		open = !open;
		if (open) await loadNotifs();
	}

	async function loadNotifs() {
		loadingNotifs = true;
		try {
			notifications = await listNotifications(25);
		} finally {
			loadingNotifs = false;
		}
	}

	async function handleMarkRead(n: AppNotification, e?: MouseEvent) {
		e?.stopPropagation();
		if (n.read_at) return;
		await markRead(n.id);
		notifications = notifications.map((x) =>
			x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x
		);
		refreshUnread();
	}

	async function handleMarkAllRead() {
		await markAllRead();
		notifications = notifications.map((x) => ({
			...x,
			read_at: x.read_at ?? new Date().toISOString()
		}));
		refreshUnread();
	}

	async function handleDelete(n: AppNotification, e?: MouseEvent) {
		e?.stopPropagation();
		await deleteNotification(n.id);
		notifications = notifications.filter((x) => x.id !== n.id);
		refreshUnread();
	}

	async function handleCancelJob(job: JobStoreJob, e?: MouseEvent) {
		e?.stopPropagation();
		try {
			await fluxbase.jobs.cancel(job.id);
			toast.success(t('jobProgress.cancelSuccess'));
		} catch {
			toast.error(t('jobProgress.cancelFailed'));
		}
	}

	async function handleNotifClick(n: AppNotification) {
		await handleMarkRead(n);
		if (n.link) {
			open = false;
			window.location.href = n.link;
		}
	}

	function relTime(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const m = Math.floor(diff / 60000);
		if (m < 1) return t('notifications.justNow');
		if (m < 60) return t('notifications.minutesAgo').replace('{minutes}', String(m));
		const h = Math.floor(m / 60);
		if (h < 24) return t('notifications.hoursAgo').replace('{hours}', String(h));
		const d = Math.floor(h / 24);
		return t('notifications.daysAgo').replace('{days}', String(d));
	}

	function jobProgressPct(job: JobStoreJob): number {
		return typeof job.progress_percent === 'number' ? job.progress_percent : 0;
	}
</script>

<div class="relative">
	<!-- Bell button -->
	<button
		bind:this={buttonEl}
		onclick={togglePanel}
		class="text-muted-foreground hover:text-foreground relative flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md p-1 transition-colors"
		title={t('notifications.title')}
		aria-label={t('notifications.title')}
	>
		<Bell class="h-5 w-5" />
		{#if totalBadge > 0}
			<span
				class="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold"
			>
				{totalBadge > 99 ? '99+' : totalBadge}
			</span>
		{/if}
	</button>
</div>

{#if open}
	<!-- Mobile: bottom sheet backdrop -->
	{#if isMobile}
		<button
			class="fixed inset-0 z-40 bg-black/50 md:hidden"
			aria-label="Close notifications"
			onclick={() => (open = false)}
			transition={fade}
		></button>

		<div
			class="bg-card fixed inset-x-0 bottom-0 z-50 max-h-[80vh] rounded-t-2xl border-t shadow-2xl md:hidden"
			transition:fly={{ y: 300, duration: 200 }}
		>
			<div class="bg-muted mx-auto mt-2 h-1.5 w-10 rounded-full"></div>
			<div class="flex items-center justify-between border-b p-4">
				<h2 class="text-foreground text-base font-semibold">{t('notifications.title')}</h2>
				<button
					onclick={() => (open = false)}
					class="text-muted-foreground hover:text-foreground rounded-md p-1"
					aria-label="Close"
				>
					<X class="h-5 w-5" />
				</button>
			</div>
			<div class="max-h-[60vh] overflow-y-auto p-2">
				{@render listContent()}
			</div>
		</div>
	{:else}
		<!-- Desktop: anchored popover -->
		<div
			bind:this={panelEl}
			class="bg-card border-border absolute top-full right-0 z-50 mt-2 w-96 origin-top-right rounded-xl border shadow-2xl"
			transition:fly={{ y: -8, duration: 150 }}
		>
			<div class="flex items-center justify-between border-b p-3">
				<h2 class="text-foreground text-sm font-semibold">{t('notifications.title')}</h2>
				{#if $unreadCount > 0}
					<button
						onclick={handleMarkAllRead}
						class="text-primary hover:text-primary/80 flex items-center gap-1 text-xs font-medium"
					>
						<CheckCheck class="h-3.5 w-3.5" />
						{t('notifications.markAllRead')}
					</button>
				{/if}
			</div>
			<div class="max-h-[28rem] overflow-y-auto p-2">
				{@render listContent()}
			</div>
		</div>
	{/if}
{/if}

{#snippet listContent()}
	{#if activeJobs.length > 0}
		<div class="px-2 pt-2 pb-1">
			<p class="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">
				{t('notifications.active')} · {activeJobs.length}
			</p>
		</div>
		{#each activeJobs as job (job.id)}
			{@const JobIcon = jobIcon(job.job_name)}
			<div
				class="hover:bg-muted flex items-start gap-3 rounded-lg p-2"
				role="status"
				aria-live="polite"
			>
				<div class="text-primary mt-0.5">
					<Loader2 class="h-4 w-4 animate-spin" />
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-center justify-between gap-2">
						<p class="text-foreground truncate text-sm font-medium">
							<JobIcon class="text-muted-foreground mr-1 inline h-3.5 w-3.5" />
							{job.job_name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
						</p>
						{#if job.status === 'running'}
							<button
								onclick={(e) => handleCancelJob(job, e)}
								class="text-muted-foreground shrink-0 hover:text-red-500"
								title={t('jobProgress.cancelJob')}
								aria-label={t('jobProgress.cancelJob')}
							>
								<X class="h-3.5 w-3.5" />
							</button>
						{/if}
					</div>
					<div class="bg-muted mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
						<div
							class="bg-primary h-full rounded-full transition-all duration-300"
							style="width: {jobProgressPct(job)}%"
						></div>
					</div>
					<p class="text-muted-foreground mt-1 text-xs">
						{job.status === 'pending'
							? t('jobProgress.statusPending')
							: job.progress_message || t('jobProgress.statusRunning')}
					</p>
				</div>
			</div>
		{/each}
	{/if}

	<div class="px-2 pt-2 pb-1">
		<p class="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">
			{t('notifications.recent')}
		</p>
	</div>

	{#if loadingNotifs}
		<div class="text-muted-foreground flex items-center justify-center gap-2 p-6 text-sm">
			<Loader2 class="h-4 w-4 animate-spin" />
			{t('notifications.loading')}
		</div>
	{:else if notifications.length === 0 && activeJobs.length === 0}
		<div class="text-muted-foreground flex flex-col items-center gap-2 p-8 text-center">
			<Bell class="h-8 w-8 opacity-40" />
			<p class="text-sm">{t('notifications.empty')}</p>
		</div>
	{:else}
		{#each notifications as n (n.id)}
			{@const NIcon = notifIcon(n)}
			<div
				class="hover:bg-muted group flex items-start gap-3 rounded-lg p-2 {!n.read_at
					? 'bg-primary/5'
					: ''}"
				role={n.link ? 'button' : 'listitem'}
				tabindex={n.link ? 0 : undefined}
				onclick={() => handleNotifClick(n)}
				onkeydown={(e) => e.key === 'Enter' && handleNotifClick(n)}
				animate:flip={{ duration: 150 }}
			>
				<div
					class="mt-0.5 {n.type === 'job_failed'
						? 'text-red-500'
						: n.type === 'job_completed'
							? 'text-green-500'
							: 'text-muted-foreground'}"
				>
					<NIcon class="h-4 w-4" />
				</div>
				<div class="min-w-0 flex-1">
					<p class="text-foreground text-sm leading-snug font-medium">
						{#if !n.read_at}<span
								class="bg-primary mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
							></span>{/if}
						{n.title}
					</p>
					{#if n.body}
						<p class="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{n.body}</p>
					{/if}
					<p class="text-muted-foreground mt-1 text-xs">{relTime(n.created_at)}</p>
				</div>
				<div
					class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
				>
					{#if !n.read_at}
						<button
							onclick={(e) => handleMarkRead(n, e)}
							class="text-muted-foreground hover:text-foreground rounded p-1"
							title={t('notifications.markRead')}
							aria-label={t('notifications.markRead')}
						>
							<Check class="h-3.5 w-3.5" />
						</button>
					{/if}
					<button
						onclick={(e) => handleDelete(n, e)}
						class="text-muted-foreground rounded p-1 hover:text-red-500"
						title={t('notifications.delete')}
						aria-label={t('notifications.delete')}
					>
						<Trash2 class="h-3.5 w-3.5" />
					</button>
				</div>
			</div>
		{/each}
	{/if}
{/snippet}
