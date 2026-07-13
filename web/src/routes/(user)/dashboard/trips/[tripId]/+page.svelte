<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fluxbase } from '$lib/fluxbase';
	import { userStore } from '$lib/stores/auth';
	import {
		listEntries,
		createEntry,
		updateEntry,
		deleteEntry
	} from '$lib/services/trip-entry.service';
	import type { TripEntry } from '$lib/types/journal.types';
	import TripMap from '$lib/components/TripMap.svelte';
	import TripTimeline from '$lib/components/TripTimeline.svelte';
	import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
	import VisibilityToggle from '$lib/components/VisibilityToggle.svelte';
	import CommentThread from '$lib/components/EntryComments.svelte';
	import LikeButton from '$lib/components/EntryLikeButton.svelte';
	import {
		ArrowLeft,
		Plus,
		MapPin,
		Calendar,
		Route,
		Save,
		X,
		Loader2,
		Check,
		Share2,
		Link as LinkIcon,
		Copy,
		RefreshCw,
		ExternalLink
	} from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import PannableCover from '$lib/components/PannableCover.svelte';
	import PhotoGallery from '$lib/components/PhotoGallery.svelte';
	import { fetchTrackPoints } from '$lib/services/gps.service';

	// Debounced visibility save with status feedback
	let visibilitySaveTimer: ReturnType<typeof setTimeout> | null = null;
	let visibilitySaveStatus = $state<'idle' | 'saving' | 'saved'>('idle');
	let visibilitySaveTimeout: ReturnType<typeof setTimeout> | null = null;
	let lastSavedVisibility = $state<string | null>(null);

	async function saveVisibility(newVal: string) {
		if (!trip) return;
		// Don't save if unchanged from what we last saved (or loaded)
		if (newVal === lastSavedVisibility) return;
		if (visibilitySaveTimer) clearTimeout(visibilitySaveTimer);
		visibilitySaveStatus = 'saving';
		visibilitySaveTimer = setTimeout(async () => {
			try {
				await fluxbase.from('trips').update({ visibility: newVal }).eq('id', tripId);
				lastSavedVisibility = newVal;
				visibilitySaveStatus = 'saved';
				toast.success(`Trip is now ${newVal}`);
				if (visibilitySaveTimeout) clearTimeout(visibilitySaveTimeout);
				visibilitySaveTimeout = setTimeout(() => (visibilitySaveStatus = 'idle'), 2000);
			} catch (err) {
				console.error('Failed to update visibility:', err);
				toast.error('Failed to update visibility');
				visibilitySaveStatus = 'idle';
			}
		}, 500);
	}

	// Watch visibility changes
	$effect(() => {
		if (trip?.visibility) {
			saveVisibility(trip.visibility);
		}
	});

	type Trip = {
		id: string;
		title: string;
		description: string;
		start_date: string;
		end_date: string;
		image_url: string;
		metadata: Record<string, any>;
		status: string;
		visibility: string;
	};

	let trip = $state<Trip | null>(null);
	let entries = $state<TripEntry[]>([]);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);

	// Map data
	let gpsPoints = $state<Array<{ lat: number; lng: number }>>([]);
	let cityMarkers = $state<Array<{ lat: number; lng: number; label: string }>>([]);

	// Entry editor state
	let showEditor = $state(false);
	let editingEntry = $state<TripEntry | null>(null);
	let editorTitle = $state('');
	let editorBody = $state('');
	let editorDate = $state('');
	let editorEndDate = $state('');
	let isSaving = $state(false);

	// Share link state
	let showShareModal = $state(false);
	let shareToken = $state<string | null>(null);
	let shareUrl = $state('');
	let isGeneratingShare = $state(false);
	let publicTripUrl = $state('');

	const tripId = $derived(page.params.tripId ?? '');

	onMount(async () => {
		await loadTrip();
	});

	async function loadTrip() {
		isLoading = true;
		loadError = null;
		try {
			// Load trip details (RLS ensures owner-only)
			const { data: tripData, error: tripErr } = await fluxbase
				.from('trips')
				.select('*')
				.eq('id', tripId)
				.single();

			if (tripErr || !tripData) {
				loadError = 'Trip not found.';
				return;
			}
			trip = tripData as unknown as Trip;
			lastSavedVisibility = trip.visibility;
			shareToken = (tripData as any).share_token || null;
			if (shareToken) {
				shareUrl = `${window.location.origin}/share/${shareToken}`;
			}

			// Load public URL if the user has a username and the trip is public
			if (trip.visibility === 'public') {
				try {
					const { data: userData } = await fluxbase.auth.getUser();
					if (userData?.user) {
						const { data: profile } = await fluxbase
							.from('user_profiles')
							.select('username')
							.eq('id', userData.user.id)
							.single();
						if ((profile as any)?.username) {
							publicTripUrl = `/u/${(profile as any).username}/trips/${tripId}`;
						}
					}
				} catch {
					// No username set
				}
			}

			// Load journal entries
			entries = await listEntries(tripId);

			// Load GPS data for the map (scoped to trip date range)
			await loadGpsData();

			// Build city markers from metadata
			if (trip?.metadata?.visitedCitiesDetailed) {
				cityMarkers = trip.metadata.visitedCitiesDetailed
					.filter((c: any) => c.lat && c.lng)
					.map((c: any) => ({
						lat: c.lat,
						lng: c.lng,
						label: c.city || 'Unknown'
					}));
			}
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load trip.';
		} finally {
			isLoading = false;
		}
	}

	async function loadGpsData() {
		if (!trip) return;
		try {
			const { data: userData } = await fluxbase.auth.getUser();
			const userId = userData?.user?.id;
			if (!userId) return;

			const pts = await fetchTrackPoints(userId, trip.start_date, trip.end_date, 1500);
			gpsPoints = pts.map((p) => ({ lat: p.lat, lng: p.lng }));
		} catch (err) {
			console.error('[trip] Failed to load GPS data:', err);
		}
	}

	function openNewEditor() {
		editingEntry = null;
		editorTitle = '';
		editorBody = '';
		editorDate = trip?.start_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
		editorEndDate = '';
		showEditor = true;
	}

	function openEditEditor(entry: TripEntry) {
		editingEntry = entry;
		editorTitle = entry.title;
		editorBody = entry.body;
		editorDate = entry.entry_date?.slice(0, 10) ?? '';
		editorEndDate = entry.end_date?.slice(0, 10) ?? '';
		showEditor = true;
	}

	async function saveEntry() {
		if (!$userStore?.id) return;
		isSaving = true;
		try {
			if (editingEntry) {
				const updated = await updateEntry(editingEntry.id, {
					title: editorTitle,
					body: editorBody,
					entry_date: editorDate,
					end_date: editorEndDate || null
				});
				entries = entries.map((e) => (e.id === updated.id ? updated : e));
			} else {
				const created = await createEntry($userStore!.id, {
					trip_id: tripId,
					title: editorTitle,
					body: editorBody,
					entry_date: editorDate,
					end_date: editorEndDate || null
				});
				entries = [...entries, created].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
			}
			showEditor = false;
		} catch (err) {
			console.error('Failed to save entry:', err);
		} finally {
			isSaving = false;
		}
	}

	async function handleDeleteEntry(entry: TripEntry) {
		if (!confirm('Delete this entry?')) return;
		try {
			await deleteEntry(entry.id);
			entries = entries.filter((e) => e.id !== entry.id);
		} catch (err) {
			console.error('Failed to delete entry:', err);
		}
	}

	async function generateShareLink() {
		isGeneratingShare = true;
		try {
			const token = crypto.randomUUID();
			await fluxbase.from('trips').update({ share_token: token }).eq('id', tripId);
			shareToken = token;
			shareUrl = `${window.location.origin}/share/${token}`;
			toast.success('Share link generated');
		} catch (err) {
			console.error('Failed to generate share link:', err);
			toast.error('Failed to generate share link');
		} finally {
			isGeneratingShare = false;
		}
	}

	async function revokeShareLink() {
		try {
			await fluxbase.from('trips').update({ share_token: null }).eq('id', tripId);
			shareToken = null;
			shareUrl = '';
			toast.success('Share link revoked');
		} catch (err) {
			console.error('Failed to revoke share link:', err);
			toast.error('Failed to revoke share link');
		}
	}

	async function copyShareUrl() {
		try {
			await navigator.clipboard.writeText(shareUrl);
			toast.success('Link copied to clipboard');
		} catch {
			toast.error('Failed to copy');
		}
	}

	function formatDateRange(start: string, end: string): string {
		const s = new Date(start);
		const e = new Date(end);
		const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
		return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
	}

	function tripDuration(): number {
		if (!trip) return 0;
		const days = Math.ceil(
			(new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000
		);
		return Math.max(1, days + 1);
	}

	async function saveImageFocal(x: number, y: number) {
		try {
			const newMeta = { ...(trip?.metadata ?? {}), image_focal_x: x, image_focal_y: y };
			await fluxbase.from('trips').update({ metadata: newMeta }).eq('id', tripId);
			if (trip) trip.metadata = newMeta;
		} catch {
			// non-critical
		}
	}
</script>

{#if isLoading}
	<div class="flex items-center justify-center py-20">
		<div class="border-primary h-8 w-8 animate-spin rounded-full border-b-2"></div>
	</div>
{:else if loadError}
	<div class="py-20 text-center">
		<p class="text-muted-foreground mb-4">{loadError}</p>
		<a href="/dashboard/trips" class="text-primary hover:underline">← Back to trips</a>
	</div>
{:else if trip}
	<div class="mx-auto max-w-3xl space-y-6">
		<div class="flex items-center justify-between">
			<a
				href="/dashboard/trips"
				class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
			>
				<ArrowLeft class="h-4 w-4" />
				All trips
			</a>
			<div class="flex items-center gap-2">
				{#if publicTripUrl}
					<a
						href={publicTripUrl}
						target="_blank"
						rel="noopener"
						class="border-border text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
					>
						<ExternalLink class="h-4 w-4" />
						View publicly
					</a>
				{/if}
				<button
					type="button"
					onclick={() => (showShareModal = true)}
					class="border-border text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
				>
					<Share2 class="h-4 w-4" />
					Share
				</button>
			</div>
		</div>

		<!-- Trip header -->
		<div class="bg-card border-border overflow-hidden rounded-xl border">
			{#if trip.image_url}
				<PannableCover
					src={trip.image_url}
					focalX={trip.metadata?.image_focal_x ?? 0.5}
					focalY={trip.metadata?.image_focal_y ?? 0.5}
					editable={true}
					onFocalChange={saveImageFocal}
					class="h-48 w-full"
				/>
			{/if}
			<div class="p-6">
				<h1 class="text-foreground mb-2 text-2xl font-bold">{trip.title}</h1>
				{#if trip.description}
					<p class="text-muted-foreground mb-3 text-sm leading-relaxed">{trip.description}</p>
				{/if}
				<div class="text-muted-foreground flex flex-wrap gap-4 text-sm">
					<span class="flex items-center gap-1.5">
						<Calendar class="h-4 w-4" />
						{formatDateRange(trip.start_date, trip.end_date)}
					</span>
					<span class="flex items-center gap-1.5">
						<Route class="h-4 w-4" />
						{tripDuration()} days
					</span>
					{#if trip.metadata?.primaryCity}
						<span class="flex items-center gap-1.5">
							<MapPin class="h-4 w-4" />
							{trip.metadata.primaryCity}
						</span>
					{/if}
					{#if trip.metadata?.distanceTraveled}
						<span>{Math.round(trip.metadata.distanceTraveled).toLocaleString()} km</span>
					{/if}
				</div>
			</div>

			<!-- Visibility toggle -->
			<div class="border-border mt-2 border-t p-6">
				<span class="text-muted-foreground mb-4 block text-xs font-medium uppercase tracking-wide">
					Visibility
				</span>
				<VisibilityToggle bind:value={trip.visibility} />
				{#if visibilitySaveStatus === 'saving'}
					<p class="text-muted-foreground mt-2 flex items-center gap-1 text-xs">
						<Loader2 class="h-3 w-3 animate-spin" /> Saving...
					</p>
				{:else if visibilitySaveStatus === 'saved'}
					<p class="text-success mt-2 flex items-center gap-1 text-xs">
						<Check class="h-3 w-3" /> Saved
					</p>
				{/if}
			</div>
		</div>

		<!-- Map -->
		{#if gpsPoints.length > 0 || cityMarkers.length > 0}
			<div class="bg-card border-border overflow-hidden rounded-xl border p-4">
				<h2 class="text-foreground mb-3 flex items-center gap-2 text-sm font-semibold">
					<MapPin class="h-4 w-4" />
					Map
				</h2>
				<TripMap points={gpsPoints} markers={cityMarkers} class="h-72" />
			</div>
		{/if}

		<!-- Journal entries -->
		<div>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-foreground text-lg font-semibold">Journal</h2>
				{#if !showEditor}
					<button
						type="button"
						onclick={openNewEditor}
						class="bg-primary hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors"
					>
						<Plus class="h-4 w-4" />
						Add Entry
					</button>
				{/if}
			</div>

			{#if showEditor}
				<div class="bg-card border-border mb-4 space-y-3 rounded-xl border p-4">
					<div class="flex gap-3">
						<input
							type="text"
							bind:value={editorTitle}
							placeholder="Entry title (optional)"
							class="border-border focus:ring-primary flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
						/>
						<input
							type="date"
							bind:value={editorDate}
							class="border-border focus:ring-primary rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
						/>
						<input
							type="date"
							bind:value={editorEndDate}
							placeholder="End"
							class="border-border focus:ring-primary rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
						/>
					</div>
					<MarkdownEditor bind:value={editorBody} />
					{#if editingEntry}
						<div class="border-border rounded-lg border p-3">
							<span class="text-muted-foreground mb-2 block text-xs font-medium">Photos</span>
							<PhotoGallery {tripId} entryId={editingEntry.id} />
						</div>
					{/if}
					<div class="flex justify-end gap-2">
						<button
							type="button"
							onclick={() => (showEditor = false)}
							class="border-border text-foreground hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
						>
							<span class="inline-flex items-center gap-1.5"><X class="h-4 w-4" /> Cancel</span>
						</button>
						<button
							type="button"
							onclick={saveEntry}
							disabled={isSaving || !editorDate}
							class="bg-primary hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground transition-colors disabled:opacity-50"
						>
							<Save class="h-4 w-4" />
							{isSaving ? 'Saving...' : 'Save Entry'}
						</button>
					</div>
				</div>
			{/if}

			<TripTimeline
				{entries}
				{tripId}
				canEdit={true}
				onEdit={openEditEditor}
				onDelete={handleDeleteEntry}
			/>
		</div>
	</div>
{/if}

<svelte:window onkeydown={(e) => e.key === 'Escape' && (showShareModal = false)} />

<!-- Share Modal -->
{#if showShareModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[1001] flex items-center justify-center bg-black/50 p-4"
		onclick={() => (showShareModal = false)}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="bg-card border-border w-full max-w-md rounded-xl border p-6 shadow-2xl"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-foreground flex items-center gap-2 text-lg font-semibold">
					<Share2 class="h-5 w-5" />
					Share trip
				</h2>
				<button
					type="button"
					onclick={() => (showShareModal = false)}
					class="text-muted-foreground hover:text-foreground rounded-lg p-1"
					aria-label="Close"><X class="h-5 w-5" /></button
				>
			</div>

			<p class="text-muted-foreground mb-4 text-sm">
				Generate a secret link that lets anyone view this trip — including its journal entries,
				photos, and route map — without needing an account. Works even for private trips.
			</p>

			{#if shareToken}
				<!-- Active share link -->
				<div class="space-y-3">
					<div class="border-border flex items-center gap-2 rounded-lg border p-3">
						<LinkIcon class="text-muted-foreground h-4 w-4 flex-shrink-0" />
						<input
							type="text"
							value={shareUrl}
							readonly
							class="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
						/>
						<button
							type="button"
							onclick={copyShareUrl}
							class="bg-primary hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors"
						>
							<Copy class="h-3.5 w-3.5" />
							Copy
						</button>
					</div>
					<div class="flex gap-2">
						<button
							type="button"
							onclick={generateShareLink}
							disabled={isGeneratingShare}
							class="border-border text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
						>
							<RefreshCw class="h-3.5 w-3.5" />
							{isGeneratingShare ? 'Generating...' : 'Regenerate'}
						</button>
						<button
							type="button"
							onclick={() => {
								if (confirm('Revoke this share link? Anyone with the old link will lose access.')) {
									revokeShareLink();
								}
							}}
							class="text-destructive hover:bg-destructive/10 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
						>
							Revoke
						</button>
					</div>
				</div>
			{:else}
				<!-- No share link yet -->
				<button
					type="button"
					onclick={generateShareLink}
					disabled={isGeneratingShare}
					class="bg-primary hover:bg-primary/90 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors disabled:opacity-50"
				>
					{#if isGeneratingShare}
						<Loader2 class="h-4 w-4 animate-spin" />
						Generating...
					{:else}
						<LinkIcon class="h-4 w-4" />
						Generate share link
					{/if}
				</button>
			{/if}
		</div>
	</div>
{/if}
