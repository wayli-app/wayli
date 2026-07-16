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
		Square,
		Home,
		X,
		Plus,
		ScatterChart
	} from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { translate } from '$lib/i18n';

	type SelectedPoint = DataPoint & { selected: boolean; excluded: boolean };

	let isLoading = $state(true);
	let mapContainer: HTMLDivElement;
	let map: any = null;
	let L: any = null;

	let allPoints = $state<SelectedPoint[]>([]);
	let totalCount = $state(0);
	let t = $derived($translate);
	let exclusionZones = $state<ExclusionZone[]>([]);
	let homeAddress = $state<{ lat: number; lng: number } | null>(null);

	let startDate = $state('');
	let endDate = $state('');
	let selectedCount = $state(0);
	let isDeleting = $state(false);
	let showDeleteConfirm = $state(false);
	let editingPoint = $state<DataPoint | null>(null);

	type SelectionMode = 'none' | 'box' | 'add';
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
			toast.error(t('dataEditor.loadFailed'));
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
		const isDark = document.documentElement.classList.contains('dark');
		L.tileLayer(
			isDark
				? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
				: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
			{
				attribution: isDark
					? '&copy; OpenStreetMap &copy; CARTO'
					: '&copy; OpenStreetMap contributors',
				maxZoom: 18
			}
		).addTo(map);

		drawPoints();
		drawExclusionZones();
		drawHomeAddress();

		// Box selection: shift-drag always works, or box mode disables dragging
		map.on('mousedown', (e: any) => {
			if (selectionMode === 'add') {
				// Add a point at the clicked location
				addPointAt(e.latlng.lat, e.latlng.lng);
				return;
			}
			if (selectionMode !== 'box' && !e.originalEvent.shiftKey) return;
			isDrawing = true;
			drawStart = { lat: e.latlng.lat, lng: e.latlng.lng };
			map.dragging.disable();
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
			map.dragging.enable();

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

			if (count > 0) {
				selectedCount = allPoints.filter((p) => p.selected).length;
			}
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

		const draggable = selectionMode === 'none';

		for (const p of allPoints) {
			const color = p.selected
				? '#ef4444'
				: p.excluded
					? '#9ca3af'
					: COLOR_BY_MODE[p.activity_type || 'unknown'] || '#6b7280';
			const radius = p.selected ? 6 : 4;

			const icon = L.divIcon({
				className: '',
				html: `<div style="
					width:${radius * 2}px;height:${radius * 2}px;
					border-radius:50%;
					background:${color};
					border:${p.selected ? 2 : 1}px solid ${p.selected ? '#dc2626' : '#fff'};
					opacity:${p.excluded ? 0.3 : 0.85};
					cursor:${draggable ? 'grab' : 'pointer'};"></div>`,
				iconSize: [radius * 2, radius * 2],
				iconAnchor: [radius, radius]
			});

			const marker = L.marker([p.lat, p.lng], { icon, draggable, riseOnHover: true });

			marker.on('click', () => {
				if (selectionMode === 'box' || selectionMode === 'add') return;
				const found = allPoints.find((ap) => ap.recorded_at === p.recorded_at);
				if (found) {
					editingPoint = { ...found };
				}
			});

			marker.on('dragstart', () => {
				const found = allPoints.find((ap) => ap.recorded_at === p.recorded_at);
				if (found) {
					marker._prevLatLng = { lat: found.lat, lng: found.lng };
				}
			});

			marker.on('dragend', async () => {
				const ll = marker.getLatLng();
				const found = allPoints.find((ap) => ap.recorded_at === p.recorded_at);
				if (!found) return;

				const prev = marker._prevLatLng ?? { lat: p.lat, lng: p.lng };
				found.lat = ll.lat;
				found.lng = ll.lng;

				try {
					const { data: userData } = await fluxbase.auth.getUser();
					const userId = userData?.user?.id;
					if (!userId) return;

					await fluxbase
						.from('tracker_data')
						.update({ location: { type: 'Point', coordinates: [ll.lng, ll.lat] } })
						.eq('user_id', userId)
						.eq('recorded_at', p.recorded_at);

					if (editingPoint?.recorded_at === p.recorded_at) {
						editingPoint = { ...found };
					}

					toast.success(t('dataEditor.pointMoved'), {
						action: {
							label: t('common.undo'),
							onClick: async () => {
								try {
									await fluxbase
										.from('tracker_data')
										.update({
											location: { type: 'Point', coordinates: [prev.lng, prev.lat] }
										})
										.eq('user_id', userId)
										.eq('recorded_at', p.recorded_at);

									found.lat = prev.lat;
									found.lng = prev.lng;
									if (editingPoint?.recorded_at === p.recorded_at) {
										editingPoint = { ...found };
									}
									drawPoints();
									toast.success(t('dataEditor.moveUndone'));
								} catch {
									toast.error(t('dataEditor.undoFailed'));
								}
							}
						}
					});
				} catch (err) {
					console.error('Move failed:', err);
					toast.error(t('dataEditor.moveFailed'));
				}
			});

			marker.bindPopup(
				`<div style="font-size:12px">
				<strong>${new Date(p.recorded_at).toLocaleString()}</strong><br>
				${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}<br>
				${p.activity_type ? `${t('dataEditor.transportMode')}: ${p.activity_type}` : ''}<br>
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
		if (map) {
			map.getContainer().style.cursor =
				selectionMode === 'box' ? 'crosshair' : selectionMode === 'add' ? 'copy' : '';
			if (selectionMode === 'box') {
				map.dragging.disable();
			} else {
				map.dragging.enable();
			}
		}
		drawPoints();
	}

	async function addPointAt(lat: number, lng: number) {
		try {
			const { data: userData } = await fluxbase.auth.getUser();
			const userId = userData?.user?.id;
			if (!userId) return;

			const now = new Date().toISOString();
			const { error } = await fluxbase.from('tracker_data').insert({
				user_id: userId,
				tracker_type: 'manual',
				recorded_at: now,
				location: { type: 'Point', coordinates: [lng, lat] },
				country_code: null,
				speed: null,
				distance: 0,
				time_spent: 0
			});

			if (error) {
				toast.error(t('dataEditor.addPointFailed'));
				return;
			}

			// Add to local state
			allPoints = [
				...allPoints,
				{
					recorded_at: now,
					lat,
					lng,
					speed: null,
					distance: null,
					accuracy: null,
					country_code: null,
					activity_type: null,
					selected: false,
					excluded: false
				}
			];
			totalCount++;
			drawPoints();
			toast.success(t('dataEditor.pointAdded'));
		} catch (err) {
			console.error('Add point failed:', err);
			toast.error(t('dataEditor.addPointFailed'));
		}
	}

	let showSampleModal = $state(false);
	let samplePercent = $state(50);
	let sampleMode = $state<'percent' | 'distance'>('percent');
	let sampleMinDistance = $state(50);
	let sampleMinTime = $state(30);

	async function applySampling() {
		const selected = allPoints.filter((p) => p.selected);
		if (selected.length === 0) {
			toast.info(t('dataEditor.selectPointsFirst'));
			showSampleModal = false;
			return;
		}

		// Keep only the selected percentage of selected points
		const keepCount = Math.ceil(selected.length * (samplePercent / 100));
		const stride = Math.ceil(selected.length / keepCount);
		const toRemove = selected.filter((_, i) => i % stride !== 0);

		if (toRemove.length === 0) {
			toast.info(t('dataEditor.nothingToSample'));
			showSampleModal = false;
			return;
		}

		showDeleteConfirm = true;
		showSampleModal = false;
		// Mark only the toRemove points as selected for deletion
		for (const p of allPoints) p.selected = false;
		for (const p of toRemove) {
			const found = allPoints.find((ap) => ap.recorded_at === p.recorded_at);
			if (found) found.selected = true;
		}
		selectedCount = toRemove.length;
		drawPoints();
		toast.info(
			t('dataEditor.willDeletePoints')
				.replace('{delete}', String(toRemove.length))
				.replace('{keep}', String(selected.length - toRemove.length))
				.replace('{total}', String(selected.length))
		);
	}

	function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
		const R = 6371000;
		const dLat = ((lat2 - lat1) * Math.PI) / 180;
		const dLng = ((lng2 - lng1) * Math.PI) / 180;
		const a =
			Math.sin(dLat / 2) ** 2 +
			Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
		return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	}

	async function applyDistanceSampling() {
		const selected = allPoints.filter((p) => p.selected);
		if (selected.length === 0) {
			toast.info(t('dataEditor.selectPointsFirst'));
			showSampleModal = false;
			return;
		}

		// Sort by recorded_at to ensure correct order
		selected.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));

		// Walk through points, keeping only those that meet the threshold
		const toKeep: typeof selected = [selected[0]];
		for (let i = 1; i < selected.length; i++) {
			const last = toKeep[toKeep.length - 1];
			const curr = selected[i];

			let keep = true;
			if (sampleMinDistance > 0) {
				const dist = haversineMeters(last.lat, last.lng, curr.lat, curr.lng);
				if (dist < sampleMinDistance) keep = false;
			}
			if (keep && sampleMinTime > 0) {
				const dt =
					(new Date(curr.recorded_at).getTime() - new Date(last.recorded_at).getTime()) / 1000;
				if (dt < sampleMinTime) keep = false;
			}

			if (keep) toKeep.push(curr);
		}

		const keepIds = new Set(toKeep.map((p) => p.recorded_at));
		const toRemove = selected.filter((p) => !keepIds.has(p.recorded_at));

		if (toRemove.length === 0) {
			toast.info(t('dataEditor.allMeetThreshold'));
			showSampleModal = false;
			return;
		}

		showDeleteConfirm = true;
		showSampleModal = false;
		for (const p of allPoints) p.selected = false;
		for (const p of toRemove) {
			const found = allPoints.find((ap) => ap.recorded_at === p.recorded_at);
			if (found) found.selected = true;
		}
		selectedCount = toRemove.length;
		drawPoints();
		toast.info(
			t('dataEditor.willDeletePoints')
				.replace('{delete}', String(toRemove.length))
				.replace('{keep}', String(toKeep.length))
				.replace('{total}', String(selected.length))
		);
	}

	function handleSampleApply() {
		if (sampleMode === 'percent') {
			applySampling();
		} else {
			applyDistanceSampling();
		}
	}

	function selectAllInView() {
		for (const p of allPoints) {
			p.selected = true;
		}
		selectedCount = allPoints.length;
		drawPoints();
	}

	async function savePointEdits() {
		if (!editingPoint) return;
		const ep = editingPoint;
		try {
			const { data: userData } = await fluxbase.auth.getUser();
			const userId = userData?.user?.id;
			if (!userId) return;

			await fluxbase
				.from('tracker_data')
				.update({
					location: { type: 'Point', coordinates: [ep.lng, ep.lat] }
				})
				.eq('user_id', userId)
				.eq('recorded_at', ep.recorded_at);

			// Update local state
			const idx = allPoints.findIndex((p) => p.recorded_at === ep.recorded_at);
			if (idx >= 0) {
				allPoints[idx] = { ...allPoints[idx], lat: ep.lat, lng: ep.lng };
			}
			drawPoints();
			toast.success(t('dataEditor.pointUpdated'));
			editingPoint = null;
		} catch (err) {
			console.error('Update failed:', err);
			toast.error(t('dataEditor.updateFailed'));
		}
	}

	async function deleteSinglePoint() {
		if (!editingPoint) return;
		const ep = editingPoint;
		try {
			const { data: userData } = await fluxbase.auth.getUser();
			const userId = userData?.user?.id;
			if (!userId) return;

			await fluxbase
				.from('tracker_data')
				.delete()
				.eq('user_id', userId)
				.eq('recorded_at', ep.recorded_at);

			allPoints = allPoints.filter((p) => p.recorded_at !== ep.recorded_at);
			totalCount--;
			drawPoints();
			toast.success(t('dataEditor.pointDeleted'));
			editingPoint = null;
		} catch (err) {
			console.error('Delete failed:', err);
			toast.error(t('dataEditor.deleteFailed'));
		}
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

			toast.success(t('dataEditor.permanentlyDeleted').replace('{count}', String(deleted)));
		} catch (err) {
			console.error('Delete failed:', err);
			toast.error(t('dataEditor.deletePointsFailed'));
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
	<title>{t('dataEditor.pageTitle')}</title>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<div class="flex h-[calc(100vh-4rem)] flex-col">
	<!-- Top toolbar -->
	<div class="border-border bg-card flex flex-wrap items-center gap-3 border-b px-4 py-3">
		<div class="flex items-center gap-2">
			<Database class="text-primary h-5 w-5" />
			<h1 class="text-foreground text-lg font-bold">{t('dataEditor.heading')}</h1>
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

		<!-- Action mode buttons -->
		<div class="flex items-center gap-1">
			<button
				type="button"
				onclick={() => setMode('add')}
				class="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors {selectionMode ===
				'add'
					? 'bg-primary text-primary-foreground border-primary'
					: 'border-border text-muted-foreground hover:text-foreground'}"
			>
				<Plus class="h-3 w-3" />
				{t('dataEditor.addPoint')}
			</button>
			<button
				type="button"
				onclick={() => setMode('box')}
				class="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors {selectionMode ===
				'box'
					? 'bg-primary text-primary-foreground border-primary'
					: 'border-border text-muted-foreground hover:text-foreground'}"
				title="Click-drag to select. Hold Shift to box-select without toggling mode."
			>
				<Square class="h-3 w-3" />
				{t('dataEditor.boxSelect')}
			</button>
			<button
				type="button"
				onclick={() => (showSampleModal = true)}
				disabled={selectedCount === 0}
				class="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 border-border text-muted-foreground hover:text-foreground"
				title="Thin out selected points (keep only a percentage)"
			>
				<ScatterChart class="h-3 w-3" />
				{t('dataEditor.sample')}
			</button>
		</div>

		<button
			type="button"
			onclick={selectAllInView}
			disabled={allPoints.length === 0}
			class="border-border text-muted-foreground hover:text-foreground rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
		>
			{t('dataEditor.selectAll')}
		</button>
		<button
			type="button"
			onclick={clearSelection}
			disabled={selectedCount === 0}
			class="border-border text-muted-foreground hover:text-foreground rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
		>
			<X class="inline h-3 w-3" />
			{t('dataEditor.clear')}
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
						<span class="text-sm"
							>{t('dataEditor.loadingPoints').replace('{count}', String(totalCount))}</span
						>
					</div>
				</div>
			{/if}
			<div bind:this={mapContainer} class="h-full w-full"></div>

			<!-- Legend -->
			{#if !isLoading}
				<div
					class="bg-card/90 border-border absolute bottom-4 left-4 rounded-lg border p-3 text-xs backdrop-blur-md"
				>
					<div class="mb-1 font-semibold text-foreground">{t('dataEditor.transportMode')}</div>
					{#each Object.entries(COLOR_BY_MODE) as [mode, color]}
						<div class="flex items-center gap-2 py-0.5">
							<div class="h-2 w-2 rounded-full" style="background:{color}"></div>
							<span class="text-muted-foreground capitalize">{mode}</span>
						</div>
					{/each}
					<div class="mt-1 flex items-center gap-2 border-t border-border pt-1">
						<div class="h-2 w-2 rounded-full bg-gray-400 opacity-30"></div>
						<span class="text-muted-foreground">{t('dataEditor.excluded')}</span>
					</div>
					<div class="flex items-center gap-2 py-0.5">
						<div class="h-2 w-2 rounded-full bg-red-500"></div>
						<span class="text-muted-foreground">{t('dataEditor.selected')}</span>
					</div>
				</div>
			{/if}
		</div>

		<!-- Side panel -->
		<div class="border-border bg-card w-72 overflow-y-auto border-l">
			<!-- Stats -->
			<div class="border-border border-b p-4">
				<div class="text-muted-foreground text-xs">{t('dataEditor.showingDateRange')}</div>
				<div class="text-foreground text-sm font-medium">
					{new Date(startDate).toLocaleDateString()} → {new Date(endDate).toLocaleDateString()}
				</div>
				<div class="text-muted-foreground mt-2 text-xs">
					{t('dataEditor.loadedOfTotal')
						.replace('{loaded}', String(allPoints.length))
						.replace('{total}', String(totalCount))}
				</div>
			</div>

			<!-- Selection info -->
			<div class="border-border border-b p-4">
				{#if selectedCount > 0}
					<div class="mb-2 flex items-center gap-2">
						<div class="bg-red-500/10 inline-flex h-8 w-8 items-center justify-center rounded-full">
							<span class="text-red-500 text-sm font-bold">{selectedCount}</span>
						</div>
						<span class="text-foreground text-sm font-medium">{t('dataEditor.selected')}</span>
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
							<Loader2 class="h-4 w-4 animate-spin" /> {t('dataEditor.deleting')}
						{:else}
							<Trash2 class="h-4 w-4" />
							{t('dataEditor.deletePoints').replace('{count}', String(selectedCount))}
						{/if}
					</button>
				{:else}
					<div class="text-muted-foreground py-4 text-center text-xs">
						{#if selectionMode === 'none'}
							{t('dataEditor.selectModeHint')}
						{:else}
							{selectionMode === 'box'
								? t('dataEditor.boxSelectHint')
								: t('dataEditor.addPointHint')}
						{/if}
					</div>
				{/if}
			</div>

			<!-- Point edit panel -->
			{#if editingPoint}
				<div class="border-border border-t p-4">
					<div class="mb-3 flex items-center justify-between">
						<span class="text-foreground text-xs font-bold uppercase"
							>{t('dataEditor.editPoint')}</span
						>
						<button
							type="button"
							onclick={() => (editingPoint = null)}
							class="text-muted-foreground hover:text-foreground"
						>
							<X class="h-4 w-4" />
						</button>
					</div>
					<div class="text-muted-foreground mb-3 text-[10px]">
						{new Date(editingPoint.recorded_at).toLocaleString()}
					</div>
					<div class="space-y-2">
						<label class="block">
							<span class="text-muted-foreground mb-0.5 block text-[10px]"
								>{t('dataEditor.latitude')}</span
							>
							<input
								type="number"
								bind:value={editingPoint.lat}
								step="0.0001"
								class="border-border focus:ring-primary w-full rounded-lg border bg-transparent px-2 py-1 text-xs focus:ring-2 focus:outline-none"
							/>
						</label>
						<label class="block">
							<span class="text-muted-foreground mb-0.5 block text-[10px]"
								>{t('dataEditor.longitude')}</span
							>
							<input
								type="number"
								bind:value={editingPoint.lng}
								step="0.0001"
								class="border-border focus:ring-primary w-full rounded-lg border bg-transparent px-2 py-1 text-xs focus:ring-2 focus:outline-none"
							/>
						</label>
						{#if editingPoint.speed}
							<div class="text-muted-foreground text-[10px]">
								Speed: {editingPoint.speed.toFixed(1)} km/h
							</div>
						{/if}
						{#if editingPoint.accuracy}
							<div class="text-muted-foreground text-[10px]">
								Accuracy: ±{editingPoint.accuracy.toFixed(0)}m
							</div>
						{/if}
						<div class="flex gap-2 pt-1">
							<button
								type="button"
								onclick={savePointEdits}
								class="bg-primary hover:bg-primary/90 flex-1 rounded-lg px-3 py-1.5 text-xs font-medium text-primary-foreground"
							>
								{t('common.actions.save')}
							</button>
							<button
								type="button"
								onclick={deleteSinglePoint}
								class="bg-destructive hover:bg-destructive/90 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
							>
								{t('common.actions.delete')}
							</button>
						</div>
					</div>
				</div>
			{/if}

			<!-- Exclusion zones -->
			{#if exclusionZones.length > 0}
				<div class="p-4">
					<div class="text-muted-foreground mb-2 text-xs font-medium">
						{t('dataEditor.exclusionZones').replace('{count}', String(exclusionZones.length))}
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
						<span class="text-muted-foreground">{t('dataEditor.homeAddressSet')}</span>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Delete confirmation modal -->
{#if showDeleteConfirm}
	<div
		class="bg-background/80 fixed inset-0 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm"
	>
		<div class="border-border bg-card w-full max-w-md rounded-2xl border p-6 shadow-2xl">
			<div class="mb-4 flex items-center gap-3">
				<div class="bg-destructive/10 flex h-12 w-12 items-center justify-center rounded-full">
					<AlertTriangle class="h-6 w-6 text-destructive" />
				</div>
				<div>
					<h2 class="text-foreground text-lg font-bold">
						{t('dataEditor.deleteConfirmTitle').replace('{count}', String(selectedCount))}
					</h2>
					<p class="text-muted-foreground text-sm">{t('dataEditor.cannotBeUndone')}</p>
				</div>
			</div>

			{#if selectedPoints.length > 0}
				<div class="bg-muted/50 mb-4 rounded-lg p-3 text-xs">
					<div class="text-muted-foreground mb-1">{t('dataEditor.pointsToDelete')}</div>
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
					{t('common.actions.cancel')}
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
					{t('dataEditor.deletePermanently')}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Sample modal -->
{#if showSampleModal}
	<div
		class="bg-background/80 fixed inset-0 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm"
	>
		<div class="border-border bg-card w-full max-w-sm rounded-2xl border p-6 shadow-2xl">
			<h2 class="text-foreground mb-4 text-lg font-bold">{t('dataEditor.sampleDataPoints')}</h2>

			<!-- Mode tabs -->
			<div class="border-border mb-4 flex gap-1 border-b">
				<button
					type="button"
					onclick={() => (sampleMode = 'percent')}
					class="px-3 py-2 text-sm font-medium border-b-2 transition-colors {sampleMode ===
					'percent'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground'}"
				>
					{t('dataEditor.percentage')}
				</button>
				<button
					type="button"
					onclick={() => (sampleMode = 'distance')}
					class="px-3 py-2 text-sm font-medium border-b-2 transition-colors {sampleMode ===
					'distance'
						? 'border-primary text-primary'
						: 'border-transparent text-muted-foreground'}"
				>
					{t('dataEditor.minDistanceTime')}
				</button>
			</div>

			{#if sampleMode === 'percent'}
				<p class="text-muted-foreground mb-3 text-sm">
					Keep only {samplePercent}% of the {selectedCount} selected points.
				</p>
				<input
					type="range"
					min="10"
					max="90"
					step="5"
					bind:value={samplePercent}
					class="mb-2 w-full"
				/>
				<div class="text-muted-foreground mb-4 text-center text-sm font-bold">
					{samplePercent}% = keep {Math.ceil((selectedCount * samplePercent) / 100)} of {selectedCount}
				</div>
			{:else}
				<p class="text-muted-foreground mb-3 text-sm">
					Remove points that are too close to the previous kept point. Set a field to 0 to ignore
					it.
				</p>
				<label class="mb-3 block">
					<span class="text-foreground mb-1 block text-xs font-medium">
						{t('dataEditor.minDistance')}
					</span>
					<input
						type="number"
						min="0"
						step="10"
						bind:value={sampleMinDistance}
						class="border-border focus:ring-primary w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
					/>
				</label>
				<label class="mb-4 block">
					<span class="text-foreground mb-1 block text-xs font-medium">
						{t('dataEditor.minTimeGap')}
					</span>
					<input
						type="number"
						min="0"
						step="5"
						bind:value={sampleMinTime}
						class="border-border focus:ring-primary w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
					/>
				</label>
				<p class="text-muted-foreground mb-4 text-xs">
					Example: 50m + 0s keeps points ≥50m apart (ignores time). 0m + 30s keeps points ≥30s apart
					(ignores distance).
				</p>
			{/if}

			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (showSampleModal = false)}
					class="border-border text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium"
				>
					{t('common.actions.cancel')}
				</button>
				<button
					type="button"
					onclick={handleSampleApply}
					class="bg-primary hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground"
				>
					{t('common.actions.apply')}
				</button>
			</div>
		</div>
	</div>
{/if}
