<script lang="ts">
	/**
	 * Dependency-free SVG time-series chart for fitness metrics.
	 *
	 * Renders one or two series (each normalized to its own y-range so heart
	 * rate and power can share a chart). Hovering scrubs a shared x-position:
	 * a vertical guide, per-series dots and a tooltip; the index is emitted so
	 * the parent can sync a map marker. Long series are downsampled with a
	 * stride to keep the DOM light.
	 */
	interface ChartPoint {
		t: number;
		v: number;
	}
	interface ChartSeries {
		label: string;
		color: string;
		points: ChartPoint[];
		area?: boolean;
	}

	let {
		series,
		height = 180,
		onscrub = undefined as ((index: number | null) => void) | undefined
	}: {
		series: ChartSeries[];
		height?: number;
		onscrub?: (index: number | null) => void;
	} = $props();

	const MAX_POINTS = 1200;

	// Downsample all series to a shared stride so indexes stay comparable.
	const stride = $derived(
		Math.max(1, Math.ceil(Math.max(0, ...series.map((s) => s.points.length)) / MAX_POINTS))
	);
	const downsampled = $derived(
		series.map((s) => ({ ...s, points: s.points.filter((_, i) => i % stride === 0) }))
	);

	const count = $derived(Math.max(0, ...downsampled.map((s) => s.points.length)));

	const width = 800;
	const padTop = 12;
	const padBottom = 22;
	const padLeft = 42;
	const padRight = 48;

	const t0 = $derived(downsampled[0]?.points[0]?.t ?? 0);
	const t1 = $derived(
		Math.max(...downsampled.map((s) => s.points[s.points.length - 1]?.t ?? 0), t0 + 1)
	);

	const ranges = $derived(
		downsampled.map((s) => {
			const values = s.points.map((p) => p.v);
			const min = Math.min(...values, Infinity);
			const max = Math.max(...values, -Infinity);
			const span = max - min || 1;
			return { min, max, span };
		})
	);

	function x(t: number): number {
		return padLeft + ((t - t0) / (t1 - t0 || 1)) * (width - padLeft - padRight);
	}

	function y(seriesIdx: number, v: number): number {
		const r = ranges[seriesIdx];
		const frac = (v - r.min) / r.span;
		return padTop + (1 - frac) * (height - padTop - padBottom);
	}

	function linePath(seriesIdx: number): string {
		const pts = downsampled[seriesIdx].points;
		if (pts.length === 0) return '';
		return pts
			.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(seriesIdx, p.v).toFixed(1)}`)
			.join(' ');
	}

	function areaPath(seriesIdx: number): string {
		const pts = downsampled[seriesIdx].points;
		if (pts.length === 0) return '';
		const base = height - padBottom;
		return `${linePath(seriesIdx)} L${x(pts[pts.length - 1].t).toFixed(1)},${base} L${x(pts[0].t).toFixed(1)},${base} Z`;
	}

	// ── Hover scrubbing ──
	let hoverIdx = $state<number | null>(null);
	let hoverX = $state<number>(0);
	let containerEl = $state<HTMLElement | null>(null);

	function handleMove(event: PointerEvent) {
		const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
		const frac = (event.clientX - rect.left) / rect.width;
		const px = frac * width;
		const clamped = Math.min(Math.max(px, padLeft), width - padRight);
		const tTarget = t0 + ((clamped - padLeft) / (width - padLeft - padRight)) * (t1 - t0);

		// Nearest point in the first series (all series share timestamps)
		const pts = downsampled[0]?.points ?? [];
		let best = 0;
		let bestDist = Infinity;
		for (let i = 0; i < pts.length; i++) {
			const d = Math.abs(pts[i].t - tTarget);
			if (d < bestDist) {
				bestDist = d;
				best = i;
			}
		}
		hoverIdx = best;
		hoverX = x(pts[best]?.t ?? t0);
	}

	function handleLeave() {
		hoverIdx = null;
		onscrub?.(null);
	}

	// Report scrub to the parent while moving
	$effect(() => {
		if (hoverIdx !== null) onscrub?.(hoverIdx * stride);
	});

	function formatClock(t: number): string {
		const date = new Date(t);
		return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="relative" bind:this={containerEl}>
	<svg
		viewBox="0 0 {width} {height}"
		class="w-full touch-none select-none"
		role="img"
		aria-label={series.map((s) => s.label).join(', ')}
		onpointermove={handleMove}
		onpointerleave={handleLeave}
	>
		<defs>
			{#each downsampled as s, i (s.label)}
				{#if s.area}
					<linearGradient id="fitgrad-{i}" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color={s.color} stop-opacity="0.35" />
						<stop offset="100%" stop-color={s.color} stop-opacity="0.02" />
					</linearGradient>
				{/if}
			{/each}
		</defs>

		<!-- Horizontal grid -->
		{#each [0, 0.25, 0.5, 0.75, 1] as frac}
			<line
				x1={padLeft}
				x2={width - padRight}
				y1={padTop + frac * (height - padTop - padBottom)}
				y2={padTop + frac * (height - padTop - padBottom)}
				class="stroke-border"
				stroke-width="1"
				stroke-dasharray={frac === 1 ? '' : '3 4'}
			/>
		{/each}

		{#each downsampled as s, i (s.label)}
			{#if s.area}
				<path d={areaPath(i)} fill="url(#fitgrad-{i})" />
			{/if}
			<path
				d={linePath(i)}
				fill="none"
				stroke={s.color}
				stroke-width="2"
				stroke-linejoin="round"
				stroke-linecap="round"
			/>
		{/each}

		<!-- Axis labels: left series min/max, right series min/max -->
		{#if downsampled[0]}
			<text
				x={padLeft - 6}
				y={padTop + 4}
				text-anchor="end"
				class="fill-muted-foreground"
				font-size="10"
			>
				{Math.round(ranges[0].max)}
			</text>
			<text
				x={padLeft - 6}
				y={height - padBottom}
				text-anchor="end"
				class="fill-muted-foreground"
				font-size="10"
			>
				{Math.round(ranges[0].min)}
			</text>
		{/if}
		{#if downsampled[1]}
			<text x={width - padRight + 6} y={padTop + 4} font-size="10" class="fill-muted-foreground">
				{Math.round(ranges[1].max)}
			</text>
			<text
				x={width - padRight + 6}
				y={height - padBottom}
				font-size="10"
				class="fill-muted-foreground"
			>
				{Math.round(ranges[1].min)}
			</text>
		{/if}

		<!-- Time axis -->
		<text x={padLeft} y={height - 6} font-size="10" class="fill-muted-foreground">
			{formatClock(t0)}
		</text>
		<text
			x={width - padRight}
			y={height - 6}
			text-anchor="end"
			font-size="10"
			class="fill-muted-foreground"
		>
			{formatClock(t1)}
		</text>

		<!-- Scrub guide -->
		{#if hoverIdx !== null && count > 0}
			<line
				x1={hoverX}
				x2={hoverX}
				y1={padTop}
				y2={height - padBottom}
				class="stroke-foreground/40"
				stroke-width="1"
			/>
			{#each downsampled as s, i (s.label)}
				{#if s.points[hoverIdx]}
					<circle
						cx={x(s.points[hoverIdx].t)}
						cy={y(i, s.points[hoverIdx].v)}
						r="4"
						fill={s.color}
						class="stroke-background"
						stroke-width="2"
					/>
				{/if}
			{/each}
		{/if}
	</svg>

	<!-- Tooltip -->
	{#if hoverIdx !== null && count > 0}
		<div
			class="bg-background/95 border-border pointer-events-none absolute top-1 z-10 rounded-md border px-2 py-1 text-xs shadow-sm"
			style="left: {(hoverX / width) * 100}%; transform: translateX({hoverX / width > 0.6
				? '-105%'
				: '5%'})"
		>
			<div class="text-muted-foreground mb-0.5">
				{formatClock(downsampled[0]?.points[hoverIdx]?.t ?? t0)}
			</div>
			{#each downsampled as s (s.label)}
				{#if s.points[hoverIdx]}
					<div class="flex items-center gap-1.5 whitespace-nowrap">
						<span class="inline-block h-2 w-2 rounded-full" style="background: {s.color}"></span>
						<span class="font-medium">{Math.round(s.points[hoverIdx].v)}</span>
						<span class="text-muted-foreground">{s.label}</span>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
