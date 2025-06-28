<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { MapPin, Calendar, Route, Clock, Loader2, Plus, Search, Filter, Trash2 } from 'lucide-svelte';
	import { format, formatDistanceToNow } from 'date-fns';
	import { toast } from 'svelte-sonner';

	interface Trip {
		id: string;
		title: string;
		description?: string;
		start_date: string;
		end_date: string;
		total_distance: number;
		point_count: number;
		image_url?: string;
		created_at: string;
		updated_at: string;
	}

	let trips: Trip[] = [];
	let isLoading = false;
	let searchQuery = '';
	let selectedFilter = 'all';
	let filteredTrips: Trip[] = [];
	let showAddTripModal = false;
	let newTrip = {
		title: '',
		start_date: '',
		end_date: '',
		description: ''
	};
	let formError = '';
	let tripToDelete: Trip | null = null;
	let showDeleteConfirm = false;

	const filters = [
		{ value: 'all', label: 'All Trips' },
		{ value: 'recent', label: 'Recent' },
		{ value: 'long', label: 'Long Distance' },
		{ value: 'short', label: 'Short Distance' }
	];

	// Generate placeholder images based on trip data
	function getTripImage(trip: Trip): string {
		if (trip.image_url) {
			return trip.image_url;
		}

		// Generate a placeholder image based on trip characteristics
		const seed = trip.id.charCodeAt(0) + trip.title.length;
		const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
		const color = colors[seed % colors.length];

		return `https://via.placeholder.com/400x250/${color.replace('#', '')}/ffffff?text=${encodeURIComponent(trip.title)}`;
	}

	function formatDistance(distance: number): string {
		if (distance < 1000) {
			return `${Math.round(distance)}m`;
		}
		return `${(distance / 1000).toFixed(1)}km`;
	}

	function formatDuration(startDate: string, endDate: string): string {
		const start = new Date(startDate);
		const end = new Date(endDate);
		const diffTime = Math.abs(end.getTime() - start.getTime());
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		if (diffDays === 1) {
			return '1 day';
		}
		return `${diffDays} days`;
	}

	function getRelativeTime(date: string): string {
		return formatDistanceToNow(new Date(date), { addSuffix: true });
	}

	function filterTrips() {
		let filtered = trips;

		// Apply search filter
		if (searchQuery) {
			filtered = filtered.filter(trip =>
				trip.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
				(trip.description && trip.description.toLowerCase().includes(searchQuery.toLowerCase()))
			);
		}

		// Apply category filter
		switch (selectedFilter) {
			case 'recent':
				filtered = filtered.filter(trip => {
					const tripDate = new Date(trip.start_date);
					const thirtyDaysAgo = new Date();
					thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
					return tripDate >= thirtyDaysAgo;
				});
				break;
			case 'long':
				filtered = filtered.filter(trip => trip.total_distance > 10000); // > 10km
				break;
			case 'short':
				filtered = filtered.filter(trip => trip.total_distance <= 10000); // ≤ 10km
				break;
		}

		filteredTrips = filtered;
	}

	async function loadTrips() {
		if (isLoading) return;

		isLoading = true;
		try {
			const response = await fetch('/api/v1/trips');
			if (!response.ok) {
				throw new Error('Failed to load trips');
			}

			const result = await response.json();
			if (!result.success) {
				throw new Error(result.error?.message || 'Failed to load trips');
			}

			trips = result.data.trips || [];
			filterTrips();
		} catch (error) {
			console.error('Error loading trips:', error);
			toast.error('Failed to load trips');

			// Load sample data for demonstration
			trips = [
				{
					id: '1',
					title: 'Weekend in Amsterdam',
					description: 'A wonderful weekend exploring the canals and museums',
					start_date: '2024-06-15T10:00:00Z',
					end_date: '2024-06-17T18:00:00Z',
					total_distance: 15420,
					point_count: 156,
					created_at: '2024-06-15T10:00:00Z',
					updated_at: '2024-06-17T18:00:00Z'
				},
				{
					id: '2',
					title: 'Hiking in the Alps',
					description: 'Challenging mountain trails with breathtaking views',
					start_date: '2024-05-20T08:00:00Z',
					end_date: '2024-05-25T16:00:00Z',
					total_distance: 45230,
					point_count: 324,
					created_at: '2024-05-20T08:00:00Z',
					updated_at: '2024-05-25T16:00:00Z'
				},
				{
					id: '3',
					title: 'City Walk in Paris',
					description: 'Exploring the beautiful streets and landmarks',
					start_date: '2024-06-10T14:00:00Z',
					end_date: '2024-06-10T20:00:00Z',
					total_distance: 8200,
					point_count: 89,
					created_at: '2024-06-10T14:00:00Z',
					updated_at: '2024-06-10T20:00:00Z'
				},
				{
					id: '4',
					title: 'Beach Vacation in Bali',
					description: 'Relaxing days by the ocean and exploring local culture',
					start_date: '2024-04-15T12:00:00Z',
					end_date: '2024-04-22T10:00:00Z',
					total_distance: 28750,
					point_count: 201,
					created_at: '2024-04-15T12:00:00Z',
					updated_at: '2024-04-22T10:00:00Z'
				}
			];
			filterTrips();
		} finally {
			isLoading = false;
		}
	}

	$: if (searchQuery || selectedFilter) {
		filterTrips();
	}

	function openAddTripModal() {
		showAddTripModal = true;
		newTrip = { title: '', start_date: '', end_date: '', description: '' };
		formError = '';
	}
	function closeAddTripModal() {
		showAddTripModal = false;
	}
	async function submitAddTrip(event?: Event) {
		if (event) event.preventDefault();
		formError = '';
		if (!newTrip.title.trim()) {
			formError = 'Title is required.';
			return;
		}
		if (!newTrip.start_date || !newTrip.end_date) {
			formError = 'Start and end dates are required.';
			return;
		}
		if (new Date(newTrip.end_date) < new Date(newTrip.start_date)) {
			formError = 'End date must be after start date.';
			return;
		}
		// Here you would send the new trip to the server
		// For now, just close the modal and show a toast
		closeAddTripModal();
		toast.success('Trip added!');
		// Optionally reload trips
	}

	function confirmDeleteTrip(trip: Trip) {
		tripToDelete = trip;
		showDeleteConfirm = true;
	}
	function cancelDeleteTrip() {
		tripToDelete = null;
		showDeleteConfirm = false;
	}
	function deleteTrip() {
		if (tripToDelete) {
			trips = trips.filter(t => t.id !== tripToDelete?.id);
			filterTrips();
			toast.success('Trip deleted!');
		}
		tripToDelete = null;
		showDeleteConfirm = false;
	}

	onMount(() => {
		if (browser) {
			loadTrips();
		}
	});
