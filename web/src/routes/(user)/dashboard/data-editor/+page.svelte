<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fluxbase } from '$lib/fluxbase';
	import {
		getPoints,
		getPointCount,
		deletePoints,
		getExclusionZones,
		getHomeAddress,
		type DataPoint,
		type ExclusionZone
	} from '$lib/services/tracker-data.service';
	import {
		Database,
		Trash2,
		Loader2,
		AlertTriangle,
		MousePointer2,
		Square,
		Home,
		X
	} from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	type SelectedPoint = DataPoint & { selected: boolean; excluded: boolean };

	let isLoading = $state(true);
	let mapContainer: HTMLDivElement;
	let map: any = null;
	let L: any = null;

	let allPoints = $state<SelectedPoint[]>([]);
	let totalCount = $state(0);
	let exclusionZones = $state<ExclusionZone[]>([]);
	let homeAddress = $state<{ lat: number; lng: number } | null>(null);

	let startDate = $state('');
	let endDate = $state('');
	let selectedCount = $state(0);
	let isDeleting = $state(false);
	let showDeleteConfirm = $state(false);

	type SelectionMode = 'none' | 'point' | 'box';
	let selectionMode = $state<SelectionMode>('none');
	let isDrawing = $state(false);
	let drawStart = $state<{ lat: number; lng: number } | null>(null);
	let boxLayer: any = null;

	let pointLayers = $state<Map<string, any>>(new Map());

	const COLOR_BY_MODE: Record<string, string> = {
		walking: '#22c55e',
		driving: '#3b82f6',
		cycling: '#f59e0b',
		flying: '#a855f7',
		train: '#ec4899',
		unknown: '#6b7280'
	};

	onMount(async () => {
		const now = new Date();
		const weekAgo = new Date(now.getTime() - 7 * 86400000);
		endDate = now.toISOString().slice(0, 10);
		startDate = weekAgo.toISOString().slice(0, 10);

		L = (await import('leaflet')).default;
		await loadData();
		initMap();
	});

	onDestroy(() => {
		map?.remove();
	});

	async function loadData() {
		isLoading = true;
		try {
			const { data: userData } = await fluxbase.auth.getUser();
			const userId = userData?.user?.id;
			if (!userId) return;

			const [points, count, zones, home] = await Promise.all([
				getPoints(userId, startDate, endDate),
				getPointCount(userId, startDate, endDate),
				getExclusionZones(),
				getHomeAddress()
			]);

			totalCount = count;
			exclusionZones = zones;
			homeAddress = home;

			// Mark excluded points (inside exclusion zone)
			allPoints = points.map((p) => ({
				...p,
				selected: false,
				excluded: isExcluded(p)
			}));

			selectedCount = 0;
		} catch (err) {
			console.error('Failed to load data:', err);
			toast.error('Failed to load data points');
		} finally {
			isLoading = false;
		}
	}

	function isExcluded(p: DataPoint): boolean {
		return exclusionZones.some((z) => {
			const dx = p.lat - z.location.lat;
			const dy = p.lng - z.location.lng;
			const dist = Math.sqrt(dx * dx + dy * dy) * 111000; // rough meters
			return dist < z.radius;
		});
	}

	function initMap() {
		if (!mapContainer || !L) return;

		map = L.map(mapContainer, { scrollWheelZoom: true });
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap contributors',
			maxZoom: 18
		}).addTo(map);

		drawPoints();
		drawExclusionZones();
		drawHomeAddress();

		// Box selection
		map.on('mousedown', (e: any) => {
			if (selectionMode !== 'box') return;
			isDrawing = true;
			drawStart = { lat: e.latlng.lat, lng: e.latlng.lng };
			if (boxLayer) {
				map.removeLayer(boxLayer);
				boxLayer = null;
			}
		});

		map.on('mousemove', (e: any) => {
			if (!isDrawing || !drawStart) return;
			if (boxLayer) map.removeLayer(boxLayer);
			boxLayer = L.rectangle(
				[
					[drawStart.lat, drawStart.lng],
					[e.latlng.lat, e.latlng.lng]
				],
				{ color: '#ef4444', weight: 2, fillOpacity: 0.1, dashArray: '4 4' }
			).addTo(map);
		});

		map.on('mouseup', (e: any) => {
			if (!isDrawing || !drawStart) return;
			isDrawing = false;

			const bounds = L.latLngBounds(drawStart, e.latlng);
			if (boxLayer) {
				map.removeLayer(boxLayer);
				boxLayer = null;
			}

			// Select all points inside the box
			let count = 0;
			for (const p of allPoints) {
				const inside = bounds.contains(L.latLng(p.lat, p.lng));
				if (inside && !p.selected) {
					p.selected = true;
					count++;
				}
			}
			selectedCount = allPoints.filter((p) => p.selected).length;
			drawPoints();
			drawStart = null;

			if (count > 0) toast.info(`Selected ${count} points`);
		});

		// Fit bounds to data
		if (allPoints.length > 0) {
			const latlngs = allPoints.map((p) => [p.lat, p.lng]);
			map.fitBounds(L.latLngBounds(latlngs as [number, number][]), { padding: [40, 40] });
		} else {
			map.setView([0, 0], 2);
		}

		setTimeout(() => map?.invalidateSize(), 200);
	}

	function drawPoints() {
		if (!map || !L) return;

		// Clear existing
		pointLayers.forEach((layer) => map.removeLayer(layer));
		pointLayers = new Map();

		for (const p of allPoints) {
			const color = p.selected
				? '#ef4444'
				: p.excluded
					? '#9ca3af'
					: COLOR_BY_MODE[p.activity_type || 'unknown'] || '#6b7280';

			const marker = L.circleMarker([p.lat, p.lng], {
				radius: p.selected ? 6 : 4,
				fillColor: color,
				color: p.selected ? '#dc2626' : '#ffffff',
				weight: p.selected ? 2 : 1,
				fillOpacity: p.excluded ? 0.2 : 0.8,
				opacity: p.excluded ? 0.3 : 1
			});

			if (selectionMode === 'point') {
				marker.on('click', () => {
					const found = allPoints.find((ap) => ap.recorded_at === p.recorded_at);
					if (found) {
						found.selected = !found.selected;
						selectedCount = allPoints.filter((ap) => ap.selected).length;
						drawPoints();
					}
				});
			}

			marker.bindPopup(
				`<div style="font-size:12px">
					<strong>${new Date(p.recorded_at).toLocaleString()}</strong><br>
					${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}<br>
					${p.activity_type ? `Mode: ${p.activity_type}` : ''}<br>
					${p.speed ? `Speed: ${p.speed.toFixed(1)} km/h` : ''}<br>
					${p.accuracy ? `Accuracy: ±${p.accuracy.toFixed(0)}m` : ''}
				</div>`
			);

			marker.addTo(map);
			pointLayers.set(p.recorded_at, marker);
		}
	}

	function drawExclusionZones() {
		if (!map || !L) return;

		for (const zone of exclusionZones) {
			L.circle([zone.location.lat, zone.location.lng], {
				radius: zone.radius,
				color: '#ef4444',
				fillColor: '#ef4444',
				fillOpacity: 0.05,
				weight: 1,
				dashArray: '5 5'
			})
				.bindTooltip(`🚫 ${zone.name} (${zone.radius}m)`)
				.addTo(map);
		}
	}

	function drawHomeAddress() {
		if (!map || !L || !homeAddress) return;

		L.circleMarker([homeAddress.lat, homeAddress.lng], {
			radius: 8,
			fillColor: '#3b82f6',
			color: '#ffffff',
			weight: 2,
			fillOpacity: 1
		})
			.bindTooltip('🏠 Home')
			.addTo(map);
	}

	// ── Selection controls ──
	function setMode(mode: SelectionMode) {
		selectionMode = selectionMode === mode ? 'none' : mode;
		map.getContainer().style.cursor = selectionMode === 'box' ? 'crosshair' : '';
		drawPoints();
	}

	function selectAllInView() {
		for (const p of allPoints) {
			p.selected = true;
		}
		selectedCount = allPoints.length;
		drawPoints();
		toast.info(`Selected all ${allPoints.length} points`);
	}

	function clearSelection() {
		for (const p of allPoints) {
			p.selected = false;
		}
		selectedCount = 0;
		drawPoints();
	}

	async function handleDelete() {
		const toDelete = allPoints.filter((p) => p.selected);
		if (toDelete.length === 0) return;

		isDeleting = true;
		try {
			const { data: userData } = await fluxbase.auth.getUser();
			const userId = userData?.user?.id;
			if (!userId) return;

			const timestamps = toDelete.map((p) => p.recorded_at);
			const deleted = await deletePoints(userId, timestamps);

			allPoints = allPoints.filter((p) => !p.selected);
			totalCount -= deleted;
			selectedCount = 0;
			drawPoints();

			toast.success(`Permanently deleted ${deleted} points`);
		} catch (err) {
			console.error('Delete failed:', err);
			toast.error('Failed to delete points');
		} finally {
			isDeleting = false;
			showDeleteConfirm = false;
		}
	}

	async function refreshData() {
		await loadData();
		drawPoints();
		drawExclusionZones();
		drawHomeAddress();
		if (map && allPoints.length > 0) {
			const latlngs = allPoints.map((p) => [p.lat, p.lng]);
			map.fitBounds(L.latLngBounds(latlngs as [number, number][]), { padding: [40, 40] });
		}
	}

	// Quick date presets
	function setPreset(days: number) {
		const now = new Date();
		endDate = now.toISOString().slice(0, 10);
		startDate = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
		refreshData();
	}

	const selectedPoints = $derived(allPoints.filter((p) => p.selected));
