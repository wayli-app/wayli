<script lang="ts">
	// StatisticsCharts.svelte
	// SVG-based visualizations for the Location Data page. All data is computed
	// by the pure functions in $lib/services/statistics/aggregate; this component
	// only renders. No chart library (keeps the bundle small), no I/O.

	import {
		activityCalendar,
		timeOfDayDistribution,
		speedDistribution,
		type ProcessedPoint
	} from '$lib/services/statistics/aggregate';

	type Props = {
		points: ProcessedPoint[];
		/** Trailing ~53 weeks (date-picker-independent) for calendar + streaks. */
		historyPoints?: ProcessedPoint[];
		transportModeColors: Record<string, string>;
	};

	let { points, historyPoints = [], transportModeColors }: Props = $props();

	// The activity calendar + records/streaks use the trailing-window history
	// (always ~53 weeks ending today, like GitHub's graph) so they're meaningful
	// regardless of the date picker. Fall back to the filtered points if the
	// history hasn't loaded yet. 371 days = 53 weeks, matching the grid.
	let historyFor = $derived(historyPoints.length > 0 ? historyPoints : points);

	// Recompute reactively when the points change.
	let calendar = $derived(activityCalendar(historyFor, 371));
	let hours = $derived(timeOfDayDistribution(points));
	let speedBuckets = $derived(speedDistribution(points));

	// ── Shared custom tooltip ────────────────────────────────────────────────
	// Native SVG <title> tooltips are slow (1-2s dwell) and invisible on touch.
	// A positioned <div> driven by this state appears instantly. `chart`
	// identifies which chart owns the tooltip so only that chart's <div> renders
	// (avoids the same tooltip text bleeding into the neighbouring chart).
	let tooltip = $state<{ chart: string; label: string; sub: string; x: number; y: number } | null>(null);

	function showTooltip(chart: string, label: string, sub: string, e: MouseEvent) {
		const rect = (e.currentTarget.closest('section') as HTMLElement)?.getBoundingClientRect();
		tooltip = {
			chart,
			label,
			sub,
			x: e.clientX - (rect?.left ?? 0),
			y: e.clientY - (rect?.top ?? 0)
		};
	}
	function moveTooltip(e: MouseEvent) {
		if (!tooltip) return;
		const rect = (e.currentTarget.closest('section') as HTMLElement)?.getBoundingClientRect();
		tooltip = {
			...tooltip,
			x: e.clientX - (rect?.left ?? 0),
			y: e.clientY - (rect?.top ?? 0)
		};
	}
	function hideTooltip() {
		tooltip = null;
	}


	// ── Activity calendar geometry ──────────────────────────────────────────
	// GitHub-style grid: weeks as columns, weekdays as rows.
	const CELL = 11;
	const GAP = 3;
	const CELL_PITCH = CELL + GAP;
	const WEEKS = 53;
	const CAL_W = WEEKS * CELL_PITCH;
	const CAL_H = 7 * CELL_PITCH;

	// Trim calendar to the last 53 weeks for display.
	let displayCal = $derived(calendar.slice(-WEEKS * 7));

	let maxDistance = $derived(Math.max(1, ...displayCal.map((d) => d.distance)));

	function calColor(distance: number): string {
		if (distance <= 0) return 'rgba(120,120,120,0.10)';
		const t = Math.min(1, distance / maxDistance);
		// green ramp: light → dark
		const alpha = 0.25 + t * 0.75;
		return `rgba(22,163,74,${alpha.toFixed(2)})`;
	}

	// Map a calendar date to its column/row in the grid.
	function cellPosition(index: number): { x: number; y: number } {
		// displayCal is ordered oldest→newest. Align so the grid ends at last day.
		const total = displayCal.length;
		const offsetFromEnd = total - 1 - index;
		const col = WEEKS - 1 - Math.floor(offsetFromEnd / 7);
		const row = 6 - (offsetFromEnd % 7);
		return { x: col * CELL_PITCH, y: row * CELL_PITCH };
	}

	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	/** Month labels for the horizontal axis: one per month boundary, positioned
	 *  at its first column. Returns [{label, x}] entries. */
	let monthLabels = $derived.by(() => {
		const out: { label: string; x: number }[] = [];
		let lastMonth = -1;
		displayCal.forEach((day, i) => {
			const m = new Date(day.date + 'T00:00:00').getMonth();
			if (m !== lastMonth) {
				const pos = cellPosition(i);
				out.push({ label: MONTHS[m], x: pos.x });
				lastMonth = m;
			}
		});
		return out;
	});

	// ── Time-of-day radial ──────────────────────────────────────────────────
	// Sized to leave room for cardinal hour labels (0/6/12/18) outside the ring.
	const RAD_R = 62;
	const RAD_INNER = 26;
	const RAD_CX = 95;
	const RAD_CY = 95;
	let maxHourDistance = $derived(Math.max(1, ...hours.map((h) => h.distance)));

	function hourArc(hour: number): string {
		// Each hour is 15° of the circle. 0h at top (−90°).
		const startAngle = (hour / 24) * 360 - 90;
		const endAngle = ((hour + 1) / 24) * 360 - 90;
		const dist = hours[hour]?.distance ?? 0;
		const t = dist / maxHourDistance;
		const r = RAD_INNER + (RAD_R - RAD_INNER) * t;
		const sa = (startAngle * Math.PI) / 180;
		const ea = (endAngle * Math.PI) / 180;
		const x1 = RAD_CX + r * Math.cos(sa);
		const y1 = RAD_CY + r * Math.sin(sa);
		const x2 = RAD_CX + r * Math.cos(ea);
		const y2 = RAD_CY + r * Math.sin(ea);
		const x1i = RAD_CX + RAD_INNER * Math.cos(sa);
		const y1i = RAD_CY + RAD_INNER * Math.sin(sa);
		const x2i = RAD_CX + RAD_INNER * Math.cos(ea);
		const y2i = RAD_CY + RAD_INNER * Math.sin(ea);
		const largeArc = endAngle - startAngle > 180 ? 1 : 0;
		return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${x2i} ${y2i} A ${RAD_INNER} ${RAD_INNER} 0 ${largeArc} 0 ${x1i} ${y1i} Z`;
	}

	/** Position for a cardinal hour label (0,6,12,18) just outside the ring. */
	function hourLabelPos(hour: number): { x: number; y: number } {
		// Hour boundary angle (the label sits at the start of that hour's wedge).
		const angle = (hour / 24) * 360 - 90;
		const a = (angle * Math.PI) / 180;
		const r = RAD_R + 11;
		return { x: RAD_CX + r * Math.cos(a), y: RAD_CY + r * Math.sin(a) + 3 };
	}

	// ── Speed histogram ──────────────────────────────────────────────────────
	let maxSpeedCount = $derived(Math.max(1, ...speedBuckets.map((b) => b.count)));
	let speedBarW = $derived(320 / Math.max(1, speedBuckets.length));

	// ── Mode donut ───────────────────────────────────────────────────────────
	// Aggregate per transport_mode: distance, moving time, and point count.
	// Stationary is excluded (it's not movement); the donut shows how the user
	// actually travelled. This replaces the removed "Modes of Transport" table.
	let modeDistances = $derived.by(() => {
		const m = new Map<string, { distance: number; time: number; points: number }>();
		for (const p of points) {
			const mode = p.transport_mode ?? 'unknown';
			if (mode === 'stationary') continue;
			const cur = m.get(mode) ?? { distance: 0, time: 0, points: 0 };
			cur.distance += p.distance ?? 0;
			cur.time += p.time_spent ?? 0;
			cur.points += 1;
			m.set(mode, cur);
		}
		return Array.from(m.entries())
			.map(([mode, v]) => ({ mode, ...v }))
			.sort((a, b) => b.distance - a.distance);
	});
	let totalModeDistance = $derived(modeDistances.reduce((a, b) => a + b.distance, 0));

	function donutSegments() {
		if (totalModeDistance <= 0) return [];
		let cum = 0;
		return modeDistances.map((seg) => {
			const frac = seg.distance / totalModeDistance;
			const start = cum;
			cum += frac;
			return { ...seg, frac, start, end: cum };
		});
	}
	let segments = $derived(donutSegments());

	function donutPath(start: number, end: number, r = 50, cx = 60, cy = 60): string {
		if (end - start >= 0.9999) {
			// full ring
			return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
		}
		const sa = start * 2 * Math.PI - Math.PI / 2;
		const ea = end * 2 * Math.PI - Math.PI / 2;
		const x1 = cx + r * Math.cos(sa);
		const y1 = cy + r * Math.sin(sa);
		const x2 = cx + r * Math.cos(ea);
		const y2 = cy + r * Math.sin(ea);
		const largeArc = end - start > 0.5 ? 1 : 0;
		return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
	}

	function modeColor(mode: string): string {
		return transportModeColors[mode] ?? transportModeColors.unknown ?? '#6b7280';
	}

	function fmtDistance(m: number): string {
		if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
		return `${Math.round(m)} m`;
	}

	/** Format seconds as a compact duration (e.g. 90s → "1m 30s", 3700s → "1h 2m"). */
	function fmtDuration(seconds: number): string {
		if (!seconds || seconds <= 0) return '0s';
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.round(seconds % 60);
		if (h > 0) return `${h}h ${m}m`;
		if (m > 0) return `${m}m ${s}s`;
		return `${s}s`;
	}
</script>

{#if points.length > 0}
	<!-- Activity calendar (distance per day, trailing ~53 weeks ending today) -->
	<section class="relative mb-8 w-full rounded-lg border p-4 bg-card border-border">
		<h3 class="mb-3 text-lg font-semibold text-foreground">📅 Activity</h3>
		<div class="overflow-x-auto">
			<svg width={CAL_W} height={CAL_H + 28} role="img" aria-label="Activity calendar (distance per day)">
				<!-- Month axis -->
				{#each monthLabels as ml (ml.label + String(ml.x))}
					<text x={ml.x} y={9} font-size="9" fill="currentColor" class="text-muted-foreground">{ml.label}</text>
				{/each}
				<!-- Day cells (translate down to leave room for the month axis) -->
				<g transform="translate(0, 14)">
					{#each displayCal as day, i (day.date)}
						{@const pos = cellPosition(i)}
						<rect
							x={pos.x}
							y={pos.y}
							width={CELL}
							height={CELL}
							rx="2"
							fill={calColor(day.distance)}
							onmouseenter={(e) => showTooltip('activity', day.date, `${fmtDistance(day.distance)} · ${day.points} pts`, e)}
							onmousemove={moveTooltip}
							onmouseleave={hideTooltip}
							role="presentation"
						></rect>
					{/each}
				</g>
			</svg>
		</div>
		<div class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
			<span>Less</span>
			{#each [0.1, 0.4, 0.7, 1] as t}
				<span
					class="inline-block h-2.5 w-2.5 rounded-sm"
					style="background:rgba(22,163,74,{t})"
				></span>
			{/each}
			<span>More</span>
			<span class="ml-2">distance per day</span>
		</div>
		{#if tooltip && tooltip.chart === 'activity'}
			<div
				class="bg-foreground text-background pointer-events-none absolute rounded px-2 py-1 text-xs font-medium shadow-lg"
				style="left:{tooltip.x}px; top:{tooltip.y}px; transform: translate(-50%, calc(-100% - 8px));"
			>
				{tooltip.label}
				<span class="opacity-70">· {tooltip.sub}</span>
			</div>
		{/if}
	</section>

	<div class="mb-8 flex w-full flex-col gap-4 md:flex-row">
		<!-- Time-of-day radial -->
		<section class="relative flex-1 rounded-lg border p-4 bg-card border-border">
			<h3 class="mb-3 text-lg font-semibold text-foreground">🕓 Time of day</h3>
			<div class="flex justify-center">
				<svg width="190" height="190" viewBox="0 0 190 190" role="img" aria-label="Time of day distribution">
					{#each hours as h (h.hour)}
						<path
							d={hourArc(h.hour)}
							fill={h.distance > 0 ? 'rgba(37,99,235,0.6)' : 'rgba(120,120,120,0.08)'}
							onmouseenter={(e) => showTooltip('timeofday', `${h.hour}:00–${h.hour + 1}:00`, fmtDistance(h.distance), e)}
							onmousemove={moveTooltip}
							onmouseleave={hideTooltip}
							role="presentation"
						></path>
					{/each}
					<!-- Cardinal hour labels -->
					{#each [0, 6, 12, 18] as labelHour (labelHour)}
						{@const lp = hourLabelPos(labelHour)}
						<text
							x={lp.x}
							y={lp.y}
							text-anchor="middle"
							font-size="9"
							fill="currentColor"
							class="text-muted-foreground"
						>{labelHour}</text>
					{/each}
				</svg>
			</div>
			<p class="mt-2 text-center text-xs text-muted-foreground">When you move most</p>
			{#if tooltip && tooltip.chart === 'timeofday'}
				<div
					class="bg-foreground text-background pointer-events-none absolute rounded px-2 py-1 text-xs font-medium shadow-lg"
					style="left:{tooltip.x}px; top:{tooltip.y}px; transform: translate(-50%, calc(-100% - 8px));"
				>
					{tooltip.label}
					<span class="opacity-70">· {tooltip.sub}</span>
				</div>
			{/if}
		</section>

		<!-- Speed histogram -->
		<section class="relative flex-1 rounded-lg border p-4 bg-card border-border">
			<h3 class="mb-3 text-lg font-semibold text-foreground">⚡ Speed</h3>
			<svg width="100%" height="140" viewBox="0 0 320 140" role="img" aria-label="Speed distribution">
				{#each speedBuckets as b, i (b.label)}
					{@const h = (b.count / maxSpeedCount) * 110}
					<rect
						x={i * speedBarW + 2}
						y={120 - h}
						width={speedBarW - 4}
						height={Math.max(h, b.count > 0 ? 1 : 0)}
						rx="2"
						fill={b.count > 0 ? modeColor(b.dominantMode ?? 'unknown') : 'rgba(120,120,120,0.15)'}
						onmouseenter={(e) => showTooltip('speed', `${b.label} km/h`, `${b.count} points`, e)}
						onmousemove={moveTooltip}
						onmouseleave={hideTooltip}
						role="presentation"
					></rect>
					<text x={i * speedBarW + speedBarW / 2} y={133} text-anchor="middle" font-size="7" fill="currentColor" class="text-muted-foreground">
						{b.label}
					</text>
				{/each}
			</svg>
			<p class="mt-1 text-center text-xs text-muted-foreground">km/h, coloured by dominant mode</p>
			{#if tooltip && tooltip.chart === 'speed'}
				<div
					class="bg-foreground text-background pointer-events-none absolute rounded px-2 py-1 text-xs font-medium shadow-lg"
					style="left:{tooltip.x}px; top:{tooltip.y}px; transform: translate(-50%, calc(-100% - 8px));"
				>
					{tooltip.label}
					<span class="opacity-70">· {tooltip.sub}</span>
				</div>
			{/if}
		</section>

		<!-- Mode donut -->
		<section class="relative flex-1 rounded-lg border p-4 bg-card border-border">
			<h3 class="mb-3 text-lg font-semibold text-foreground">🚗 Mode share</h3>
			<div class="flex items-center gap-4">
				<svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Transport mode share by distance">
					{#if segments.length === 0}
						<circle cx="60" cy="60" r="50" fill="rgba(120,120,120,0.1)" />
					{:else}
						{#each segments as seg (seg.mode)}
							<path
								d={donutPath(seg.start, seg.end)}
								fill={modeColor(seg.mode)}
								onmouseenter={(e) => showTooltip('donut', seg.mode, `${fmtDistance(seg.distance)} · ${(seg.frac * 100).toFixed(0)}%`, e)}
								onmousemove={moveTooltip}
								onmouseleave={hideTooltip}
								role="presentation"
							></path>
						{/each}
						<circle cx="60" cy="60" r="26" fill="var(--color-card, #fff)" />
					{/if}
				</svg>
				<div class="flex-1 space-y-1.5">
					{#each modeDistances.slice(0, 5) as seg (seg.mode)}
						<div class="text-xs">
							<div class="flex items-center gap-2">
								<span class="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm" style="background:{modeColor(seg.mode)}"></span>
								<span class="text-muted-foreground capitalize">{seg.mode}</span>
								<span class="text-foreground ml-auto font-medium">{fmtDistance(seg.distance)}</span>
							</div>
							<div class="text-muted-foreground/70 pl-4.5 text-[10px]">
								{fmtDuration(seg.time)} · {seg.points} pts
							</div>
						</div>
					{/each}
				</div>
			</div>
			{#if tooltip && tooltip.chart === 'donut'}
				<div
					class="bg-foreground text-background pointer-events-none absolute rounded px-2 py-1 text-xs font-medium capitalize shadow-lg"
					style="left:{tooltip.x}px; top:{tooltip.y}px; transform: translate(-50%, calc(-100% - 8px));"
				>
					{tooltip.label}
					<span class="opacity-70">· {tooltip.sub}</span>
				</div>
			{/if}
		</section>
	</div>
{/if}
