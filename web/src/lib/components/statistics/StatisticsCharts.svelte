<script lang="ts">
	// StatisticsCharts.svelte
	// SVG-based visualizations for the Location Data page. All data is computed
	// by the pure functions in $lib/services/statistics/aggregate; this component
	// only renders. No chart library (keeps the bundle small), no I/O.

	import {
		activityCalendar,
		timeOfDayDistribution,
		speedDistribution,
		recordsAndStreaks,
		type ProcessedPoint
	} from '$lib/services/statistics/aggregate';

	type Props = {
		points: ProcessedPoint[];
		transportModeColors: Record<string, string>;
	};

	let { points, transportModeColors }: Props = $props();

	// Recompute reactively when the points change.
	let calendar = $derived(activityCalendar(points, 365));
	let hours = $derived(timeOfDayDistribution(points));
	let speedBuckets = $derived(speedDistribution(points));
	let records = $derived(recordsAndStreaks(points));

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

	// ── Time-of-day radial ──────────────────────────────────────────────────
	const RAD_R = 70;
	const RAD_INNER = 28;
	let maxHourPoints = $derived(Math.max(1, ...hours.map((h) => h.points)));

	function hourArc(hour: number): string {
		// Each hour is 15° of the circle. 0h at top (−90°).
		const startAngle = (hour / 24) * 360 - 90;
		const endAngle = ((hour + 1) / 24) * 360 - 90;
		const count = hours[hour]?.points ?? 0;
		const t = count / maxHourPoints;
		const r = RAD_INNER + (RAD_R - RAD_INNER) * t;
		const cx = 80;
		const cy = 80;
		const sa = (startAngle * Math.PI) / 180;
		const ea = (endAngle * Math.PI) / 180;
		const x1 = cx + r * Math.cos(sa);
		const y1 = cy + r * Math.sin(sa);
		const x2 = cx + r * Math.cos(ea);
		const y2 = cy + r * Math.sin(ea);
		const x1i = cx + RAD_INNER * Math.cos(sa);
		const y1i = cy + RAD_INNER * Math.sin(sa);
		const x2i = cx + RAD_INNER * Math.cos(ea);
		const y2i = cy + RAD_INNER * Math.sin(ea);
		const largeArc = endAngle - startAngle > 180 ? 1 : 0;
		return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${x2i} ${y2i} A ${RAD_INNER} ${RAD_INNER} 0 ${largeArc} 0 ${x1i} ${y1i} Z`;
	}

	// ── Speed histogram ──────────────────────────────────────────────────────
	let maxSpeedCount = $derived(Math.max(1, ...speedBuckets.map((b) => b.count)));
	let speedBarW = $derived(320 / Math.max(1, speedBuckets.length));

	// ── Mode donut ───────────────────────────────────────────────────────────
	// Derived from the speed buckets' dominant modes is misleading; instead we
	// aggregate distance by transport_mode directly from points.
	let modeDistances = $derived.by(() => {
		const m = new Map<string, number>();
		for (const p of points) {
			const mode = p.transport_mode ?? 'unknown';
			m.set(mode, (m.get(mode) ?? 0) + (p.distance ?? 0));
		}
		return Array.from(m.entries())
			.map(([mode, distance]) => ({ mode, distance }))
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
</script>

{#if points.length > 0}
	<!-- Activity calendar -->
	<section class="mb-8 w-full rounded-lg border p-4 bg-card border-border">
		<h3 class="mb-3 text-lg font-semibold text-foreground">📅 Activity</h3>
		<div class="overflow-x-auto">
			<svg width={CAL_W} height={CAL_H + 16} role="img" aria-label="Activity calendar">
				{#each displayCal as day, i (day.date)}
					{@const pos = cellPosition(i)}
					<rect
						x={pos.x}
						y={pos.y}
						width={CELL}
						height={CELL}
						rx="2"
						fill={calColor(day.distance)}
					>
						<title>{day.date}: {fmtDistance(day.distance)}, {day.points} pts</title>
					</rect>
				{/each}
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
		</div>
	</section>

	<div class="mb-8 flex w-full flex-col gap-4 md:flex-row">
		<!-- Time-of-day radial -->
		<section class="flex-1 rounded-lg border p-4 bg-card border-border">
			<h3 class="mb-3 text-lg font-semibold text-foreground">🕓 Time of day</h3>
			<div class="flex justify-center">
				<svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Time of day distribution">
					{#each hours as h (h.hour)}
						<path
							d={hourArc(h.hour)}
							fill={h.points > 0 ? 'rgba(37,99,235,0.6)' : 'rgba(120,120,120,0.08)'}
						>
							<title>{h.hour}:00 — {h.points} points</title>
						</path>
					{/each}
				</svg>
			</div>
			<p class="mt-2 text-center text-xs text-muted-foreground">When you move most</p>
		</section>

		<!-- Speed histogram -->
		<section class="flex-1 rounded-lg border p-4 bg-card border-border">
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
					>
						<title>{b.label} km/h: {b.count} pts</title>
					</rect>
					<text x={i * barW + barW / 2} y={133} text-anchor="middle" font-size="7" fill="currentColor" class="text-muted-foreground">
						{b.label}
					</text>
				{/each}
			</svg>
			<p class="mt-1 text-center text-xs text-muted-foreground">km/h, coloured by dominant mode</p>
		</section>

		<!-- Mode donut -->
		<section class="flex-1 rounded-lg border p-4 bg-card border-border">
			<h3 class="mb-3 text-lg font-semibold text-foreground">🚗 Mode share</h3>
			<div class="flex items-center gap-4">
				<svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Transport mode share by distance">
					{#if segments.length === 0}
						<circle cx="60" cy="60" r="50" fill="rgba(120,120,120,0.1)" />
					{:else}
						{#each segments as seg (seg.mode)}
							<path d={donutPath(seg.start, seg.end)} fill={modeColor(seg.mode)}>
								<title>{seg.mode}: {fmtDistance(seg.distance)} ({(seg.frac * 100).toFixed(0)}%)</title>
							</path>
						{/each}
						<circle cx="60" cy="60" r="26" fill="var(--color-card, #fff)" />
					{/if}
				</svg>
				<div class="flex-1 space-y-1">
					{#each modeDistances.slice(0, 5) as seg (seg.mode)}
						<div class="flex items-center gap-2 text-xs">
							<span class="inline-block h-2.5 w-2.5 rounded-sm" style="background:{modeColor(seg.mode)}"></span>
							<span class="text-muted-foreground capitalize">{seg.mode}</span>
							<span class="ml-auto text-foreground">{fmtDistance(seg.distance)}</span>
						</div>
					{/each}
				</div>
			</div>
		</section>
	</div>

	<!-- Records & streaks -->
	<section class="mb-8 w-full rounded-lg border p-4 bg-card border-border">
		<h3 class="mb-3 text-lg font-semibold text-foreground">🏆 Records & streaks</h3>
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
			<div>
				<div class="text-2xl font-bold text-foreground">{records.longestStreak}</div>
				<div class="text-xs text-muted-foreground">day longest streak</div>
			</div>
			<div>
				<div class="text-2xl font-bold text-foreground">{records.currentStreak}</div>
				<div class="text-xs text-muted-foreground">day current streak</div>
			</div>
			<div>
				<div class="text-2xl font-bold text-foreground">{records.totalDaysTracked}</div>
				<div class="text-xs text-muted-foreground">days tracked</div>
			</div>
			<div>
				<div class="text-2xl font-bold text-foreground">
					{records.longestDayDistance ? fmtDistance(records.longestDayDistance.distance) : '—'}
				</div>
				<div class="text-xs text-muted-foreground">biggest day</div>
			</div>
			<div>
				<div class="text-2xl font-bold text-foreground">
					{records.busiestDay ? records.busiestDay.points : '—'}
				</div>
				<div class="text-xs text-muted-foreground">pts busiest day</div>
			</div>
		</div>
	</section>
{/if}
