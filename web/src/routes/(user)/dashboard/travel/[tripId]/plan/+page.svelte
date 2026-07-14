<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
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
		GripVertical,
		Clock,
		MapPin,
		Calendar,
		X,
		Check,
		Loader2,
		UserPlus,
		Users,
		ExternalLink,
		Menu
	} from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

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
	let activeDay = $state(1);
	let showCollaboratorModal = $state(false);
	let collaboratorUsername = $state('');
	let isAddingCollaborator = $state(false);

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

	const bookingStats = $derived({
		booked: items.filter((i) => i.booking_status === 'booked').length,
		unbooked: items.filter((i) => i.booking_status !== 'booked' && i.booking_url).length
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

	// ── Item management ──

	async function addItem(dayNumber: number) {
		const newItem = await createPlanItem({
			trip_id: tripId,
			user_id: (await getCurrentUserId())!,
			day_number: dayNumber,
			sort_order: items.filter((i) => i.day_number === dayNumber).length,
			title: 'New item',
			description: null,
			type: 'activity',
			start_time: null,
			end_time: null,
			location: null,
			address: null,
			cost_estimate: null,
			currency: trip?.budget_currency || 'EUR',
			booking_url: null,
			booking_status: 'not_booked',
			want_to_visit_id: null,
			notes: null,
			created_by: null
		});
		items = [...items, newItem];
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
		const next = item.booking_status === 'booked' ? 'not_booked' : 'booked';
		item.booking_status = next;
		await saveItem(item);
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

	async function onDrop(e: DragEvent, dayNumber: number) {
		e.preventDefault();
		if (!draggedItem) return;

		const oldDay = draggedItem.day_number;
		if (oldDay === dayNumber) return;

		draggedItem.day_number = dayNumber;
		try {
			await updatePlanItem(draggedItem.id, { day_number: dayNumber });
			items = [...items];
		} catch (err) {
			console.error('Move failed:', err);
		}
		draggedItem = null;
	}

	async function reorderItem(item: PlanItem, direction: 'up' | 'down') {
		const dayItems = items.filter((i) => i.day_number === item.day_number);
		const idx = dayItems.findIndex((i) => i.id === item.id);
		if (direction === 'up' && idx === 0) return;
		if (direction === 'down' && idx === dayItems.length - 1) return;

		const swap = direction === 'up' ? dayItems[idx - 1] : dayItems[idx + 1];
		const myOrder = item.sort_order;
		item.sort_order = swap.sort_order;
		swap.sort_order = myOrder;

		await updatePlanItem(item.id, { sort_order: item.sort_order });
		await updatePlanItem(swap.id, { sort_order: swap.sort_order });
		items = [...items];
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
		} catch (err) {
			toast.error('Failed to add collaborator');
		} finally {
			isAddingCollaborator = false;
		}
	}

	async function handleRemoveCollaborator(id: string) {
		try {
			await removeCollaborator(id);
			collaborators = collaborators.filter((c) => c.id !== id);
		} catch (err) {
			console.error('Remove failed:', err);
		}
	}

	async function getCurrentUserId(): Promise<string | null> {
		const { data } = await fluxbase.auth.getUser();
		return data?.user?.id ?? null;
	}

	function formatTime(time: string | null): string {
		if (!time) return '';
		return time.slice(0, 5);
	}

	function formatDate(d: Date): string {
		return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
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
				class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
			>
				<ArrowLeft class="h-4 w-4" /> Back to Travel
			</a>
			<div class="flex items-center gap-2">
				<a
					href="/dashboard/travel"
					class="border-border text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
				>
					<Calendar class="h-3.5 w-3.5" /> Journal
				</a>
			</div>
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
							class="text-muted-foreground hover:text-destructive"
							title="Remove collaborator"
						>
							<X class="h-3 w-3" />
						</button>
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

	<!-- Main layout: day columns + budget sidebar -->
	<div class="grid gap-6 lg:grid-cols-[1fr_280px]">
		<!-- Day columns -->
		<div class="flex gap-4 overflow-x-auto pb-4">
			{#each days as day (day.number)}
				<div
					role="list"
					ondragover={onDragOver}
					ondrop={(e) => onDrop(e, day.number)}
					class="bg-card border-border flex w-72 flex-shrink-0 flex-col rounded-2xl border"
				>
					<!-- Day header -->
					<div class="border-border border-b p-3">
						<div class="flex items-center justify-between">
							<div>
								<div class="text-foreground font-bold">Day {day.number}</div>
								{#if day.date}
									<div class="text-muted-foreground text-xs">{formatDate(day.date)}</div>
								{/if}
							</div>
							<span class="text-muted-foreground text-xs">{day.items.length}</span>
						</div>
					</div>

					<!-- Items -->
					<div class="flex-1 space-y-2 overflow-y-auto p-2">
						{#each day.items as item (item.id)}
							<div
								draggable="true"
								ondragstart={(e) => onDragStart(e, item)}
								class="border-border bg-background group cursor-grab rounded-xl border p-3 transition-all active:cursor-grabbing"
							>
								<div class="flex items-start gap-2">
									<span class="text-lg">{TYPE_CONFIG[item.type]?.icon ?? '📌'}</span>
									<div class="min-w-0 flex-1">
										<input
											type="text"
											bind:value={item.title}
											onchange={() => saveItem(item)}
											placeholder="Title"
											class="text-foreground w-full bg-transparent text-sm font-medium focus:outline-none"
										/>
										{#if item.start_time}
											<div class="text-muted-foreground flex items-center gap-1 text-xs">
												<Clock class="h-3 w-3" />
												{formatTime(item.start_time)}{#if item.end_time}–{formatTime(
														item.end_time
													)}{/if}
											</div>
										{/if}
										{#if item.cost_estimate}
											<div class="text-muted-foreground text-xs font-medium">
												{item.currency}
												{item.cost_estimate.toFixed(2)}
											</div>
										{/if}
										{#if item.booking_url}
											<button
												type="button"
												onclick={() => toggleBooking(item)}
												class="mt-1 inline-flex items-center gap-1 text-xs {item.booking_status ===
												'booked'
													? 'text-green-600'
													: 'text-muted-foreground'}"
											>
												{#if item.booking_status === 'booked'}
													<Check class="h-3 w-3" /> Booked
												{:else}
													<div class="h-3 w-3 rounded-full border border-current"></div>
													Unbooked
												{/if}
											</button>
										{/if}
									</div>
									<button
										type="button"
										onclick={() => removeItem(item.id)}
										class="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
									>
										<Trash2 class="h-3.5 w-3.5" />
									</button>
								</div>

								<!-- Inline edit row (expandable) -->
								<details class="mt-2">
									<summary
										class="text-muted-foreground cursor-pointer text-xs hover:text-foreground"
									>
										Details
									</summary>
									<div class="mt-2 space-y-2">
										<select
											bind:value={item.type}
											onchange={() => saveItem(item)}
											class="border-border rounded border bg-transparent px-2 py-1 text-xs"
										>
											{#each Object.entries(TYPE_CONFIG) as [key, cfg] (key)}
												<option value={key}>{cfg.icon} {cfg.label}</option>
											{/each}
										</select>
										<div class="flex gap-1">
											<input
												type="time"
												bind:value={item.start_time}
												onchange={() => saveItem(item)}
												class="border-border rounded border bg-transparent px-1.5 py-1 text-xs"
											/>
											<input
												type="time"
												bind:value={item.end_time}
												onchange={() => saveItem(item)}
												class="border-border rounded border bg-transparent px-1.5 py-1 text-xs"
											/>
										</div>
										<div class="flex gap-1">
											<input
												type="number"
												bind:value={item.cost_estimate}
												onchange={() => saveItem(item)}
												placeholder="Cost"
												step="0.01"
												class="border-border w-20 rounded border bg-transparent px-1.5 py-1 text-xs"
											/>
											<input
												type="text"
												bind:value={item.currency}
												onchange={() => saveItem(item)}
												placeholder="EUR"
												maxlength="3"
												class="border-border w-14 rounded border bg-transparent px-1.5 py-1 text-xs"
											/>
										</div>
										<input
											type="url"
											bind:value={item.booking_url}
											onchange={() => saveItem(item)}
											placeholder="Booking URL"
											class="border-border w-full rounded border bg-transparent px-1.5 py-1 text-xs"
										/>
										<textarea
											bind:value={item.notes}
											onchange={() => saveItem(item)}
											placeholder="Notes..."
											rows="2"
											class="border-border w-full rounded border bg-transparent px-1.5 py-1 text-xs"
										></textarea>
										<div class="flex gap-1">
											<button
												type="button"
												onclick={() => reorderItem(item, 'up')}
												class="text-muted-foreground hover:text-foreground text-xs">↑</button
											>
											<button
												type="button"
												onclick={() => reorderItem(item, 'down')}
												class="text-muted-foreground hover:text-foreground text-xs">↓</button
											>
										</div>
									</div>
								</details>
							</div>
						{/each}
					</div>

					<!-- Add button -->
					<div class="border-border border-t p-2">
						<button
							type="button"
							onclick={() => addItem(day.number)}
							class="text-muted-foreground hover:text-foreground hover:bg-muted flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors"
						>
							<Plus class="h-3.5 w-3.5" /> Add stop
						</button>
					</div>
				</div>
			{/each}
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

				{#if budgetByCurrency.length > 0}
					<div class="border-border mt-3 border-t pt-3">
						<div class="mb-2 text-xs font-medium text-muted-foreground">Bookings</div>
						<div class="flex items-center gap-3 text-xs">
							<span class="flex items-center gap-1 text-green-600">
								<Check class="h-3 w-3" />
								{bookingStats.booked}
							</span>
							<span class="text-muted-foreground">
								{bookingStats.unbooked} pending
							</span>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Collaborator modal -->
	{#if showCollaboratorModal}
		<div
			class="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
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
				<p class="text-muted-foreground mb-4 text-sm">
					Enter the username of the person you want to invite as an editor.
				</p>
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
						class="border-border text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={handleAddCollaborator}
						disabled={isAddingCollaborator || !collaboratorUsername.trim()}
						class="bg-primary hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
					>
						{#if isAddingCollaborator}
							<Loader2 class="h-4 w-4 animate-spin" />
						{:else}
							Invite
						{/if}
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
