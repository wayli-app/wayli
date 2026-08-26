<script lang="ts">
	/**
	 * Dependency-free SVG chart for fitness metrics.
	 *
	 * Renders one or two series (each normalized to its own y-range so heart
	 * rate and power can share a chart). The x axis is an abstract linear
	 * coordinate — pass timestamps for a time axis or meters for a distance
	 * axis (`xAxis` selects the label formatting). Hovering scrubs a shared
	 * x-position: a vertical guide, per-series dots and a tooltip; the hovered
	 * x value is emitted so the parent can sync a map marker. Each series
	 * resolves its own nearest point, so series with gaps stay aligned. Long
	 * series are downsampled with a stride to keep the DOM light.
	 */
	interface ChartPoint {
		x: number;
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
		xAxis = 'time',
		height = 180,
		onscrub = undefined as ((x: number | null) => void) | undefined
	}: {
		series: ChartSeries[];
		xAxis?: 'time' | 'distance';
		height?: number;
		onscrub?: (x: number | null) => void;
	} = $props();

	const MAX_POINTS = 1200;

	// Downsample long series with a stride to keep the DOM light.
	const stride = $derived(
		Math.max(1, Math.ceil(Math.max(0, ...series.map((s) => s.points.length)) / MAX_POINTS))
	);
	const downsampled = $derived(
		series.map((s) => ({ ...s, points: s.points.filter((_, i) => i % stride === 0) }))
	);

	const width = 800;
	const padTop = 12;
	const padBottom = 22;
	const padLeft = 42;
	const padRight = 48;

	const x0 = $derived(Math.min(...downsampled.map((s) => s.points[0]?.x ?? Infinity), Infinity));
	const x1 = $derived(
		Math.max(...downsampled.map((s) => s.points[s.points.length - 1]?.x ?? -Infinity), x0 + 1)
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

	function px(x: number): number {
		return padLeft + ((x - x0) / (x1 - x0 || 1)) * (width - padLeft - padRight);
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
			.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x).toFixed(1)},${y(seriesIdx, p.v).toFixed(1)}`)
			.join(' ');
	}

	function areaPath(seriesIdx: number): string {
		const pts = downsampled[seriesIdx].points;
		if (pts.length === 0) return '';
		const base = height - padBottom;
		return `${linePath(seriesIdx)} L${px(pts[pts.length - 1].x).toFixed(1)},${base} L${px(pts[0].x).toFixed(1)},${base} Z`;
	}

	// ── Hover scrubbing ──
	let hoverXValue = $state<number | null>(null);
	let hoverPx = $state<number>(0);
	let containerEl = $state<HTMLElement | null>(null);

	/** Nearest point index in a series for an x value (points are x-sorted). */
	function nearestIndex(points: ChartPoint[], target: number): number {
		let lo = 0;
		let hi = points.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (points[mid].x < target) lo = mid + 1;
			else hi = mid;
		}
		// lo is the first point >= target; check the predecessor too.
		if (lo > 0 && Math.abs(points[lo - 1].x - target) <= Math.abs(points[lo].x - target)) {
			return lo - 1;
		}
		return lo;
	}

	function handleMove(event: PointerEvent) {
		const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
		const frac = (event.clientX - rect.left) / rect.width;
		const svgX = Math.min(Math.max(frac * width, padLeft), width - padRight);
		hoverXValue = x0 + ((svgX - padLeft) / (width - padLeft - padRight)) * (x1 - x0);
		hoverPx = svgX;
	}

	function handleLeave() {
		hoverXValue = null;
		onscrub?.(null);
	}

	// Report the scrubbed x to the parent while moving
	$effect(() => {
		if (hoverXValue !== null) onscrub?.(hoverXValue);
	});

	function formatX(x: number): string {
		if (xAxis === 'distance') {
			return `${(x / 1000).toFixed(1)} km`;
		}
		return new Date(x).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
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
					<linearGradient id="fitgrad-{i}-{xAxis}" x1="0" y1="0" x2="0" y2="1">
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
				<path d={areaPath(i)} fill="url(#fitgrad-{i}-{xAxis})" />
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

		<!-- X axis -->
		<text x={padLeft} y={height - 6} font-size="10" class="fill-muted-foreground">
			{formatX(x0)}
		</text>
		<text
			x={width - padRight}
			y={height - 6}
			text-anchor="end"
			font-size="10"
			class="fill-muted-foreground"
		>
			{formatX(x1)}
		</text>
		<text
			x={(width + padLeft - padRight) / 2}
			y={height - 6}
			text-anchor="middle"
			font-size="10"
			class="fill-muted-foreground/60"
		>
			{formatX(x0 + (x1 - x0) / 2)}
		</text>

		<!-- Scrub guide -->
		{#if hoverXValue !== null}
			<line
				x1={hoverPx}
				x2={hoverPx}
				y1={padTop}
				y2={height - padBottom}
				class="stroke-foreground/40"
				stroke-width="1"
			/>
			{#each downsampled as s, i (s.label)}
				{#if s.points.length > 0}
					{@const nearest = s.points[nearestIndex(s.points, hoverXValue)]}
					<circle
						cx={px(nearest.x)}
						cy={y(i, nearest.v)}
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
	{#if hoverXValue !== null}
		<div
			class="bg-background/95 border-border pointer-events-none absolute top-1 z-10 rounded-md border px-2 py-1 text-xs shadow-sm"
			style="left: {(hoverPx / width) * 100}%; transform: translateX({hoverPx / width > 0.6
				? '-105%'
				: '5%'})"
		>
			<div class="text-muted-foreground mb-0.5">{formatX(hoverXValue)}</div>
			{#each downsampled as s (s.label)}
				{#if s.points.length > 0}
					{@const nearest = s.points[nearestIndex(s.points, hoverXValue)]}
					<div class="flex items-center gap-1.5 whitespace-nowrap">
						<span class="inline-block h-2 w-2 rounded-full" style="background: {s.color}"></span>
						<span class="font-medium">{Math.round(nearest.v)}</span>
						<span class="text-muted-foreground">{s.label}</span>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