</script>

<svelte:head>
	<title>Trips - Wayli</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
		<div class="flex items-center gap-3">
			<Route class="h-8 w-8 text-blue-600 dark:text-gray-400" />
			<h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">Trips</h1>
		</div>
		<button class="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer" onclick={openAddTripModal}>
			<Plus class="h-4 w-4" />
			New Trip
		</button>
	</div>

	<!-- Search and Filters -->
	<div class="flex flex-col md:flex-row gap-4">
		<div class="relative flex-1">
			<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
			<input
				type="text"
				placeholder="Search trips..."
				bind:value={searchQuery}
				class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
			/>
		</div>
		<div class="flex gap-2">
			{#each filters as filter}
				<button
					onclick={() => selectedFilter = filter.value}
					class="px-4 py-2 rounded-lg text-sm font-medium transition-colors {selectedFilter === filter.value
						? 'bg-blue-500 text-white'
						: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}"
				>
					{filter.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Add Trip Modal -->
	{#if showAddTripModal}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
			<div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 w-full max-w-lg mx-4 relative">
				<button class="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition-colors cursor-pointer" onclick={closeAddTripModal} aria-label="Close modal">&times;</button>
				<h2 class="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Add New Trip</h2>
				<form onsubmit={submitAddTrip} class="space-y-5">
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" for="title">Title</label>
						<input type="text" id="title" bind:value={newTrip.title} class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Trip title" required />
					</div>
					<div class="flex gap-4">
						<div class="flex-1">
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" for="start_date">Start Date</label>
							<input type="date" id="start_date" bind:value={newTrip.start_date} class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
						</div>
						<div class="flex-1">
							<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" for="end_date">End Date</label>
							<input type="date" id="end_date" bind:value={newTrip.end_date} class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
						</div>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" for="description">Description</label>
						<textarea id="description" bind:value={newTrip.description} rows="3" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" placeholder="Describe your trip..."></textarea>
					</div>
					{#if formError}
						<div class="text-red-500 text-sm font-medium">{formError}</div>
					{/if}
					<div class="flex justify-end gap-3 pt-2">
						<button type="button" class="px-5 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium transition-colors hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer" onclick={closeAddTripModal}>Cancel</button>
						<button type="submit" class="px-5 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors cursor-pointer">Add Trip</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<!-- Loading State -->
	{#if isLoading}
		<div class="flex items-center justify-center py-12">
			<div class="text-center">
				<Loader2 class="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
				<p class="text-gray-600 dark:text-gray-400">Loading trips...</p>
			</div>
		</div>
	{:else if filteredTrips.length === 0}
		<div class="text-center py-12">
			<Route class="h-12 w-12 text-gray-400 mx-auto mb-4" />
			<h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No trips found</h3>
			<p class="text-gray-600 dark:text-gray-400 mb-4">
				{searchQuery || selectedFilter !== 'all'
					? 'Try adjusting your search or filters'
					: 'Start creating your first trip to see it here'}
			</p>
			<button class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-medium transition-colors">
				<Plus class="h-4 w-4 inline mr-2" />
				Create Trip
			</button>
		</div>
	{:else}
		<!-- Trips Grid -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{#each filteredTrips as trip}
				<div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow relative">
					<!-- Trash Icon Button -->
					<button class="absolute top-3 right-3 p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer z-10" onclick={() => confirmDeleteTrip(trip)} aria-label="Delete trip">
						<Trash2 class="h-5 w-5" />
					</button>
					<!-- Trip Image -->
					<div class="relative h-48 bg-gray-200 dark:bg-gray-700">
						<img
							src={getTripImage(trip)}
							alt={trip.title}
							class="object-cover w-full h-full"
						/>
						<!-- Distance label at bottom right -->
						<div class="absolute bottom-3 right-3 bg-black/60 text-white px-3 py-1 rounded text-xs font-medium flex items-center gap-1 shadow">
							<Route class="h-4 w-4 text-blue-400" />
							{formatDistance(trip.total_distance)}
						</div>
					</div>

					<!-- Trip Details -->
					<div class="p-4">
						<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 line-clamp-2">
							{trip.title}
						</h3>

						{#if trip.description}
							<p class="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
								{trip.description}
							</p>
						{/if}

						<!-- Trip Stats -->
						<div class="space-y-2 mb-4">
							<div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
								<Calendar class="h-4 w-4" />
								<span>{format(new Date(trip.start_date), 'MMM d, yyyy')} - {format(new Date(trip.end_date), 'MMM d, yyyy')}</span>
							</div>
							<div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
								<Clock class="h-4 w-4" />
								<span>{formatDuration(trip.start_date, trip.end_date)}</span>
							</div>
							<div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
								<MapPin class="h-4 w-4" />
								<span>{trip.point_count} points</span>
							</div>
						</div>

						<!-- Trip Actions -->
						<div class="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
							<span class="text-xs text-gray-500 dark:text-gray-400">
								Updated {getRelativeTime(trip.updated_at)}
							</span>
							<button class="text-blue-500 hover:text-blue-600 text-sm font-medium transition-colors">
								View Details
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Results Summary -->
		<div class="text-center py-4">
			<p class="text-sm text-gray-600 dark:text-gray-400">
				Showing {filteredTrips.length} of {trips.length} trips
			</p>
		</div>
	{/if}

	<!-- Delete Confirmation Modal -->
	{#if showDeleteConfirm && tripToDelete}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
			<div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 relative">
				<h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Delete Trip</h2>
				<p class="mb-6 text-gray-700 dark:text-gray-300">Are you sure you want to delete <span class="font-semibold">{tripToDelete?.title || ''}</span>? This action cannot be undone.</p>
				<div class="flex justify-end gap-3">
					<button class="px-5 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium transition-colors hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer" onclick={cancelDeleteTrip}>Cancel</button>
					<button class="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium transition-colors cursor-pointer" onclick={deleteTrip}>Delete</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>