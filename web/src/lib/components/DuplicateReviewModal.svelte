<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { AlertTriangle, Copy, Loader2, X } from 'lucide-svelte';

	import { fluxbase } from '$lib/fluxbase';
	import { translate } from '$lib/i18n';
	import { jobCreationService } from '$lib/services/job-creation.service';
	import {
		dismissDuplicateReport,
		fetchPreviewPoints,
		type DuplicateCluster,
		type DuplicateDecision,
		type DuplicateReport,
		type DuplicateSideStats,
		type PreviewPoint
	} from '$lib/services/duplicates.service';
	import { watchMapTheme, createBasemapLayer } from '$lib/utils/map-theme';

	let t = $derived($translate);

	interface Props {
		report: DuplicateReport;
		/** Just close (report stays pending_review). */
		onclose: () => void;
		/** Report was dismissed or handed to the cleanup job — refresh lists. */
		onSettled?: (reportId: string) => void;
	}

	let { report, onclose, onSettled }: Props = $props();

	// Per-section decision, initialised from the detection verdict.
	let decisions = $state<Record<string, DuplicateDecision>>({});
	let previewPoints = $state<PreviewPoint[]>([]);
	let isLoadingPoints = $state(true);
	let isSubmitting = $state(false);
	let loadFailed = $state(false);

	let mapContainer: HTMLDivElement | undefined = $state();
	let map: any = null;
	let L: any = null;
	let sectionLayer: any = null;
	let destroyed = false;
	let cleanupThemeWatcher: (() => void) | null = null;
	// Fit the map to the sections once; later redraws (decision flips) must
	// not yank the viewport back while the user is panning around.
	let hasFitBounds = false;

	const KEPT_COLOR = '#3b82f6';
	const REMOVED_COLOR = '#f59e0b';
	const SKIPPED_COLOR = '#9ca3af';

	const clusters = $derived(
		(report.clusters ?? []).toSorted((x, y) => x.start.localeCompare(y.start))
	);

	const removeCount = $derived(
		clusters.reduce((sum, c) => {
			const d = decisions[c.id];
			if (d === 'a') return sum + c.b.count;
			if (d === 'b') return sum + c.a.count;
			return sum;
		}, 0)
	);

	const activeSections = $derived(
		clusters.filter((c) => decisions[c.id] === 'a' || decisions[c.id] === 'b').length
	);

	$effect(() => {
		// Initialise / re-derive when the report prop changes.
		const init: Record<string, DuplicateDecision> = {};
		for (const c of report.clusters ?? []) init[c.id] = c.recommended_keep;
		decisions = init;
	});

	function setDecision(clusterId: string, decision: DuplicateDecision) {
		decisions = { ...decisions, [clusterId]: decision };
	}

	function sideLabel(s: DuplicateSideStats): string {
		if (s.kind === 'device') return t('duplicates.sideLive');
		if (s.kind === 'legacy') return t('duplicates.sideEarlierImport');
		if (s.kind === 'import') {
			const src = report.source;
			if (src?.file_name && src.import_id && s.key === `import:${src.import_id}`) {
				return src.file_name;
			}
			return t('duplicates.sideImport');
		}
		return t('duplicates.sideOther');
	}

	function sideStats(s: DuplicateSideStats): string {
		const ppm = Math.round(s.points_per_min * 10) / 10;
		const acc = s.median_accuracy != null ? ` · ±${Math.round(s.median_accuracy)} m` : '';
		return `${s.count.toLocaleString()} pts · ${ppm}/min${acc}`;
	}

	function formatSectionRange(c: DuplicateCluster): string {
		const start = new Date(c.start);
		const end = new Date(c.end);
		const sameDay = start.toDateString() === end.toDateString();
		const date = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
		const from = start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
		const to = end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
		return sameDay
			? `${date}, ${from} – ${to}`
			: `${date} ${from} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${to}`;
	}

	// ── Preview points + map ──
	onMount(async () => {
		L = await import('leaflet');
		if (destroyed) return;

		const span = report.summary;
		const startISO = span?.span_start || clusters[0]?.start;
		const endISO = span?.span_end || clusters[clusters.length - 1]?.end;
		if (!startISO || !endISO) {
			isLoadingPoints = false;
			return;
		}

		try {
			const { data: userData } = await fluxbase.auth.getUser();
			const userId = userData?.user?.id;
			if (userId && !destroyed) {
				previewPoints = await fetchPreviewPoints(userId, startISO, endISO);
			}
		} catch (err) {
			console.error('Failed to load duplicate preview points:', err);
			loadFailed = true;
		} finally {
			if (!destroyed) {
				isLoadingPoints = false;
				initMap();
			}
		}
	});

	onDestroy(() => {
		destroyed = true;
		cleanupThemeWatcher?.();
		cleanupThemeWatcher = null;
		if (map && L) {
			try {
				map.off();
				map.remove();
			} catch {
				/* container may already be detached */
			}
			map = null;
		}
	});

	function initMap() {
		if (!mapContainer || !L || destroyed) return;

		map = L.map(mapContainer, { scrollWheelZoom: true, attributionControl: false });
		cleanupThemeWatcher = watchMapTheme(map, createBasemapLayer);
		if (!sectionLayer) {
			sectionLayer = L.layerGroup().addTo(map);
		}
		drawSections();
		map.whenReady(() => {
			setTimeout(() => map?.invalidateSize(), 100);
		});
	}

	function pointsFor(side: DuplicateSideStats, cluster: DuplicateCluster): PreviewPoint[] {
		return previewPoints.filter(
			(p) =>
				p.session_key === side.key && p.recorded_at >= cluster.start && p.recorded_at <= cluster.end
		);
	}

	// Redraw whenever the decisions (or the loaded preview points) change.
	// drawSections reads that state synchronously, so the effect tracks it;
	// `map` is a plain variable and only gates the call.
	$effect(() => {
		if (!map || !L || isLoadingPoints) return;
		drawSections();
	});

	function drawSections() {
		if (!map || !L || !sectionLayer) return;
		sectionLayer.clearLayers();

		const bounds: Array<[number, number]> = [];

		for (const cluster of clusters) {
			const decision = decisions[cluster.id] ?? cluster.recommended_keep;
			if (decision === 'skip') {
				for (const side of [cluster.a, cluster.b]) {
					for (const p of pointsFor(side, cluster)) {
						sectionLayer.addLayer(
							L.circleMarker([p.lat, p.lng], {
								radius: 2.5,
								color: SKIPPED_COLOR,
								fillColor: SKIPPED_COLOR,
								fillOpacity: 0.4,
								weight: 1,
								opacity: 0.5
							})
						);
						bounds.push([p.lat, p.lng]);
					}
				}
				continue;
			}

			const kept = decision === 'a' ? cluster.a : cluster.b;
			const removed = decision === 'a' ? cluster.b : cluster.a;

			// Kept side: connected track — it stays in the user's history.
			const keptPts = pointsFor(kept, cluster).toSorted((x, y) =>
				x.recorded_at.localeCompare(y.recorded_at)
			);
			if (keptPts.length > 1) {
				sectionLayer.addLayer(
					L.polyline(
						keptPts.map((p) => [p.lat, p.lng] as [number, number]),
						{ color: KEPT_COLOR, weight: 2.5, opacity: 0.9 }
					)
				);
			}
			for (const p of keptPts) {
				sectionLayer.addLayer(
					L.circleMarker([p.lat, p.lng], {
						radius: 2.5,
						color: KEPT_COLOR,
						fillColor: KEPT_COLOR,
						fillOpacity: 0.7,
						weight: 1
					})
				);
				bounds.push([p.lat, p.lng]);
			}

			// Losing side: dots only — these points are removed on confirm.
			for (const p of pointsFor(removed, cluster)) {
				sectionLayer.addLayer(
					L.circleMarker([p.lat, p.lng], {
						radius: 3,
						color: REMOVED_COLOR,
						fillColor: REMOVED_COLOR,
						fillOpacity: 0.6,
						weight: 1
					})
				);
				bounds.push([p.lat, p.lng]);
			}
		}

		if (bounds.length > 0 && !hasFitBounds) {
			hasFitBounds = true;
			map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 15 });
		}
	}

	async function handleDismiss() {
		try {
			await dismissDuplicateReport(report.id);
			toast.info(t('duplicates.dismissedToast'));
			onSettled?.(report.id);
		} catch (err) {
			console.error('Dismiss failed:', err);
			toast.error(t('duplicates.dismissFailed'));
		}
		onclose();
	}

	async function handleApply() {
		if (isSubmitting) return;
		isSubmitting = true;
		try {
			if (activeSections === 0) {
				// Everything skipped — nothing to clean up, just file the report away.
				await dismissDuplicateReport(report.id);
				toast.info(t('duplicates.dismissedToast'));
			} else {
				const keepDecisions = clusters
					.filter((c) => decisions[c.id] === 'a' || decisions[c.id] === 'b')
					.map((c) => ({
						cluster_id: c.id,
						keep: decisions[c.id] as 'a' | 'b'
					}));
				await jobCreationService.createDuplicateCleanupJob(report.id, keepDecisions);
				toast.success(
					t('duplicates.appliedToast').replace('{count}', removeCount.toLocaleString())
				);
			}
			onSettled?.(report.id);
			onclose();
		} catch (err) {
			console.error('Failed to start duplicate cleanup:', err);
			toast.error(t('duplicates.applyFailed'));
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<div
	class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
>
	<div
		class="bg-card border-border flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border shadow-2xl"
	>
		<!-- Header -->
		<div class="border-border flex items-start gap-3 border-b p-5">
			<div class="bg-primary/10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
				<Copy class="text-primary h-5 w-5" />
			</div>
			<div class="min-w-0 flex-1">
				<h2 class="text-foreground text-lg font-bold">{t('duplicates.modalTitle')}</h2>
				<p class="text-muted-foreground mt-0.5 text-sm">{t('duplicates.modalIntro')}</p>
			</div>
			<button
				type="button"
				onclick={onclose}
				class="text-muted-foreground hover:text-foreground rounded-md p-1"
				aria-label="Close"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<!-- Map -->
		<div class="border-border relative h-[280px] shrink-0 border-b">
			<div bind:this={mapContainer} class="h-full w-full"></div>
			{#if isLoadingPoints}
				<div class="bg-card/80 absolute inset-0 flex items-center justify-center backdrop-blur-sm">
					<Loader2 class="text-muted-foreground h-6 w-6 animate-spin" />
				</div>
			{/if}
			<!-- Legend -->
			<div
				class="bg-card/90 border-border absolute bottom-3 left-3 space-y-1 rounded-lg border p-2.5 text-xs backdrop-blur-md"
			>
				<div class="flex items-center gap-2">
					<span class="h-2.5 w-2.5 rounded-full" style="background:{KEPT_COLOR}"></span>
					<span class="text-muted-foreground">{t('duplicates.mapKept')}</span>
				</div>
				<div class="flex items-center gap-2">
					<span class="h-2.5 w-2.5 rounded-full" style="background:{REMOVED_COLOR}"></span>
					<span class="text-muted-foreground">{t('duplicates.mapRemoved')}</span>
				</div>
			</div>
		</div>

		<!-- Sections -->
		<div class="min-h-0 flex-1 overflow-y-auto p-5">
			{#if loadFailed}
				<div class="text-muted-foreground flex items-center gap-2 py-8 text-sm">
					<AlertTriangle class="text-destructive h-4 w-4" />
					{t('duplicates.loadFailed')}
				</div>
			{/if}
			<div class="space-y-3">
				{#each clusters as cluster (cluster.id)}
					{@const decision = decisions[cluster.id] ?? cluster.recommended_keep}
					<div class="border-border rounded-xl border p-4">
						<div class="mb-3 flex items-center justify-between gap-3">
							<span class="text-foreground text-sm font-semibold">
								{formatSectionRange(cluster)}
							</span>
							<button
								type="button"
								onclick={() =>
									setDecision(cluster.id, decision === 'skip' ? cluster.recommended_keep : 'skip')}
								class="text-muted-foreground hover:text-foreground shrink-0 rounded-md border border-transparent px-2 py-1 text-xs font-medium transition-colors {decision ===
								'skip'
									? 'border-border'
									: ''}"
							>
								{t('duplicates.sectionSkip')}
							</button>
						</div>

						{#if decision !== 'skip'}
							<div class="space-y-1.5">
								{#each [cluster.a, cluster.b] as side (side.key)}
									{@const isKept = decision === (side === cluster.a ? 'a' : 'b')}
									<button
										type="button"
										onclick={() => setDecision(cluster.id, side === cluster.a ? 'a' : 'b')}
										class="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors {isKept
											? 'border-primary bg-primary/5'
											: 'border-border hover:border-muted-foreground/40'}"
									>
										<span
											class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border {isKept
												? 'border-primary'
												: 'border-muted-foreground/50'}"
										>
											{#if isKept}
												<span class="bg-primary h-2 w-2 rounded-full"></span>
											{/if}
										</span>
										<span class="min-w-0 flex-1">
											<span class="text-foreground block truncate text-sm font-medium">
												{sideLabel(side)}
												{#if side === cluster[cluster.recommended_keep]}
													<span
														class="bg-primary/10 text-primary ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
													>
														{t('duplicates.recommended')}
													</span>
												{/if}
											</span>
											<span class="text-muted-foreground block text-xs">{sideStats(side)}</span>
										</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<!-- Footer -->
		<div class="border-border flex items-center justify-between gap-3 border-t p-4">
			<button
				type="button"
				onclick={handleDismiss}
				class="border-border text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium"
			>
				{t('duplicates.dismiss')}
			</button>
			<button
				type="button"
				onclick={handleApply}
				disabled={isSubmitting}
				class="bg-destructive hover:bg-destructive/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
			>
				{#if isSubmitting}
					<Loader2 class="h-4 w-4 animate-spin" />
				{/if}
				{activeSections === 0
					? t('duplicates.dismiss')
					: t('duplicates.apply').replace('{count}', removeCount.toLocaleString())}
			</button>
		</div>
	</div>
</div>
