<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { fluxbase } from '$lib/fluxbase';
	import {
		getPlanItems,
		createPlanItem,
		updatePlanItem,
		deletePlanItem,
		getCollaborators,
		addCollaborator,
		removeCollaborator,
		type PlanItem,
		type Collaborator
	} from '$lib/services/trip-plan.service';
	import {
		ArrowLeft,
		Plus,
		Trash2,
		Clock,
		Calendar,
		X,
		Check,
		Loader2,
		UserPlus,
		Users,
		MapPin,
		Search,
		Star
	} from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import TripMap from '$lib/components/TripMap.svelte';

	type Trip = {
		id: string;
		title: string;
		start_date: string;
		end_date: string;
		description: string | null;
		image_url: string | null;
		metadata: Record<string, any> | null;
		budget_total: number | null;
		budget_currency: string | null;
	};

	const tripId = $derived(page.params.tripId ?? '');
	let trip = $state<Trip | null>(null);
	let items = $state<PlanItem[]>([]);
	let collaborators = $state<Collaborator[]>([]);
	let isLoading = $state(true);
	let selectedDay = $state<number | null>(null);
	let showCollaboratorModal = $state(false);
	let collaboratorUsername = $state('');
	let isAddingCollaborator = $state(false);

	// Map: show planned stops for the selected day as markers + connecting route
	const dayMapPoints = $derived(
		(selectedDay ? items.filter((i) => i.day_number === selectedDay && i.location) : []).map(
			(i) => ({ lat: i.location!.lat, lng: i.location!.lng })
		)
	);

	// Overview map: ALL planned stops across all days, ordered by day then time
	const allMapPoints = $derived(
		items
			.filter((i) => i.location)
			.sort(
				(a, b) =>
					a.day_number - b.day_number || (a.start_time ?? '').localeCompare(b.start_time ?? '')
			)
			.map((i) => ({ lat: i.location!.lat, lng: i.location!.lng }))
	);

	// New item form
	let newItemTitle = $state('');
	let newItemType = $state('activity');
	let newItemTime = $state('');
	let newItemCost = $state('');
	let newItemCurrency = $state('EUR');
	let searchQuery = $state('');
	let searchResults = $state<any[]>([]);
	let isSearching = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	let selectedCoords = $state<{ lat: number; lng: number } | null>(null);
	let selectedAddress = $state<string | null>(null);

	const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
		sightseeing: { icon: '📷', color: '#3b82f6', label: 'Sightseeing' },
		food: { icon: '🍴', color: '#f59e0b', label: 'Food' },
		activity: { icon: '🎯', color: '#22c55e', label: 'Activity' },
		transport: { icon: '🚇', color: '#8b5cf6', label: 'Transport' },
		accommodation: { icon: '🏨', color: '#ec4899', label: 'Stay' },
		rest: { icon: '☕', color: '#6b7280', label: 'Rest' },
		shopping: { icon: '🛍️', color: '#14b8a6', label: 'Shopping' }
	};

	const numDays = $derived(
		trip
			? Math.max(
					1,
					Math.ceil(
						(new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000
					) + 1
				)
			: 1
	);

	const days = $derived(
		Array.from({ length: numDays }, (_, i) => ({
			number: i + 1,
			date: trip ? new Date(new Date(trip.start_date).getTime() + i * 86400000) : null,
			items: items.filter((item) => item.day_number === i + 1)
		}))
	);

	const budgetByCurrency = $derived.by(() => {
		const totals = new Map<string, number>();
		for (const item of items) {
			if (item.cost_estimate) {
				const cur = item.currency || 'EUR';
				totals.set(cur, (totals.get(cur) ?? 0) + item.cost_estimate);
			}
		}
		return [...totals.entries()].map(([currency, total]) => ({ currency, total }));
	});

	onMount(async () => {
		try {
			const { data: tripData } = await fluxbase.from('trips').select('*').eq('id', tripId).single();
			trip = tripData as unknown as Trip;

			if (trip) {
				const [planItems, collabs] = await Promise.all([
					getPlanItems(tripId),
					getCollaborators(tripId)
				]);
				items = planItems;
				collaborators = collabs;
			}
		} catch (err) {
			console.error('Failed to load trip plan:', err);
		} finally {
			isLoading = false;
		}
	});

	async function getCurrentUserId(): Promise<string | null> {
		const { data } = await fluxbase.auth.getUser();
		return data?.user?.id ?? null;
	}

	function formatDateShort(d: Date): string {
		return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
	}

	function formatTime(time: string | null): string {
		if (!time) return '';
		return time.slice(0, 5);
	}

	// ── Day selection ──
	function openDay(dayNumber: number) {
		selectedDay = dayNumber;
		resetNewItemForm();
	}

	function resetNewItemForm() {
		newItemTitle = '';
		newItemType = 'activity';
		newItemTime = '';
		newItemCost = '';
		newItemCurrency = trip?.budget_currency || 'EUR';
		searchQuery = '';
		searchResults = [];
		selectedCoords = null;
		selectedAddress = null;
	}

	// ── Pelias search ──
	async function handleSearch() {
		if (searchTimer) clearTimeout(searchTimer);
		if (!searchQuery.trim() || searchQuery.length < 3) {
			searchResults = [];
			return;
		}
		searchTimer = setTimeout(async () => {
			isSearching = true;
			try {
				const { getPeliasEndpoint } = await import('$lib/services/external/pelias.service');
				const endpoint = await getPeliasEndpoint();
				const res = await fetch(
					`${endpoint}/v1/autocomplete?text=${encodeURIComponent(searchQuery)}&size=5`,
					{ headers: { Accept: 'application/json' } }
				);
				const data = await res.json();
				searchResults = data.features ?? [];
			} catch {
				searchResults = [];
			} finally {
				isSearching = false;
			}
		}, 300);
	}

	function selectSearchResult(feature: any) {
		const [lng, lat] = feature.geometry.coordinates;
		newItemTitle = feature.properties.label || feature.properties.name || 'Unnamed';
		searchQuery = newItemTitle;
		searchResults = [];
		selectedCoords = { lat, lng };
		selectedAddress = feature.properties.label ?? null;
	}

	// ── Item management ──
	async function addItem(dayNumber: number) {
		const title = newItemTitle.trim() || 'New item';
		const userId = await getCurrentUserId();

		const newItem = await createPlanItem({
			trip_id: tripId,
			user_id: userId!,
			day_number: dayNumber,
			sort_order: items.filter((i) => i.day_number === dayNumber).length,
			title,
			description: null,
			type: newItemType,
			start_time: newItemTime || null,
			end_time: null,
			location: selectedCoords,
			address: selectedAddress,
			cost_estimate: newItemCost ? parseFloat(newItemCost) : null,
			currency: newItemCurrency,
			booking_url: null,
			booking_status: 'not_booked',
			want_to_visit_id: null,
			notes: null,
			created_by: userId
		});
		items = [...items, newItem];
		resetNewItemForm();
		toast.success('Added to Day ' + dayNumber);
	}

	async function saveItem(item: PlanItem) {
		try {
			await updatePlanItem(item.id, {
				title: item.title,
				description: item.description,
				type: item.type,
				start_time: item.start_time,
				end_time: item.end_time,
				address: item.address,
				cost_estimate: item.cost_estimate,
				currency: item.currency,
				booking_url: item.booking_url,
				booking_status: item.booking_status,
				notes: item.notes
			});
		} catch (err) {
			console.error('Save failed:', err);
			toast.error('Failed to save item');
		}
	}

	async function removeItem(id: string) {
		try {
			await deletePlanItem(id);
			items = items.filter((i) => i.id !== id);
		} catch (err) {
			console.error('Delete failed:', err);
		}
	}

	async function toggleBooking(item: PlanItem) {
		item.booking_status = item.booking_status === 'booked' ? 'not_booked' : 'booked';
		await saveItem(item);
	}

	async function moveItem(item: PlanItem, toDay: number) {
		item.day_number = toDay;
		try {
			await updatePlanItem(item.id, { day_number: toDay });
			items = [...items];
		} catch (err) {
			console.error('Move failed:', err);
		}
	}

	// ── Drag and drop ──
	let draggedItem = $state<PlanItem | null>(null);

	function onDragStart(e: DragEvent, item: PlanItem) {
		draggedItem = item;
		e.dataTransfer?.setData('text/plain', item.id);
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
	}

	function onDrop(e: DragEvent, dayNumber: number) {
		e.preventDefault();
		if (draggedItem && draggedItem.day_number !== dayNumber) {
			moveItem(draggedItem, dayNumber);
		}
		draggedItem = null;
	}

	// ── Collaborators ──
	async function handleAddCollaborator() {
		if (!collaboratorUsername.trim()) return;
		isAddingCollaborator = true;
		try {
			const collab = await addCollaborator(tripId, collaboratorUsername.trim());
			if (collab) {
				collaborators = [...collaborators, collab];
				toast.success(`Added @${collaboratorUsername}`);
				collaboratorUsername = '';
			} else {
				toast.error('User not found');
			}
		} catch {
			toast.error('Failed to add collaborator');
		} finally {
			isAddingCollaborator = false;
		}
	}

	async function handleRemoveCollaborator(id: string) {
		await removeCollaborator(id);
		collaborators = collaborators.filter((c) => c.id !== id);
	}
</script>

<svelte:head>
	<title>{trip ? `${trip.title} · Plan · Wayli` : 'Trip Plan · Wayli'}</title>
</svelte:head>

{#if isLoading}
	<div class="flex min-h-[60vh] items-center justify-center">
		<Loader2 class="text-muted-foreground h-8 w-8 animate-spin" />
	</div>
{:else if trip}
	<!-- Header -->
	<div class="mb-6 space-y-4">
		<div class="flex items-center justify-between">
			<a
				href="/dashboard/travel?trip={tripId}"
				class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
			>
				<ArrowLeft class="h-4 w-4" /> Back to Travel
			</a>
			<a
				href="/dashboard/travel"
				class="border-border text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
			>
				<Calendar class="h-3.5 w-3.5" /> Journal
			</a>
		</div>

		<div class="flex items-start justify-between">
			<div>
				<h1 class="text-foreground text-2xl font-bold">{trip.title}</h1>
				<p class="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
					<Calendar class="h-4 w-4" />
					{new Date(trip.start_date).toLocaleDateString(undefined, {
						month: 'long',
						day: 'numeric'
					})}
					– {new Date(trip.end_date).toLocaleDateString(undefined, {
						month: 'long',
						day: 'numeric',
						year: 'numeric'
					})}
					· {numDays}
					{numDays === 1 ? 'day' : 'days'}
				</p>
			</div>

			<!-- Collaborators -->
			<div class="flex items-center gap-2">
				{#each collaborators as collab (collab.id)}
					<div class="flex items-center gap-1.5" title={`@${collab.username}`}>
						{#if collab.avatar_url}
							<img
								src={collab.avatar_url}
								alt={collab.username}
								class="h-8 w-8 rounded-full border-2 border-border object-cover"
							/>
						{:else}
							<div
								class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-border bg-muted text-xs font-bold"
							>
								{collab.username?.[0]?.toUpperCase() ?? '?'}
							</div>
						{/if}
						<button
							type="button"
							onclick={() => handleRemoveCollaborator(collab.id)}
							class="text-muted-foreground hover:text-destructive"><X class="h-3 w-3" /></button
						>
					</div>
				{/each}
				<button
					type="button"
					onclick={() => (showCollaboratorModal = true)}
					class="border-border text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-full border"
					title="Invite collaborator"
				>
					<UserPlus class="h-4 w-4" />
				</button>
			</div>
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-[1fr_240px]">
		<!-- Calendar grid -->
		<div>
			{#if selectedDay === null}
				<!-- Calendar overview -->
				<div
					class="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7"
				>
					{#each days as day (day.number)}
						<div
							role="button"
							tabindex="0"
							onclick={() => openDay(day.number)}
							onkeydown={(e) => e.key === 'Enter' && openDay(day.number)}
							ondragover={onDragOver}
							ondrop={(e) => onDrop(e, day.number)}
							class="bg-card border-border min-h-32 cursor-pointer rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-md {day
								.items.length > 0
								? 'border-primary/30'
								: ''}"
						>
							<div class="mb-2 flex items-center justify-between">
								<div>
									<div class="text-foreground text-sm font-bold">Day {day.number}</div>
									{#if day.date}
										<div class="text-muted-foreground text-[10px]">{formatDateShort(day.date)}</div>
									{/if}
								</div>
								{#if day.items.length > 0}
									<span
										class="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-bold"
									>
										{day.items.length}
									</span>
								{/if}
							</div>
							<div class="space-y-1">
								{#each day.items.slice(0, 3) as item (item.id)}
									<div
										draggable="true"
										ondragstart={(e) => onDragStart(e, item)}
										class="truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
										style="background: {TYPE_CONFIG[item.type]?.color ?? '#6b7280'}"
										title={item.title}
									>
										{TYPE_CONFIG[item.type]?.icon}
										{#if item.start_time}{formatTime(item.start_time)}
										{/if}
										{item.title}
									</div>
								{/each}
								{#if day.items.length > 3}
									<div class="text-muted-foreground text-[10px]">+{day.items.length - 3} more</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>

				<!-- Overview map: entire route across all days -->
				{#if allMapPoints.length > 1}
					<div class="border-border bg-card mt-4 overflow-hidden rounded-xl border">
						<div class="border-border flex items-center gap-2 border-b px-4 py-2">
							<MapPin class="text-primary h-4 w-4" />
							<span class="text-sm font-semibold text-foreground">Entire route</span>
							<span class="text-muted-foreground ml-auto text-xs"
								>{allMapPoints.length} stops across {numDays} days</span
							>
						</div>
						<TripMap points={allMapPoints} class="h-64" />
					</div>
				{/if}
			{:else}
				<!-- Day detail view -->
				<div class="space-y-4">
					<div class="flex items-center justify-between">
						<button
							type="button"
							onclick={() => (selectedDay = null)}
							class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
						>
							← Back to calendar
						</button>
						<h2 class="text-foreground text-lg font-bold">
							Day {selectedDay}
							{#if days[selectedDay - 1]?.date}
								<span class="text-muted-foreground text-sm font-normal">
									· {days[selectedDay - 1].date!.toLocaleDateString(undefined, {
										weekday: 'long',
										month: 'short',
										day: 'numeric'
									})}
								</span>
							{/if}
						</h2>
					</div>

					<!-- Add item form -->
					<div class="bg-card border-border rounded-xl border p-4">
						<div class="mb-3 flex items-center gap-2">
							<Plus class="text-primary h-4 w-4" />
							<span class="text-sm font-medium text-foreground">Add stop</span>
						</div>
						<!-- Search input -->
						<div class="relative mb-3">
							<Search class="text-muted-foreground absolute top-2.5 left-3 h-4 w-4" />
							<input
								type="text"
								bind:value={searchQuery}
								oninput={handleSearch}
								placeholder="Search for a place..."
								class="border-border focus:ring-primary w-full rounded-lg border bg-transparent py-2 pr-4 pl-10 text-sm focus:ring-2 focus:outline-none"
							/>
							{#if isSearching}
								<Loader2
									class="text-muted-foreground absolute top-2.5 right-3 h-4 w-4 animate-spin"
								/>
							{/if}
						</div>
						{#if searchResults.length > 0}
							<div class="bg-muted/50 mb-3 max-h-40 overflow-y-auto rounded-lg">
								{#each searchResults as result (result.properties?.gid ?? result.properties?.id)}
									<button
										type="button"
										onclick={() => selectSearchResult(result)}
										class="hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
									>
										<MapPin class="text-muted-foreground h-3.5 w-3.5 flex-shrink-0" />
										<span class="truncate">{result.properties?.label ?? 'Unknown'}</span>
									</button>
								{/each}
							</div>
						{/if}

						<div class="flex flex-wrap gap-2">
							<input
								type="text"
								bind:value={newItemTitle}
								placeholder="Title"
								class="border-border focus:ring-primary flex-1 rounded-lg border bg-transparent px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
							/>
							<select
								bind:value={newItemType}
								class="border-border rounded-lg border bg-transparent px-2 py-1.5 text-sm"
							>
								{#each Object.entries(TYPE_CONFIG) as [key, cfg] (key)}
									<option value={key}>{cfg.icon} {cfg.label}</option>
								{/each}
							</select>
							<input
								type="time"
								bind:value={newItemTime}
								class="border-border rounded-lg border bg-transparent px-2 py-1.5 text-sm"
							/>
							<input
								type="number"
								bind:value={newItemCost}
								placeholder="Cost"
								step="0.01"
								class="border-border w-20 rounded-lg border bg-transparent px-2 py-1.5 text-sm"
							/>
							<input
								type="text"
								bind:value={newItemCurrency}
								maxlength="3"
								class="border-border w-14 rounded-lg border bg-transparent px-2 py-1.5 text-sm"
							/>
							<button
								type="button"
								onclick={() => addItem(selectedDay!)}
								class="bg-primary hover:bg-primary/90 rounded-lg px-4 py-1.5 text-sm font-medium text-primary-foreground"
							>
								Add
							</button>
						</div>
					</div>

					<!-- Items for selected day -->
					<div class="space-y-2">
						{#each days[selectedDay - 1]?.items ?? [] as item (item.id)}
							<div
								class="bg-card border-border group rounded-xl border p-3"
								draggable="true"
								ondragstart={(e) => onDragStart(e, item)}
							>
								<div class="flex items-start gap-3">
									<span class="text-lg">{TYPE_CONFIG[item.type]?.icon ?? '📌'}</span>
									<div class="min-w-0 flex-1">
										<input
											type="text"
											bind:value={item.title}
											onchange={() => saveItem(item)}
											class="text-foreground w-full bg-transparent text-sm font-medium focus:outline-none"
										/>
										<div
											class="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2 text-xs"
										>
											{#if item.start_time}
												<span class="flex items-center gap-1">
													<Clock class="h-3 w-3" />{formatTime(item.start_time)}
												</span>
											{/if}
											{#if item.address}
												<span class="flex items-center gap-1 truncate">
													<MapPin class="h-3 w-3" />{item.address}
												</span>
											{/if}
											{#if item.cost_estimate}
												<span class="font-medium"
													>{item.currency} {item.cost_estimate.toFixed(2)}</span
												>
											{/if}
										</div>
										<!-- Quick actions -->
										<div class="mt-2 flex items-center gap-2">
											{#if item.booking_url}
												<button
													type="button"
													onclick={() => toggleBooking(item)}
													class="text-xs {item.booking_status === 'booked'
														? 'text-green-600'
														: 'text-muted-foreground'}"
												>
													{#if item.booking_status === 'booked'}
														<Check class="inline h-3 w-3" /> Booked
													{:else}
														<div
															class="inline-block h-3 w-3 rounded-full border border-current"
														></div>
														Pending
													{/if}
												</button>
											{/if}
											<select
												bind:value={item.type}
												onchange={() => saveItem(item)}
												class="border-border rounded border bg-transparent px-1 py-0.5 text-[10px]"
											>
												{#each Object.entries(TYPE_CONFIG) as [key, cfg] (key)}
													<option value={key}>{cfg.label}</option>
												{/each}
											</select>
											<!-- Move to day -->
											<select
												value={item.day_number}
												onchange={(e) =>
													moveItem(item, parseInt((e.target as HTMLSelectElement).value))}
												class="border-border rounded border bg-transparent px-1 py-0.5 text-[10px]"
											>
												{#each Array.from({ length: numDays }, (_, i) => i + 1) as d (d)}
													<option value={d}>Day {d}</option>
												{/each}
											</select>
										</div>

										<!-- Expandable edit panel -->
										<details class="mt-2">
											<summary
												class="text-muted-foreground cursor-pointer text-[10px] hover:text-foreground"
											>
												Edit details
											</summary>
											<div class="mt-2 grid grid-cols-2 gap-2">
												<label class="flex flex-col gap-0.5">
													<span class="text-muted-foreground text-[10px]">Start time</span>
													<input
														type="time"
														bind:value={item.start_time}
														onchange={() => saveItem(item)}
														class="border-border rounded border bg-transparent px-2 py-1 text-xs"
													/>
												</label>
												<label class="flex flex-col gap-0.5">
													<span class="text-muted-foreground text-[10px]">Cost</span>
													<input
														type="number"
														bind:value={item.cost_estimate}
														onchange={() => saveItem(item)}
														step="0.01"
														placeholder="0.00"
														class="border-border rounded border bg-transparent px-2 py-1 text-xs"
													/>
												</label>
												<label class="flex flex-col gap-0.5">
													<span class="text-muted-foreground text-[10px]">Currency</span>
													<input
														type="text"
														bind:value={item.currency}
														onchange={() => saveItem(item)}
														maxlength="3"
														class="border-border rounded border bg-transparent px-2 py-1 text-xs"
													/>
												</label>
												<label class="flex flex-col gap-0.5">
													<span class="text-muted-foreground text-[10px]">Booking URL</span>
													<input
														type="url"
														bind:value={item.booking_url}
														onchange={() => saveItem(item)}
														placeholder="https://..."
														class="border-border rounded border bg-transparent px-2 py-1 text-xs"
													/>
												</label>
												<label class="col-span-2 flex flex-col gap-0.5">
													<span class="text-muted-foreground text-[10px]">Address</span>
													<input
														type="text"
														bind:value={item.address}
														onchange={() => saveItem(item)}
														class="border-border rounded border bg-transparent px-2 py-1 text-xs"
													/>
												</label>
												<label class="col-span-2 flex flex-col gap-0.5">
													<span class="text-muted-foreground text-[10px]">Notes</span>
													<textarea
														bind:value={item.notes}
														onchange={() => saveItem(item)}
														rows="2"
														class="border-border rounded border bg-transparent px-2 py-1 text-xs"
													></textarea>
												</label>
											</div>
										</details>
									</div>
									<button
										type="button"
										onclick={() => removeItem(item.id)}
										class="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
									>
										<Trash2 class="h-3.5 w-3.5" />
									</button>
								</div>
							</div>
						{/each}
					</div>

					<!-- Day map: planned stops connected by route -->
					{#if dayMapPoints.length > 1}
						<div class="border-border bg-card overflow-hidden rounded-xl border">
							<div class="border-border flex items-center gap-2 border-b px-4 py-2">
								<MapPin class="text-primary h-4 w-4" />
								<span class="text-sm font-semibold text-foreground"
									>Route for Day {selectedDay}</span
								>
								<span class="text-muted-foreground ml-auto text-xs"
									>{dayMapPoints.length} stops</span
								>
							</div>
							<TripMap points={dayMapPoints} class="h-64" />
						</div>
					{:else if dayMapPoints.length === 1}
						<div class="border-border bg-card overflow-hidden rounded-xl border">
							<div class="border-border flex items-center gap-2 border-b px-4 py-2">
								<MapPin class="text-primary h-4 w-4" />
								<span class="text-sm font-semibold text-foreground">Stop location</span>
							</div>
							<TripMap points={dayMapPoints} class="h-48" />
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Budget sidebar -->
		<div class="space-y-4">
			<div class="bg-card border-border sticky top-20 rounded-2xl border p-4">
				<h3 class="text-foreground mb-3 text-sm font-bold uppercase tracking-wide">Budget</h3>
				{#if budgetByCurrency.length > 0}
					<div class="space-y-2">
						{#each budgetByCurrency as entry (entry.currency)}
							<div class="flex items-center justify-between">
								<span class="text-muted-foreground text-sm">{entry.currency}</span>
								<span class="text-foreground font-mono text-sm font-bold">
									{entry.total.toFixed(2)}
								</span>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-muted-foreground text-xs">No costs added yet.</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Collaborator modal -->
	{#if showCollaboratorModal}
		<div
			class="bg-background/80 fixed inset-0 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm"
		>
			<div class="border-border bg-card w-full max-w-sm rounded-2xl border p-6 shadow-2xl">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-foreground flex items-center gap-2 text-lg font-bold">
						<Users class="h-5 w-5" /> Invite collaborator
					</h2>
					<button
						type="button"
						onclick={() => (showCollaboratorModal = false)}
						class="text-muted-foreground hover:text-foreground"
					>
						<X class="h-5 w-5" />
					</button>
				</div>
				<input
					type="text"
					bind:value={collaboratorUsername}
					placeholder="@username"
					onkeydown={(e) => e.key === 'Enter' && handleAddCollaborator()}
					class="border-border focus:ring-primary mb-4 w-full rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
				/>
				<div class="flex justify-end gap-2">
					<button
						type="button"
						onclick={() => (showCollaboratorModal = false)}
						class="border-border text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm"
						>Cancel</button
					>
					<button
						type="button"
						onclick={handleAddCollaborator}
						disabled={isAddingCollaborator}
						class="bg-primary hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
					>
						{#if isAddingCollaborator}<Loader2 class="h-4 w-4 animate-spin" />{:else}Invite{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}
{:else}
	<div class="flex min-h-[60vh] flex-col items-center justify-center gap-3">
		<p class="text-muted-foreground text-lg">Trip not found.</p>
		<a href="/dashboard/travel" class="text-primary text-sm hover:underline">← Back to Travel</a>
	</div>
{/if}