</script>

<svelte:head>
	<title>Data Editor · Wayli</title>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<div class="flex h-[calc(100vh-4rem)] flex-col">
	<!-- Top toolbar -->
	<div class="border-border bg-card flex flex-wrap items-center gap-3 border-b px-4 py-3">
		<div class="flex items-center gap-2">
			<Database class="text-primary h-5 w-5" />
			<h1 class="text-foreground text-lg font-bold">Data Editor</h1>
		</div>

		<div class="flex items-center gap-2">
			<input
				type="date"
				bind:value={startDate}
				onchange={refreshData}
				class="border-border rounded-lg border bg-transparent px-2 py-1 text-sm"
			/>
			<span class="text-muted-foreground text-sm">→</span>
			<input
				type="date"
				bind:value={endDate}
				onchange={refreshData}
				class="border-border rounded-lg border bg-transparent px-2 py-1 text-sm"
			/>
		</div>

		<div class="flex items-center gap-1">
			<button
				type="button"
				onclick={() => setPreset(7)}
				class="text-muted-foreground hover:text-foreground rounded px-2 py-1 text-xs hover:bg-muted"
				>7d</button
			>
			<button
				type="button"
				onclick={() => setPreset(30)}
				class="text-muted-foreground hover:text-foreground rounded px-2 py-1 text-xs hover:bg-muted"
				>30d</button
			>
			<button
				type="button"
				onclick={() => setPreset(90)}
				class="text-muted-foreground hover:text-foreground rounded px-2 py-1 text-xs hover:bg-muted"
				>90d</button
			>
		</div>

		<div class="flex-1"></div>

		<!-- Selection mode buttons -->
		<div class="flex items-center gap-1">
			<button
				type="button"
				onclick={() => setMode('point')}
				class="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors {selectionMode ===
				'point'
					? 'bg-primary text-primary-foreground border-primary'
					: 'border-border text-muted-foreground hover:text-foreground'}"
			>
				<MousePointer2 class="h-3 w-3" /> Point
			</button>
			<button
				type="button"
				onclick={() => setMode('box')}
				class="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors {selectionMode ===
				'box'
					? 'bg-primary text-primary-foreground border-primary'
					: 'border-border text-muted-foreground hover:text-foreground'}"
			>
				<Square class="h-3 w-3" /> Box
			</button>
		</div>

		<button
			type="button"
			onclick={selectAllInView}
			disabled={allPoints.length === 0}
			class="border-border text-muted-foreground hover:text-foreground rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
		>
			Select All
		</button>
		<button
			type="button"
			onclick={clearSelection}
			disabled={selectedCount === 0}
			class="border-border text-muted-foreground hover:text-foreground rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
		>
			<X class="inline h-3 w-3" /> Clear
		</button>
	</div>

	<!-- Map + side panel -->
	<div class="flex flex-1 overflow-hidden">
		<!-- Map -->
		<div class="relative flex-1">
			{#if isLoading}
				<div class="absolute inset-0 flex items-center justify-center bg-muted/50">
					<div class="text-muted-foreground flex flex-col items-center gap-2">
						<Loader2 class="h-8 w-8 animate-spin" />
						<span class="text-sm">Loading {totalCount} points...</span>
					</div>
				</div>
			{/if}
			<div bind:this={mapContainer} class="h-full w-full"></div>

			<!-- Legend -->
			{#if !isLoading}
				<div
					class="bg-card/90 border-border absolute bottom-4 left-4 rounded-lg border p-3 text-xs backdrop-blur-md"
				>
					<div class="mb-1 font-semibold text-foreground">Transport mode</div>
					{#each Object.entries(COLOR_BY_MODE) as [mode, color]}
						<div class="flex items-center gap-2 py-0.5">
							<div class="h-2 w-2 rounded-full" style="background:{color}"></div>
							<span class="text-muted-foreground capitalize">{mode}</span>
						</div>
					{/each}
					<div class="mt-1 flex items-center gap-2 border-t border-border pt-1">
						<div class="h-2 w-2 rounded-full bg-gray-400 opacity-30"></div>
						<span class="text-muted-foreground">Excluded</span>
					</div>
					<div class="flex items-center gap-2 py-0.5">
						<div class="h-2 w-2 rounded-full bg-red-500"></div>
						<span class="text-muted-foreground">Selected</span>
					</div>
				</div>
			{/if}
		</div>

		<!-- Side panel -->
		<div class="border-border bg-card w-72 overflow-y-auto border-l">
			<!-- Stats -->
			<div class="border-border border-b p-4">
				<div class="text-muted-foreground text-xs">Showing date range</div>
				<div class="text-foreground text-sm font-medium">
					{new Date(startDate).toLocaleDateString()} → {new Date(endDate).toLocaleDateString()}
				</div>
				<div class="text-muted-foreground mt-2 text-xs">
					{allPoints.length} loaded (of {totalCount} total)
				</div>
			</div>

			<!-- Selection info -->
			<div class="border-border border-b p-4">
				{#if selectedCount > 0}
					<div class="mb-2 flex items-center gap-2">
						<div class="bg-red-500/10 inline-flex h-8 w-8 items-center justify-center rounded-full">
							<span class="text-red-500 text-sm font-bold">{selectedCount}</span>
						</div>
						<span class="text-foreground text-sm font-medium">selected</span>
					</div>

					{#if selectedPoints.length > 0}
						<div class="text-muted-foreground mb-2 text-xs">
							{new Date(selectedPoints[0].recorded_at).toLocaleString()}
							{#if selectedCount > 1}
								→ {new Date(selectedPoints[selectedPoints.length - 1].recorded_at).toLocaleString()}
							{/if}
						</div>
					{/if}

					<button
						type="button"
						onclick={() => (showDeleteConfirm = true)}
						disabled={isDeleting}
						class="bg-destructive hover:bg-destructive/90 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
					>
						{#if isDeleting}
							<Loader2 class="h-4 w-4 animate-spin" /> Deleting...
						{:else}
							<Trash2 class="h-4 w-4" /> Delete {selectedCount} points
						{/if}
					</button>
				{:else}
					<div class="text-muted-foreground py-4 text-center text-xs">
						{#if selectionMode === 'none'}
							Select a mode (Point or Box) to start selecting points for deletion.
						{:else}
							{selectionMode === 'box'
								? 'Click and drag on the map to select points.'
								: 'Click on individual points to select them.'}
						{/if}
					</div>
				{/if}
			</div>

			<!-- Exclusion zones -->
			{#if exclusionZones.length > 0}
				<div class="p-4">
					<div class="text-muted-foreground mb-2 text-xs font-medium">
						Exclusion zones ({exclusionZones.length})
					</div>
					<div class="space-y-1">
						{#each exclusionZones as zone (zone.name)}
							<div
								class="border-border flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
							>
								<div class="bg-red-500/10 flex h-2 w-2 flex-shrink-0 rounded-full"></div>
								<span class="text-foreground">{zone.name}</span>
								<span class="text-muted-foreground ml-auto">{zone.radius}m</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Home address -->
			{#if homeAddress}
				<div class="border-border border-t p-4">
					<div class="flex items-center gap-2 text-xs">
						<Home class="h-3.5 w-3.5 text-blue-500" />
						<span class="text-muted-foreground">Home address set</span>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Delete confirmation modal -->
{#if showDeleteConfirm}
	<div
		class="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
	>
		<div class="border-border bg-card w-full max-w-md rounded-2xl border p-6 shadow-2xl">
			<div class="mb-4 flex items-center gap-3">
				<div class="bg-destructive/10 flex h-12 w-12 items-center justify-center rounded-full">
					<AlertTriangle class="h-6 w-6 text-destructive" />
				</div>
				<div>
					<h2 class="text-foreground text-lg font-bold">Delete {selectedCount} points?</h2>
					<p class="text-muted-foreground text-sm">This cannot be undone.</p>
				</div>
			</div>

			{#if selectedPoints.length > 0}
				<div class="bg-muted/50 mb-4 rounded-lg p-3 text-xs">
					<div class="text-muted-foreground mb-1">Points to delete:</div>
					<div class="text-foreground">
						{new Date(selectedPoints[0].recorded_at).toLocaleString()}
						{#if selectedCount > 1}
							→ {new Date(selectedPoints[selectedPoints.length - 1].recorded_at).toLocaleString()}
						{/if}
					</div>
				</div>
			{/if}

			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (showDeleteConfirm = false)}
					class="border-border text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={handleDelete}
					disabled={isDeleting}
					class="bg-destructive hover:bg-destructive/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
				>
					{#if isDeleting}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<Trash2 class="h-4 w-4" />
					{/if}
					Delete Permanently
				</button>
			</div>
		</div>
	</div>
{/if}
