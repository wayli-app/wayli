<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { get } from 'svelte/store';
	import { PUBLIC_SUPABASE_URL } from '$env/static/public';
	import {
		MapPin,
		Calendar,
		Route,
		Clock,
		Loader2,
		Plus,
		Search,
		Trash2,
		Edit,
		X,
		RefreshCw,
		BarChart,
		Info,
		Check
	} from 'lucide-svelte';
	import { format, formatDistanceToNow } from 'date-fns';
	import { toast } from 'svelte-sonner';
	import { uploadTripImage } from '$lib/services/external/image-upload.service';
	import { getTripsService } from '$lib/services/service-layer-adapter';
	import { sessionStore, sessionStoreReady } from '$lib/stores/auth';
	import { setDateRange } from '$lib/stores/app-state.svelte';
	import TripGenerationModal from '$lib/components/modals/TripGenerationModal.svelte';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { supabase } from '$lib/supabase';
	import Modal from '$lib/components/ui/modal/index.svelte';
	import GenerateSuggestionsButton from '$lib/components/ui/generate-suggestions-button/index.svelte';
	import type { UserProfile } from '$lib/types/user.types';
	import { getActiveJobsMap, subscribe } from '$lib/stores/job-store';
	import type { JobUpdate } from '$lib/services/sse.service';

	interface Trip {
		id: string;
		title: string;
		description?: string;
		start_date: string;
		end_date: string;
		total_distance: number;
		point_count: number;
		image_url?: string;
		labels?: string[];
		metadata?: {
			distance_traveled?: number;
			visited_places_count?: number;
			image_attribution?: {
				source: 'pexels' | 'picsum' | 'placeholder';
				photographer?: string;
				photographerUrl?: string;
				pexelsUrl?: string;
			};
			[key: string]: unknown;
		};
		created_at: string;
		updated_at: string;
	}

	let trips = $state<Trip[]>([]);
	let isLoading = $state(false);
	let isLoadingMore = $state(false);
	let isInitialLoad = $state(true);
	let hasMoreTrips = $state(true);
	let currentPage = $state(1);
	const tripsPerPage = 30;
	let isApprovingTrips = $state(false); // Flag to prevent reactive reloads during approval
	let searchQuery = $state('');
	let selectedFilter = $state('all');
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;
	let filteredTrips = $state<Trip[]>([]);
	let showTripModal = $state(false);
	let isEditing = $state(false);
	let editingTrip = $state<Trip | null>(null);
	let tripForm = $state({
		title: '',
		start_date: '',
		end_date: '',
		description: '',
		labels: [] as string[]
	});
	let newLabel = $state('');
	let formError = $state('');
	let isSubmitting = $state(false);
	let tripToDelete = $state<Trip | null>(null);
	let showDeleteConfirm = $state(false);
	let imageFile = $state<File | null>(null);
	let showSuggestedTripsModal = $state(false);
	let showTripGenerationModal = $state(false);
	let suggestedTrips = $state<any[]>([]);
	let isLoadingSuggestedTrips = $state(false);
	let isLoadingMoreSuggestedTrips = $state(false); // Separate state for "load more"
	let selectedSuggestedTrips = $state<string[]>([]);
	let suggestedTripsPagination = $state({
		limit: 10,
		offset: 0,
		total: 0,
		hasMore: true
	});
	// Custom home address state
	let customHomeAddressInput = $state('');
	let customHomeAddressInputElement: HTMLInputElement | undefined;
	let isCustomHomeAddressSearching = $state(false);
	let customHomeAddressSuggestions = $state<any[]>([]);
	let showCustomHomeAddressSuggestions = $state(false);
	let selectedCustomHomeAddress = $state<any | null>(null);
	let selectedCustomHomeAddressIndex = $state(-1);
	let customHomeAddressSearchTimeout: ReturnType<typeof setTimeout> | null = null;
	let customHomeAddressSearchError = $state<string | null>(null);

	let tripGenerationData = $state({
		startDate: '',
		endDate: '',
		useCustomHomeAddress: false,
		customHomeAddress: '',
		clearExistingSuggestions: false
	});
	let imagePreview = $state<string | null>(null);

	// Image state
	let imageError = $state<string>('');
	let uploadedImageUrl = $state<string | null>(null);
	let isUploadingImage = $state(false);
	let isSuggestingImage = $state(false);
	let suggestedImageUrl = $state<string | null>(null);
	let tripAnalysis = $state<any>(null);
	let userPreferences = $state<any>(null);
	let serverPexelsApiKeyAvailable = $state(false);
	let imageAttribution = $state<any>(null);

	// Create a reactive subscription to the global store for trip generation jobs
	let activeJobs = $state(getActiveJobsMap());

	// Subscribe to store changes
	onMount(() => {
		const unsubscribe = subscribe(() => {
			activeJobs = getActiveJobsMap();
		});

		return unsubscribe;
	});


	$effect(() => {
		// Find the active trip generation job in the activeJobs map
		for (const [jobId, job] of activeJobs.entries()) {
			if (job.type === 'trip_generation' && (job.status === 'queued' || job.status === 'running')) {

				// Update approval progress if we have an active trip generation job
				if (job.status === 'running' && job.progress > 0) {
					approvalProgress = {
						step: 'creating-trips',
						message: `Creating trips... ${job.progress}% complete`,
						progress: job.progress,
						totalSteps: 2,
						currentStep: 2,
						imageProgress: {
							processed: 0,
							total: 0,
							currentTrip: null
						}
					};
				}
				return; // Found the active job, no need to continue
			}
		}

		// If no active trip generation job found, clear the progress
		if (approvalProgress.step === 'creating-trips') {
			approvalProgress = {
				step: 'idle',
				message: '',
				progress: 0,
				totalSteps: 0,
				currentStep: 0,
				imageProgress: {
					processed: 0,
					total: 0,
					currentTrip: null
				}
			};
		}
	});

	const filters = [
		{ value: 'all', label: 'All Trips' },
		{ value: 'recent', label: 'Recent' },
		{ value: 'long', label: 'Long Distance' },
		{ value: 'short', label: 'Short Distance' },
		{ value: 'autogenerated', label: 'Auto-generated' }
	];

		// Get trip image or return null if no image available
	function getTripImage(trip: Trip): string | null {
		if (!trip.image_url) {

			return null;
		}



		// If it's already a full URL, return as is
		if (trip.image_url.startsWith('http')) {
			return trip.image_url;
		}

		// If it's a path, construct the full URL using the Supabase URL
		if (trip.image_url.startsWith('/')) {
			// For development, use localhost for storage URLs
			if (PUBLIC_SUPABASE_URL.includes('127.0.0.1') || PUBLIC_SUPABASE_URL.includes('localhost')) {
				return `http://127.0.0.1:54321${trip.image_url}`;
			}
			return `${PUBLIC_SUPABASE_URL}${trip.image_url}`;
		}

		return trip.image_url;
	}

	// Handle image loading
	function handleImageLoad(tripId: string) {
		imageLoadingStates.set(tripId, false);
	}

	function handleImageError(tripId: string) {
		console.log('❌ Image error for trip:', tripId);
		imageLoadingStates.set(tripId, false);
	}

	function startImageLoading(tripId: string) {
		imageLoadingStates.set(tripId, true);
	}

	function formatDistance(distance: number): string {
		if (distance < 1000) {
			return `${Math.round(distance)} m`;
		}
		return `${(distance / 1000).toFixed(1)} km`;
	}

	function formatDuration(startDate: string, endDate: string): string {
		const start = new Date(startDate);
		const end = new Date(endDate);

		// Calculate the difference in days and add 1 for inclusive counting
		// This accounts for the fact that both start and end dates are included
		const diffTime = Math.abs(end.getTime() - start.getTime());
		const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

		if (diffDays === 1) {
			return '1 day';
		}
		return `${diffDays} days`;
	}

	function getRelativeTime(date: string): string {
		return formatDistanceToNow(new Date(date), { addSuffix: true });
	}

	function showTripStatistics(trip: Trip) {
		// Set the date range to match the trip's start and end dates
		const startDate = new Date(trip.start_date);
		const endDate = new Date(trip.end_date);

		// Set the date range in the global state
		setDateRange(startDate, endDate);

		// Navigate to the statistics page
		goto('/dashboard/statistics');
	}

	function filterTrips() {
		let filtered = trips;

		// Apply category filter (search is now handled server-side)
		switch (selectedFilter) {
			case 'recent':
				filtered = filtered.filter((trip) => {
					const tripDate = new Date(trip.start_date);
					const thirtyDaysAgo = new Date();
					thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
					return tripDate >= thirtyDaysAgo;
				});
				break;
			case 'long':
				filtered = filtered.filter((trip) => trip.total_distance > 10000); // > 10km
				break;
			case 'short':
				filtered = filtered.filter((trip) => trip.total_distance <= 10000); // ≤ 10km
				break;
			case 'autogenerated':
				filtered = filtered.filter((trip) => trip.labels?.includes('auto-generated'));
				break;
		}

		filteredTrips = filtered;
	}

	async function loadTrips(userId?: string, loadMore = false) {
		if (isLoading && !loadMore) {

			return;
		}

		if (loadMore && (isLoadingMore || !hasMoreTrips)) {

			return;
		}



		if (loadMore) {
			isLoadingMore = true;
		} else {
		isLoading = true;
		}

		try {
			const session = await supabase.auth.getSession();
			if (!session.data.session) {
				throw new Error('No session found');
			}

			const serviceAdapter = new ServiceAdapter({ session: session.data.session });
			const offset = loadMore ? (currentPage - 1) * tripsPerPage : 0;

			const tripsData = await serviceAdapter.getTrips({
				limit: tripsPerPage,
				offset: offset,
				search: searchQuery || undefined
			});



			// Handle both array and paginated response formats
			let newTrips: Trip[] = [];
			if (Array.isArray(tripsData)) {
				newTrips = tripsData;

				hasMoreTrips = newTrips.length === tripsPerPage;
			} else if ((tripsData as any).trips) {
				newTrips = (tripsData as any).trips;

				hasMoreTrips = newTrips.length === tripsPerPage;
			} else {
				newTrips = [];

				hasMoreTrips = false;
			}

			// Sort trips by end_date descending
			newTrips = newTrips.sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime());


			if (loadMore) {
				// Append new trips to existing ones
				trips = [...trips, ...newTrips];
				currentPage++;
			} else {
				// Replace trips for initial load
				trips = newTrips;
				currentPage = 1;
			}

			filterTrips();
		} catch (error) {
			console.error('❌ [TripsPage] Error loading trips:', error);
			// Only show error if trips is empty after the error
			if (!trips || trips.length === 0) {
				toast.error('Failed to load trips');
			}
		} finally {
			if (loadMore) {
				isLoadingMore = false;
			} else {
			isLoading = false;
			isInitialLoad = false;
			}
		}
	}

	async function loadMoreTrips() {
		if (hasMoreTrips && !isLoadingMore) {

			await loadTrips($sessionStore?.user?.id, true);
		}
	}

	// Handle infinite scroll
	function handleScroll() {
		if (!hasMoreTrips || isLoadingMore) return;

		const scrollTop = window.scrollY;
		const scrollHeight = document.documentElement.scrollHeight;
		const clientHeight = window.innerHeight;
		const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

		// Load more when user scrolls to within 300px of the bottom
		if (distanceFromBottom < 300) {
			console.log('🔄 Infinite scroll triggered - distance from bottom:', distanceFromBottom);
			loadMoreTrips();
		}
	}

	// Handle search with debouncing
	function handleSearchChange() {
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}

		searchTimeout = setTimeout(() => {
			// Reset pagination and reload trips for new search
			currentPage = 1;
			hasMoreTrips = true;
			trips = [];
			loadTrips($sessionStore?.user?.id);
		}, 500); // 500ms debounce
	}



	async function loadUserPreferences() {
		try {
			const session = await supabase.auth.getSession();
			if (!session.data.session) {
				throw new Error('No session found');
			}

			const serviceAdapter = new ServiceAdapter({ session: session.data.session });
			const preferencesData = await serviceAdapter.getPreferences();

			userPreferences = preferencesData;
			serverPexelsApiKeyAvailable = (preferencesData as any)?.server_pexels_api_key_available || false;
		} catch (e) {
			console.error('Error loading user preferences:', e);
			userPreferences = null;
			serverPexelsApiKeyAvailable = false;
		}
	}

	$effect(() => {
		if (selectedFilter) {
		filterTrips();
			// Reset pagination when filters change
			if (!isInitialLoad) {
				hasMoreTrips = true;
				currentPage = 1;
	}
		}
	});

	// Auto-suggest image when both dates are selected and no image is uploaded yet
	$effect(() => {
		if (
		tripForm.start_date &&
		tripForm.end_date &&
		!uploadedImageUrl &&
		!imageFile &&
		!isEditing &&
		showTripModal &&
		!isSuggestingImage
	) {
		// Add a small delay to avoid too many requests
		setTimeout(() => {
			suggestTripImage();
		}, 1000);
	}
	});

	// Only load trips on initial mount, not on every session store change
	$effect(() => {
		if (
			browser &&
			$sessionStoreReady &&
			$sessionStore &&
			$sessionStore.user?.id &&
			isInitialLoad &&
			!isApprovingTrips
		) {
			loadTrips($sessionStore.user.id);
		}
	});

	// Add scroll event listener for infinite scroll
	onMount(() => {
		if (browser) {
					// Throttle scroll events to improve performance
		let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
		const throttledHandleScroll = () => {
			if (scrollTimeout) return;
			scrollTimeout = setTimeout(() => {
				handleScroll();
				scrollTimeout = null;
			}, 100); // Throttle to 100ms
		};

			window.addEventListener('scroll', throttledHandleScroll);

			return () => {
				window.removeEventListener('scroll', throttledHandleScroll);
				if (scrollTimeout) clearTimeout(scrollTimeout);
			};
		}
	});

	async function openSuggestedTripsModal() {
		showSuggestedTripsModal = true;
		isLoadingSuggestedTrips = true;
		selectedSuggestedTrips = [];
		suggestedTripsPagination = {
			limit: 10,
			offset: 0,
			total: 0,
			hasMore: true
		};

		try {
			const session = get(sessionStore);
			if (!session) throw new Error('No session found');

			const serviceAdapter = new ServiceAdapter({ session });
			const result = await serviceAdapter.getSuggestedTrips({
				limit: suggestedTripsPagination.limit,
				offset: suggestedTripsPagination.offset
			}) as any;

			// The API returns { trips: [...], total: number, limit: number, offset: number }
			if (result && result.trips && Array.isArray(result.trips)) {
				// Force reactivity by creating a new array
				suggestedTrips = [];
				suggestedTrips = result.trips;
				suggestedTripsPagination.total = result.total || 0;
				suggestedTripsPagination.hasMore = (suggestedTripsPagination.offset + suggestedTripsPagination.limit) < suggestedTripsPagination.total;
			} else {
				suggestedTrips = [];
			}
		} catch (error) {
			console.error('Error loading suggested trips:', error);
			toast.error('Failed to load suggested trips');
		} finally {
			isLoadingSuggestedTrips = false;
		}
	}

	async function loadMoreSuggestedTrips() {
		if (!suggestedTripsPagination.hasMore || isLoadingMoreSuggestedTrips) return;

		isLoadingMoreSuggestedTrips = true;
		suggestedTripsPagination.offset += suggestedTripsPagination.limit;

		try {
			const session = get(sessionStore);
			if (!session) throw new Error('No session found');

			const serviceAdapter = new ServiceAdapter({ session });
			const result = await serviceAdapter.getSuggestedTrips({
				limit: suggestedTripsPagination.limit,
				offset: suggestedTripsPagination.offset
			}) as any;

			if (result && result.trips && Array.isArray(result.trips)) {
				suggestedTrips = [...suggestedTrips, ...result.trips];
				suggestedTripsPagination.total = result.total || 0;
				suggestedTripsPagination.hasMore = (suggestedTripsPagination.offset + suggestedTripsPagination.limit) < suggestedTripsPagination.total;
			}
		} catch (error) {
			console.error('Error loading more suggested trips:', error);
			toast.error('Failed to load more suggested trips');
		} finally {
			isLoadingMoreSuggestedTrips = false;
		}
	}

	function openTripGenerationModal() {
		// Close the current modal first
		showSuggestedTripsModal = false;

		// Then open the trip generation modal
		showTripGenerationModal = true;
		tripGenerationData = {
			startDate: '',
			endDate: '',
			useCustomHomeAddress: false,
			customHomeAddress: '',
			clearExistingSuggestions: false
		};
		// Reset custom home address input state
		customHomeAddressInput = '';
		customHomeAddressSuggestions = [];
		showCustomHomeAddressSuggestions = false;
		selectedCustomHomeAddress = null;
		selectedCustomHomeAddressIndex = -1;
		customHomeAddressSearchError = null;
	}

	async function generateNewTripSuggestions() {
		try {
			// Clear existing suggestions if checkbox is checked
			if (tripGenerationData.clearExistingSuggestions) {

				const session = get(sessionStore);
				if (!session) throw new Error('No session found');

				const serviceAdapter = new ServiceAdapter({ session });
				await serviceAdapter.clearAllSuggestedTrips();

			}

			const jobData: Record<string, unknown> = {
				useCustomHomeAddress: tripGenerationData.useCustomHomeAddress,
				clearExistingSuggestions: tripGenerationData.clearExistingSuggestions
			};

			// Include dates if they are provided (individually)
			if (tripGenerationData.startDate) {
				jobData.startDate = tripGenerationData.startDate;
			}
			if (tripGenerationData.endDate) {
				jobData.endDate = tripGenerationData.endDate;
			}

			if (tripGenerationData.useCustomHomeAddress && tripGenerationData.customHomeAddress) {
				jobData.customHomeAddress = tripGenerationData.customHomeAddress;
			}

			const session = get(sessionStore);
			if (!session) throw new Error('No session found');

			const serviceAdapter = new ServiceAdapter({ session });
			const result = await serviceAdapter.createJob({
				type: 'trip_generation',
				data: jobData
			}) as any;

			let message = 'Trip generation job started!';

			if (tripGenerationData.startDate && tripGenerationData.endDate) {
				message = `Trip generation job started for ${tripGenerationData.startDate} to ${tripGenerationData.endDate}!`;
			} else if (tripGenerationData.startDate) {
				message = `Trip generation job started from ${tripGenerationData.startDate} onwards!`;
			} else if (tripGenerationData.endDate) {
				message = `Trip generation job started until ${tripGenerationData.endDate}!`;
			} else {
				message = 'Trip generation job started! The system will automatically find available date ranges and generate suggestions.';
			}

			if (tripGenerationData.clearExistingSuggestions) {
				message += ' Existing suggestions have been cleared.';
			}

			toast.success(message);

			// Start tracking the job progress
			if (result.data?.job?.id) {



			}

			// Close modals when starting a new job
			showTripGenerationModal = false;
			showSuggestedTripsModal = false;

			// Check for any other active jobs after a short delay
			setTimeout(async () => {


			}, 2000);
		} catch (error) {
			console.error('Error generating new trip suggestions:', error);
			toast.error('Failed to generate new trip suggestions');
		}
	}





	function openAddTripModal() {
		showTripModal = true;
		isEditing = false;
		editingTrip = null;
		tripForm = { title: '', start_date: '', end_date: '', description: '', labels: [] };
		imageFile = null;
		imagePreview = null;
		imageError = '';
		uploadedImageUrl = null;
		isUploadingImage = false;
		isSuggestingImage = false;
		suggestedImageUrl = null;
		tripAnalysis = null;
		formError = '';
	}

	function openEditTripModal(trip: Trip) {
		showTripModal = true;
		isEditing = true;
		editingTrip = trip;
		tripForm = {
			title: trip.title,
			start_date: trip.start_date,
			end_date: trip.end_date,
			description: trip.description || '',
			labels: trip.labels || []
		};
		// Show existing image if available
		imageFile = null;
		imagePreview = null;
		imageError = '';
		uploadedImageUrl = null;
		isUploadingImage = false;
		isSuggestingImage = false;
		suggestedImageUrl = null;
		tripAnalysis = null;
		imageAttribution = null;
		if (trip.image_url) {
			imagePreview = trip.image_url;
			uploadedImageUrl = trip.image_url;
			// Load existing attribution if available
			if (trip.metadata?.image_attribution) {
				imageAttribution = trip.metadata.image_attribution;
				// If there's attribution, treat it as a suggested image
				if (imageAttribution.source === 'pexels') {
					suggestedImageUrl = trip.image_url;
				}
			} else {

			}
		} else {
			imagePreview = null;
			uploadedImageUrl = null;
		}
		imageFile = null;
		imageError = '';
		isUploadingImage = false;
		formError = '';
	}

	function closeTripModal() {
		showTripModal = false;
		isEditing = false;
		editingTrip = null;
		tripForm = { title: '', start_date: '', end_date: '', description: '', labels: [] };
		imageFile = null;
		imagePreview = null;
		imageError = '';
		uploadedImageUrl = null;
		isUploadingImage = false;
		isSuggestingImage = false;
		suggestedImageUrl = null;
		tripAnalysis = null;
		imageAttribution = null;
		formError = '';
	}

	async function submitTrip(event?: Event) {
		if (isSubmitting) return;

		formError = '';

		if (!tripForm.title.trim()) {
			formError = 'Title is required.';
			return;
		}
		if (!tripForm.start_date || !tripForm.end_date) {
			formError = 'Start and end dates are required.';
			return;
		}
		if (new Date(tripForm.end_date) < new Date(tripForm.start_date)) {
			formError = 'End date must be after start date.';
			return;
		}

		isSubmitting = true;

		try {
			let imageUrl = uploadedImageUrl || (isEditing && editingTrip?.image_url ? editingTrip.image_url : undefined);

			// If we have a suggested Pexels image, use it directly (no need to upload to storage)
			if (suggestedImageUrl && suggestedImageUrl.startsWith('http') && !uploadedImageUrl) {
				imageUrl = suggestedImageUrl;
			}

			// Prepare metadata with attribution if available
			const metadata: {
				image_attribution?: {
					source: 'pexels' | 'picsum' | 'placeholder';
					photographer?: string;
					photographerUrl?: string;
					pexelsUrl?: string;
				};
			} = {};

			// Preserve existing metadata if editing
			if (isEditing && editingTrip?.metadata) {
				Object.assign(metadata, editingTrip.metadata);
			}

			// Add or update attribution if available
			if (imageAttribution && imageAttribution.source === 'pexels') {
				metadata.image_attribution = imageAttribution;
			}

			const tripsService = await getTripsService();
			const tripData = {
				title: tripForm.title.trim(),
				description: tripForm.description?.trim() || '',
				start_date: tripForm.start_date,
				end_date: tripForm.end_date,
				labels: tripForm.labels,
				image_url: imageUrl,
				metadata: Object.keys(metadata).length > 0 ? metadata : undefined
			};

			if (isEditing && editingTrip) {
				await tripsService.updateTrip({
					id: editingTrip.id,
					...tripData
				});
			} else {
				// Include user_id for new trip creation
				await tripsService.createTrip({
					...tripData
				});
			}

			// Store the editing state before closing the modal
			const wasEditing = isEditing;
			closeTripModal();
			toast.success(`Trip ${wasEditing ? 'updated' : 'created'} successfully!`);

			// Reload trips to show the changes
			await loadTrips();
		} catch (error) {
			console.error(`Error ${isEditing ? 'updating' : 'creating'} trip:`, error);
			if (error instanceof Error && error.name === 'AbortError') {
				formError = 'Request timed out. Please try again.';
			} else {
				formError =
					error instanceof Error
						? error.message
						: `Failed to ${isEditing ? 'update' : 'create'} trip`;
			}
		} finally {
			isSubmitting = false;
		}
	}

	function addLabel() {
		if (newLabel.trim() && !tripForm.labels.includes(newLabel.trim())) {
			tripForm.labels = [...tripForm.labels, newLabel.trim()];
			newLabel = '';
		}
	}

	function removeLabel(label: string) {
		tripForm.labels = tripForm.labels.filter((l) => l !== label);
	}

	function confirmDeleteTrip(trip: Trip) {
		tripToDelete = trip;
		showDeleteConfirm = true;
	}
	function cancelDeleteTrip() {
		tripToDelete = null;
		showDeleteConfirm = false;
	}
	async function deleteTrip() {
		if (tripToDelete) {
			try {
				const tripsService = await getTripsService();
				await tripsService.deleteTrip(tripToDelete.id);
				trips = trips.filter((t) => t.id !== tripToDelete?.id);
				filterTrips();
				toast.success('Trip deleted!');
			} catch (error) {
				console.error('Error deleting trip:', error);
				toast.error('Failed to delete trip');
			}
		}
		tripToDelete = null;
		showDeleteConfirm = false;
	}

		async function suggestTripImage() {
		if (!tripForm.start_date || !tripForm.end_date || !$sessionStore?.user?.id) {
			return;
		}

		isSuggestingImage = true;
		imageError = '';
		suggestedImageUrl = null; // Clear previous suggestions
		imagePreview = null; // Clear previous preview

		try {
			const session = get(sessionStore);
			if (!session) throw new Error('No session found');

			const serviceAdapter = new ServiceAdapter({ session });
			const suggestResult = await serviceAdapter.suggestTripImages({
				start_date: tripForm.start_date,
				end_date: tripForm.end_date
			}) as any;



			if (suggestResult.suggestedImageUrl) {
				suggestedImageUrl = suggestResult.suggestedImageUrl;
				imageAttribution = suggestResult.attribution;
				tripAnalysis = suggestResult.analysis;
				imagePreview = suggestResult.suggestedImageUrl;
				uploadedImageUrl = suggestResult.suggestedImageUrl;
				imageError = ''; // Clear any previous errors

				toast.success('Trip image suggested based on your travel data!');
			} else {
				imageError = 'No image suggestion available for this date range.';

			}
		} catch (error) {
			console.error('Error suggesting trip image:', error);
			imageError = 'Failed to suggest image. Please try uploading your own.';
		} finally {
			isSuggestingImage = false;
		}
	}

	async function handleImageChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		imageError = '';
		imageFile = null;
		imagePreview = null;
		uploadedImageUrl = null;
		isUploadingImage = false;
		suggestedImageUrl = null;
		tripAnalysis = null;
		imageAttribution = null;

		if (file) {
			// Validate file
			if (!file.type.startsWith('image/')) {
				imageError = 'Only image files are allowed.';
				return;
			}
			if (file.size > 5 * 1024 * 1024) {
				imageError = 'Image must be less than 5MB.';
				return;
			}

			// Show preview immediately
			imageFile = file;
			const reader = new FileReader();
			reader.onload = (e) => {
				imagePreview = e.target?.result as string;
			};
			reader.readAsDataURL(file);

			// Upload image immediately
			isUploadingImage = true;

			try {
				const uploadedUrl = await uploadTripImage(file);
				if (uploadedUrl) {
					uploadedImageUrl = uploadedUrl;

					toast.success('Image uploaded successfully!');
				} else {
					imageError = 'Failed to upload image. Please try again.';
					console.error('❌ [UPLOAD] Image upload returned null');
				}
			} catch (error) {
				console.error('❌ [UPLOAD] Image upload failed:', error);
				imageError = 'Failed to upload image. Please try again.';
				toast.error('Failed to upload image');
			} finally {
				isUploadingImage = false;
			}
		}
	}

	// Add refreshTripMetadata function
	async function refreshTripMetadata(trip: Trip) {
		try {
			const tripsService = await getTripsService();
			await tripsService.updateTripMetadata(trip.id);
			toast.success('Trip metadata refreshed!');
			await loadTrips();
		} catch (error) {
			console.error('Error refreshing trip metadata:', error);
			toast.error('Failed to refresh trip metadata');
		}
	}

	// Function to upload Pexels image to storage
	async function uploadPexelsImageToStorage(pexelsUrl: string, fileName: string): Promise<string | null> {
		try {
			// Download the image from Pexels
			const response = await fetch(pexelsUrl);
			if (!response.ok) {
				throw new Error(`Failed to download image: ${response.status}`);
			}

			const imageBlob = await response.blob();

			// Upload to Supabase Storage
			const { data, error } = await supabase.storage
				.from('trip-images')
				.upload(fileName, imageBlob, {
					contentType: imageBlob.type,
					upsert: true
				});

			if (error) {
				throw new Error(`Failed to upload image: ${error.message}`);
			}

			// Get the public URL
			const { data: urlData } = supabase.storage
				.from('trip-images')
				.getPublicUrl(fileName);

			return urlData.publicUrl;
			} catch (error) {
			console.error('Error uploading Pexels image to storage:', error);
			return null;
		}
	}

	// State for tracking image generation progress
	// Image loading state
	let imageLoadingStates = $state(new Map<string, boolean>());

	// Approval progress state
	let isApprovalInProgress = false;
	let approvalProgress = {
		step: 'idle' as 'idle' | 'generating-images' | 'creating-trips' | 'complete',
		message: '',
		progress: 0,
		totalSteps: 0,
		currentStep: 0,
		// Image generation progress
		imageProgress: {
			processed: 0,
			total: 0,
			currentTrip: '' as string | null
		}
	};

	async function handleApproveTrips() {

		if (selectedSuggestedTrips.length === 0) {

			return;
		}

		try {


			// Initialize progress
			isApprovalInProgress = true;
			approvalProgress = {
				step: 'generating-images',
				message: 'Generating images for suggested trips...',
				progress: 0,
				totalSteps: 2,
				currentStep: 1,
				imageProgress: {
					processed: 0,
					total: selectedSuggestedTrips.length,
					currentTrip: ''
				}
			};

			// Set flag to prevent reactive reloads
			isApprovingTrips = true;

			const session = get(sessionStore);
			if (!session) throw new Error('No session found');

			const serviceAdapter = new ServiceAdapter({ session });

			// Step 1: Generate images for suggested trips (one by one for granular progress)


			approvalProgress.message = 'Generating images for suggested trips...';
			approvalProgress.progress = 0; // Start at 0%

			const imageResults: any[] = [];
			let successfulImageCount = 0;

			// Process each trip individually for granular progress updates
			for (let i = 0; i < selectedSuggestedTrips.length; i++) {
				const tripId = selectedSuggestedTrips[i];

				// Update progress message to show current trip being processed
				approvalProgress.message = `Generating image for trip ${i + 1}/${selectedSuggestedTrips.length}...`;
				approvalProgress.imageProgress.currentTrip = `Trip ${i + 1}`;

				try {


					// Call the API for a single trip
					const singleImageResult = await serviceAdapter.generateSuggestedTripImages([tripId]) as any;


					if (singleImageResult?.results?.[0]?.success) {
						successfulImageCount++;
						imageResults.push(singleImageResult.results[0]);

						// Update progress based on successful image generation (90% of total work)
						const imageProgressPercent = (successfulImageCount / selectedSuggestedTrips.length) * 90;
						approvalProgress.progress = Math.round(imageProgressPercent);
						approvalProgress.imageProgress.processed = successfulImageCount;

						// Update message with current progress
						approvalProgress.message = `Generated image for trip ${i + 1}/${selectedSuggestedTrips.length} (${successfulImageCount} successful)`;

						// Show which trip was just processed
						if (singleImageResult.results[0].trip_title) {
							approvalProgress.imageProgress.currentTrip = singleImageResult.results[0].trip_title;
							approvalProgress.message = `Generated image for "${singleImageResult.results[0].trip_title}" (${successfulImageCount}/${selectedSuggestedTrips.length} trips)`;
						}
				} else {
						imageResults.push(singleImageResult?.results?.[0] || { suggested_trip_id: tripId, success: false, error: 'Failed to generate image' });
					}
				} catch (error) {
					console.error(`❌ Error generating image for trip ${tripId}:`, error);
					imageResults.push({ suggested_trip_id: tripId, success: false, error: 'Failed to generate image' });
				}
			}

			const imageResult = { results: imageResults };

			// Progress is now updated in the loop above

			// Step 2: Approve trips with generated images

			approvalProgress.step = 'creating-trips';
			approvalProgress.message = 'Creating trips with generated images...';
			approvalProgress.currentStep = 2;

			// Prepare pre-generated images data
			const preGeneratedImages: Record<string, { image_url: string; attribution?: any }> = {};
			if (imageResult?.results) {
				imageResult.results.forEach((result: any) => {
					if (result.success && result.image_url) {
						preGeneratedImages[result.suggested_trip_id] = {
							image_url: result.image_url,
							attribution: result.attribution
						};
					}
				});
			}



			const approveResult = await serviceAdapter.approveSuggestedTrips(selectedSuggestedTrips, preGeneratedImages) as any;




						// Calculate final progress based on successful approvals
			const approvalResults = approveResult.results || [];
			const successfulApprovals = approvalResults.filter((result: any) => result.success);
			const approvedCount = successfulApprovals.length;

			// Progress calculation: 90% for image generation + 10% for approval
			// Each approved trip adds its proportional share to the final 10%
			const approvalProgressPercent = 90 + (approvedCount / selectedSuggestedTrips.length) * 10;
			approvalProgress.progress = Math.round(approvalProgressPercent);

			// Update message to show approval progress
			approvalProgress.message = `Approved ${approvedCount}/${selectedSuggestedTrips.length} trips with images`;

			// Complete the process
			approvalProgress.step = 'complete';
			approvalProgress.message = `Approval completed successfully! ${approvedCount}/${selectedSuggestedTrips.length} trips approved with images.`;
			approvalProgress.progress = 100;

			// Close modal and clear the list
			showSuggestedTripsModal = false;
			suggestedTrips = [];


			// Get the created trip IDs from the approve result




			const createdTripIds = successfulApprovals
				.filter((result: any) => result.tripId)
				.map((result: any) => result.tripId);



			if (createdTripIds.length > 0) {


				// Reload trips to show the newly created trips
				await loadTrips();

				// Verify image attachment by checking the loaded trips
				const approvedTrips = trips.filter(trip => createdTripIds.includes(trip.id));
				const tripsWithImages = approvedTrips.filter(trip => trip.image_url);


				// Show success message
				toast.success(`Trips approved successfully! ${tripsWithImages.length}/${approvedTrips.length} trips have images attached.`);
			} else {

				toast.success('Trips approved successfully');
			}
		} catch (error) {
			console.error('❌ Error approving trips:', error);
			approvalProgress.message = 'Error occurred during approval process';
			toast.error('Failed to approve trips');
		} finally {
			// Reset flags to allow reactive reloads again
			isApprovingTrips = false;
			isApprovalInProgress = false;
		}
	}

	async function handleRejectTrips() {
		if (selectedSuggestedTrips.length === 0) return;

		try {
			const session = get(sessionStore);
			if (!session) throw new Error('No session found');

			const serviceAdapter = new ServiceAdapter({ session });
			const result = await serviceAdapter.rejectSuggestedTrips(selectedSuggestedTrips) as any;

			// Close modal and clear the list
			showSuggestedTripsModal = false;
			suggestedTrips = [];

			// Reload trips to ensure UI is updated
			await loadTrips();

			toast.success('Trips rejected successfully');
		} catch (error) {
			console.error('Error rejecting trips:', error);
			toast.error('Failed to reject trips');
		}
	}

	// Custom home address geocoding functions
	function handleCustomHomeAddressInput(event: Event) {
		const target = event.target as HTMLInputElement;
		customHomeAddressInput = target.value;
		tripGenerationData.customHomeAddress = target.value;
		selectedCustomHomeAddressIndex = -1;
		selectedCustomHomeAddress = null;
		if (customHomeAddressSearchTimeout) clearTimeout(customHomeAddressSearchTimeout);
		if (!customHomeAddressInput.trim()) {
			customHomeAddressSuggestions = [];
			showCustomHomeAddressSuggestions = false;
			return;
		}
		customHomeAddressSearchTimeout = setTimeout(() => searchCustomHomeAddressSuggestions(), 300);
	}

	function handleCustomHomeAddressKeydown(event: CustomEvent<{ event: KeyboardEvent }>) {
		if (!showCustomHomeAddressSuggestions || customHomeAddressSuggestions.length === 0) return;

		const keyboardEvent = event.detail.event;
		switch (keyboardEvent.key) {
			case 'ArrowDown':
				keyboardEvent.preventDefault();
				selectedCustomHomeAddressIndex = Math.min(
					selectedCustomHomeAddressIndex + 1,
					customHomeAddressSuggestions.length - 1
				);
				break;
			case 'ArrowUp':
				keyboardEvent.preventDefault();
				selectedCustomHomeAddressIndex = Math.max(selectedCustomHomeAddressIndex - 1, 0);
				break;
			case 'Enter':
				keyboardEvent.preventDefault();
				if (
					selectedCustomHomeAddressIndex >= 0 &&
					selectedCustomHomeAddressIndex < customHomeAddressSuggestions.length
				) {
					selectCustomHomeAddress(customHomeAddressSuggestions[selectedCustomHomeAddressIndex]);
				}
				break;
			case 'Escape':
				keyboardEvent.preventDefault();
				showCustomHomeAddressSuggestions = false;
				selectedCustomHomeAddressIndex = -1;
				break;
		}
	}

	async function searchCustomHomeAddressSuggestions() {
		if (!customHomeAddressInput.trim() || customHomeAddressInput.trim().length < 3) {
			customHomeAddressSuggestions = [];
			showCustomHomeAddressSuggestions = false;
			customHomeAddressSearchError = null;
			return;
		}
		isCustomHomeAddressSearching = true;
		showCustomHomeAddressSuggestions = true;
		customHomeAddressSearchError = null;
		try {
			const session = get(sessionStore);
			if (!session) return;

			const serviceAdapter = new ServiceAdapter({ session });
			const data = await serviceAdapter.searchGeocode(customHomeAddressInput.trim()) as any;

			// The Edge Functions service returns the data array directly
			customHomeAddressSuggestions = Array.isArray(data) ? data : [];
			showCustomHomeAddressSuggestions = true;
			if (customHomeAddressSuggestions.length === 0) {
				customHomeAddressSearchError = 'No addresses found';
			}
		} catch (error) {
			console.error('Error searching for custom home address:', error);
			customHomeAddressSuggestions = [];
			customHomeAddressSearchError = 'Failed to search for address';
			showCustomHomeAddressSuggestions = true;
		} finally {
			isCustomHomeAddressSearching = false;
		}
	}

	function selectCustomHomeAddress(suggestion: any) {
		customHomeAddressInput = suggestion.display_name;
		tripGenerationData.customHomeAddress = suggestion.display_name;
		selectedCustomHomeAddress = suggestion;
		showCustomHomeAddressSuggestions = false;
		selectedCustomHomeAddressIndex = -1;
	}

	function handleCustomHomeAddressToggle() {
		if (!tripGenerationData.useCustomHomeAddress) {
			// Reset custom home address when unchecking
			customHomeAddressInput = '';
			tripGenerationData.customHomeAddress = '';
			customHomeAddressSuggestions = [];
			showCustomHomeAddressSuggestions = false;
			selectedCustomHomeAddress = null;
			selectedCustomHomeAddressIndex = -1;
			customHomeAddressSearchError = null;
		}
	}

	onMount(async () => {
		if (browser) {
			await loadUserPreferences();
		}




	});

	// Image polling is no longer needed since image generation is synchronous

	onDestroy(() => {
		// Cleanup handled by global job tracking
	});

	// Function to clean up status messages
	function cleanStatusMessage(status: string): string {
		if (!status) return '';

		// Replace any "0009-01-01" dates with "any"
		return status
			.replace(/0009-01-01/g, 'any')
			.replace(/0009-01-01 to any/g, 'any to any')
			.replace(/any to 0009-01-01/g, 'any to any');
	}

	// Function to format date range for display
	function formatDateRange(startDate: string | null | undefined, endDate: string | null | undefined): string {
		const formatDate = (date: string | null | undefined) => {
			// Check if it's a valid date (not "0009-01-01" or similar)
			if (!date || date.startsWith('0009') || date === 'any') {
				return 'not specified';
			}
			try {
				const parsedDate = new Date(date);
				if (isNaN(parsedDate.getTime())) {
					return 'not specified';
				}
				return parsedDate.toLocaleDateString();
			} catch {
				return 'not specified';
			}
		};

		const start = formatDate(startDate);
		const end = formatDate(endDate);

		if (start === 'not specified' && end === 'not specified') {
			return 'any to any';
		} else if (start === 'not specified') {
			return `any to ${end}`;
		} else if (end === 'not specified') {
			return `${start} to present`;
		} else {
			return `${start} to ${end}`;
		}
	}

	// Job handling functions for JobTracker
	// function handleJobUpdates(jobs: JobUpdate[]) {
	// 	console.log('🎯 Trips: handleJobUpdates called with jobs:', jobs);
	// 	// The global store handles all job updates now
	// }

	// function handleJobCompletions(jobs: JobUpdate[]) {
	// 	console.log('🎯 Trips: handleJobCompletions called with jobs:', jobs);
	// 	// The global store handles all job completions now
	// }



	// Add session hydration debug logging
	$effect(() => {
		// This effect ensures UI updates when session changes
	});





</script>

<svelte:head>
	<title>Trips - Wayli</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
		<div class="flex items-center gap-3">
			<Route class="h-8 w-8 text-blue-600 dark:text-gray-400" />
			<h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">Trips</h1>
		</div>
		<div class="flex gap-2">
			<button
				class="flex cursor-pointer items-center gap-2 rounded-lg bg-green-500 px-4 py-2 font-medium text-white transition-colors hover:bg-green-600"
				on:click={openSuggestedTripsModal}
			>
				<BarChart class="h-4 w-4" />
				Review Suggested Trips
			</button>
			<button
				class="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-600"
				on:click={openAddTripModal}
			>
				<Plus class="h-4 w-4" />
				New Trip
			</button>
		</div>
	</div>



	<!-- Search and Filters -->
	<div class="flex flex-col gap-4 md:flex-row">
		<div class="relative flex-1">
			<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
			<input
				type="text"
				placeholder="Search trips..."
				bind:value={searchQuery}
				on:input={handleSearchChange}
				class="w-full rounded-lg border border-gray-300 bg-white py-2 pr-4 pl-10 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
		</div>
		<div class="flex gap-2">
			{#each filters as filter}
				<button
					on:click={() => {
						selectedFilter = filter.value;
						// Reset pagination when filter changes
						currentPage = 1;
						hasMoreTrips = true;
						trips = [];
						loadTrips($sessionStore?.user?.id);
					}}
					class="rounded-lg px-4 py-2 text-sm font-medium transition-colors {selectedFilter ===
					filter.value
						? 'bg-blue-500 text-white'
						: 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
				>
					{filter.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Trip Modal -->
	{#if showTripModal}
		<div
			class="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
		>
			<div
				class="relative w-full max-w-lg cursor-default rounded-2xl bg-white shadow-2xl dark:bg-gray-900 max-h-[90vh] overflow-y-auto"
				role="document"
			>
				<div class="p-8">
				<button
					class="absolute top-4 right-4 cursor-pointer text-gray-400 transition-colors hover:text-red-500"
					on:click={closeTripModal}
					aria-label="Close modal">&times;</button
				>
				<h2 id="modal-title" class="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
					{isEditing ? 'Edit Trip' : 'Add New Trip'}
				</h2>
				<form on:submit|preventDefault={submitTrip} class="space-y-5">
					<div>
						<label
							class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
							for="title">Title</label
						>
						<input
							type="text"
							id="title"
							bind:value={tripForm.title}
							class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
							placeholder="Trip title"
							required
							disabled={isSubmitting}
						/>
					</div>
					<div class="flex gap-4">
						<div class="flex-1">
							<label
								class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
								for="start_date">Start Date</label
							>
							<input
								type="date"
								id="start_date"
								bind:value={tripForm.start_date}
								class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
								required
								disabled={isSubmitting}
							/>
						</div>
						<div class="flex-1">
							<label
								class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
								for="end_date">End Date</label
							>
							<input
								type="date"
								id="end_date"
								bind:value={tripForm.end_date}
								class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
								required
								disabled={isSubmitting}
							/>
						</div>
					</div>
					<div>
						<label
							class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
							for="description">Description</label
						>
						<textarea
							id="description"
							bind:value={tripForm.description}
							rows="3"
							class="w-full resize-none rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
							placeholder="Describe your trip..."
							disabled={isSubmitting}
						></textarea>
					</div>

					<!-- Labels Section -->
					<div>
						<label
							for="new-label"
							class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Labels</label
						>
						<div class="space-y-3">
							<!-- Add new label -->
							<div class="flex gap-2">
								<input
									id="new-label"
									type="text"
									bind:value={newLabel}
									on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addLabel())}
									placeholder="Add a label (e.g., vacation, business, adventure)"
									class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
								/>
								<button
									type="button"
									on:click={addLabel}
									class="rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
								>
									Add
								</button>
							</div>

							<!-- Display existing labels -->
							{#if tripForm.labels.length > 0}
								<div class="flex flex-wrap gap-2">
									{#each tripForm.labels as label}
										<div
											class="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
										>
											<span>{label}</span>
											<button
												type="button"
												on:click={() => removeLabel(label)}
												class="ml-1 hover:text-blue-900 dark:hover:text-blue-100"
											>
												<X class="h-3 w-3" />
											</button>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>

					<div>
						<label
							for="trip-image"
							class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>Trip Image</label
						>

						<!-- Image suggestion section - only show when no image is available -->
						{#if !uploadedImageUrl && !imageFile && !suggestedImageUrl && !imagePreview && tripForm.start_date && tripForm.end_date}
							<div
								class="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20"
							>
								<div class="mb-2 flex items-center justify-between">
									<span class="text-sm font-medium text-blue-700 dark:text-blue-300"
										>Auto-suggested Image</span
									>
									{#if isSuggestingImage}
										<Loader2 class="h-4 w-4 animate-spin text-blue-600" />
									{/if}
								</div>

								{#if tripAnalysis && tripAnalysis.primaryCountry}
									<div class="mb-2 text-xs text-blue-600 dark:text-blue-400">
										Based on your travel to: <strong
											>{tripAnalysis.primaryCity || tripAnalysis.primaryCountry}</strong
										>
									</div>
								{/if}

								{#if suggestedImageUrl}
									<div class="flex items-center gap-2 text-green-600 dark:text-green-400">
										<span class="text-sm">✅ Image suggested successfully</span>
									</div>
								{/if}

								{#if imageError}
									<div class="text-xs text-red-500">{imageError}</div>
								{/if}
							</div>
						{/if}

						{#if isEditing && tripForm.start_date && tripForm.end_date && !uploadedImageUrl && !imageFile}
							<div class="mb-3">
								{#if serverPexelsApiKeyAvailable || userPreferences?.pexels_api_key}
									<button
										type="button"
										class="text-sm font-medium text-blue-600 underline hover:text-blue-700"
										on:click={suggestTripImage}
										disabled={isSuggestingImage}
									>
										{isSuggestingImage ? 'Suggesting...' : 'Auto-suggest image'}
									</button>
									{#if serverPexelsApiKeyAvailable}
										<p class="mt-1 text-xs text-green-600 dark:text-green-400">
											✅ Using server API key for high-quality suggestions
										</p>
									{/if}
								{:else}
									<div class="flex items-center gap-2">
										<button
											type="button"
											class="text-sm font-medium text-blue-600 underline hover:text-blue-700"
											on:click={suggestTripImage}
											disabled={isSuggestingImage}
										>
											{isSuggestingImage ? 'Suggesting...' : 'Auto-suggest image'}
										</button>
										<span class="text-xs text-gray-500 dark:text-gray-400">
											(Using fallback image service)
										</span>
									</div>
								{/if}
								<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
									Analyzes your travel data to suggest relevant images for this trip
								</p>
							</div>
						{/if}

						<!-- Manual upload section -->
						<div class="space-y-2">
							<input
								id="trip-image"
								type="file"
								accept="image/*"
								on:change={handleImageChange}
								class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
								disabled={isUploadingImage}
							/>

							{#if tripForm.start_date && tripForm.end_date}
								<div class="text-xs text-gray-500 dark:text-gray-400">
									{#if !uploadedImageUrl && !imageFile}
										Or <button
											type="button"
											class="text-blue-600 underline hover:text-blue-700"
											on:click={suggestTripImage}
											disabled={isSuggestingImage}
										>
											{isSuggestingImage ? 'Suggesting...' : 'suggest an image'}
										</button> based on your travel data
									{:else if suggestedImageUrl}
										<button
											type="button"
											class="text-blue-600 underline hover:text-blue-700"
											on:click={suggestTripImage}
											disabled={isSuggestingImage}
										>
											{isSuggestingImage ? 'Suggesting...' : 'suggest a different image'}
										</button> based on your travel data
									{/if}
								</div>
							{/if}
						</div>

						{#if isUploadingImage}
							<div class="mt-2 flex items-center gap-2 text-blue-600 dark:text-blue-400">
								<Loader2 class="h-4 w-4 animate-spin" />
								<span class="text-sm">Uploading image...</span>
							</div>
						{/if}

						{#if uploadedImageUrl && !suggestedImageUrl}
							<div class="mt-2 flex items-center gap-2 text-green-600 dark:text-green-400">
								<span class="text-sm">✅ Image uploaded successfully</span>
							</div>
						{/if}

						{#if imagePreview}
							<div class="relative mt-2">
								<img src={imagePreview} alt="Preview" class="max-h-40 rounded-lg" />
								{#if isUploadingImage || isSuggestingImage}
									<div
										class="absolute inset-0 flex items-center justify-center rounded-lg bg-black/20"
									>
										<Loader2 class="h-6 w-6 animate-spin text-white" />
									</div>
								{/if}
								{#if suggestedImageUrl}
									<div
										class="absolute top-2 right-2 rounded bg-blue-500 px-2 py-1 text-xs font-medium text-white"
									>
										Suggested
									</div>
								{/if}

								<!-- Auto-suggest new image button when editing -->
								{#if isEditing && tripForm.start_date && tripForm.end_date}
									<div class="absolute top-2 left-2">
										<button
											type="button"
											class="rounded bg-white/95 px-3 py-1.5 text-xs font-medium text-blue-600 shadow-lg hover:bg-white hover:text-blue-700 transition-all duration-200 dark:bg-gray-800/95 dark:text-blue-400 dark:hover:bg-gray-800"
											on:click={suggestTripImage}
											disabled={isSuggestingImage}
											title="Get a new suggested image based on your travel data"
										>
											{isSuggestingImage ? 'Suggesting...' : '🔄 New suggestion'}
										</button>
									</div>
								{/if}
							</div>

							<!-- Attribution for suggested images -->
							{#if imageAttribution && imageAttribution.source === 'pexels' && imageAttribution.photographer}
								<div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
									Photo by
									{#if imageAttribution.photographerUrl}
										<a
											href={imageAttribution.photographerUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="text-blue-600 hover:text-blue-700 underline"
										>
											{imageAttribution.photographer}
										</a>
									{:else}
										{imageAttribution.photographer}
									{/if}
									on
									<a
										href="https://www.pexels.com"
										target="_blank"
										rel="noopener noreferrer"
										class="text-blue-600 hover:text-blue-700 underline"
									>
										Pexels
									</a>
								</div>
							{/if}
						{/if}
					</div>
					{#if formError}
						<div class="text-sm font-medium text-red-500">{formError}</div>
					{/if}
					<div class="flex justify-end gap-3 pt-2">
						<button
							type="button"
							class="cursor-pointer rounded-lg bg-gray-200 px-5 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
							on:click={closeTripModal}
							disabled={isSubmitting}>Cancel</button
						>
						<button
							type="submit"
							class="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-5 py-2 font-medium text-white transition-colors hover:bg-blue-600"
							disabled={isSubmitting}
						>
							{#if isSubmitting}
								<Loader2 class="h-4 w-4 animate-spin" />
							{/if}
							{isSubmitting
								? isEditing
									? 'Updating...'
									: 'Creating...'
								: isEditing
									? 'Update Trip'
									: 'Add Trip'}
						</button>
					</div>
				</form>
				</div>
			</div>
		</div>
	{/if}

	<!-- Loading State -->
	{#if isLoading || isInitialLoad}
		<div class="flex items-center justify-center py-12">
			<div class="text-center">
				<Loader2 class="mx-auto mb-4 h-8 w-8 animate-spin text-blue-500" />
				<p class="text-gray-600 dark:text-gray-400">Loading trips...</p>
			</div>
		</div>
	{:else if filteredTrips.length === 0}
		<div class="py-12 text-center">
			<Route class="mx-auto mb-4 h-12 w-12 text-gray-400" />
			<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">No trips found</h3>
			<p class="mb-4 text-gray-600 dark:text-gray-400">
				{searchQuery || selectedFilter !== 'all'
					? 'Try adjusting your search or filters'
					: 'Start creating your first trip to see it here'}
			</p>
			<button
				class="cursor-pointer rounded-lg bg-blue-500 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-600"
				on:click={openAddTripModal}
			>
				<Plus class="mr-2 inline h-4 w-4" />
				Create Trip
			</button>
		</div>
	{:else}
		<!-- Trips Grid -->
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each filteredTrips as trip}
				<div
					class="relative flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-[#23232a] dark:bg-[#23232a]"
				>
					<!-- Action Buttons -->
					<div class="absolute top-3 right-3 z-10 flex gap-2">
						<button
							class="cursor-pointer rounded-full bg-gray-100 p-2 text-gray-400 transition-colors hover:bg-blue-100 hover:text-blue-500 dark:bg-gray-700 dark:hover:bg-blue-900/30"
							on:click={() => refreshTripMetadata(trip)}
							aria-label="Refresh trip metadata"
						>
							<RefreshCw class="h-5 w-5" />
						</button>
						<button
							class="cursor-pointer rounded-full bg-gray-100 p-2 text-gray-400 transition-colors hover:bg-blue-100 hover:text-blue-500 dark:bg-gray-700 dark:hover:bg-blue-900/30"
							on:click={() => openEditTripModal(trip)}
							aria-label="Edit trip"
						>
							<Edit class="h-5 w-5" />
						</button>
						<button
							class="cursor-pointer rounded-full bg-gray-100 p-2 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-500 dark:bg-gray-700 dark:hover:bg-red-900/30"
							on:click={() => confirmDeleteTrip(trip)}
							aria-label="Delete trip"
						>
							<Trash2 class="h-5 w-5" />
						</button>
					</div>
					<!-- Trip Image -->
					<div class="relative h-48 bg-gray-200 dark:bg-gray-700">
						{#if getTripImage(trip)}
							{#if imageLoadingStates.get(trip.id) === true}
								<!-- Loading placeholder -->
								<div class="flex h-full w-full items-center justify-center">
									<div class="text-center">
										<Loader2 class="mx-auto h-12 w-12 animate-spin text-blue-500" />
										<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading image...</p>
									</div>
								</div>
							{/if}
							<!-- Actual image (hidden while loading) -->
							<img
								src={getTripImage(trip)}
								alt={trip.title}
								class="h-full w-full object-cover {imageLoadingStates.get(trip.id) === true ? 'hidden' : ''}"
								on:load={() => handleImageLoad(trip.id)}
								on:error={() => handleImageError(trip.id)}
								on:loadstart={() => startImageLoading(trip.id)}
							/>
						{:else}
							<div class="flex h-full w-full items-center justify-center">
								<div class="text-center">
									<Route class="mx-auto h-12 w-12 text-gray-400" />
									<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">No image available</p>
								</div>
							</div>
						{/if}
						<!-- Distance label at bottom right -->
						<div
							class="absolute right-3 bottom-3 flex items-center gap-1 rounded bg-black/60 px-3 py-1 text-xs font-medium text-white shadow"
						>
							<Route class="h-4 w-4 text-blue-400" />
							{formatDistance(trip.metadata?.distance_traveled ?? 0)}
						</div>
						<!-- Autogenerated label at top left -->
						{#if trip.labels?.includes('auto-generated')}
							<div
								class="absolute top-3 left-3 rounded bg-blue-500 px-2 py-1 text-xs font-medium text-white shadow"
							>
								Auto-generated
							</div>
						{/if}
						<!-- Note: Removed image generation status indicators since images are now generated before trip creation -->
					</div>
					<!-- Trip Details and Footer -->
					<div class="flex min-h-0 flex-1 flex-col p-4">
						<h3 class="mb-2 line-clamp-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
							{trip.title}
						</h3>
						{#if trip.description}
							<p class="mb-3 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
								{trip.description}
							</p>
						{/if}
						<!-- Trip Stats -->
						<div class="mb-4 space-y-2">
							<div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
								<Calendar class="h-4 w-4" />
								<span
									>{format(new Date(trip.start_date), 'MMM d, yyyy')} - {format(
										new Date(trip.end_date),
										'MMM d, yyyy'
									)}</span
								>
							</div>
							<div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
								<Clock class="h-4 w-4" />
								<span>{formatDuration(trip.start_date, trip.end_date)}</span>
							</div>
							<div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
								<MapPin class="h-4 w-4" />
								<span>{trip.metadata?.point_count ?? 0} points</span>
							</div>

																												<!-- Pexels attribution -->
							{#if trip.metadata?.image_attribution?.source === 'pexels' && trip.metadata?.image_attribution?.photographer}
								<div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
									<span class="text-xs">📸</span>
									<span class="text-xs">
										Photo by
										{#if trip.metadata?.image_attribution?.photographerUrl}
											<a
												href={trip.metadata.image_attribution.photographerUrl}
												target="_blank"
												rel="noopener noreferrer"
												class="text-blue-600 hover:text-blue-700 underline dark:text-blue-400 dark:hover:text-blue-300"
											>
												{trip.metadata.image_attribution.photographer}
											</a>
										{:else}
											{trip.metadata.image_attribution.photographer}
										{/if}
										on
										<a
											href="https://www.pexels.com"
											target="_blank"
											rel="noopener noreferrer"
											class="text-blue-600 hover:text-blue-700 underline dark:text-blue-400 dark:hover:text-blue-300"
										>
											Pexels
										</a>
									</span>
								</div>
							{/if}
							<!-- Labels -->
							{#if trip.labels && trip.labels.length > 0}
								<div class="flex flex-wrap gap-1">
									{#each trip.labels as label}
										<span
											class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium
											{label === 'auto-generated'
												? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
												: label === 'suggested'
													? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
													: label === 'vacation'
														? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
														: label === 'business'
															? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
															: label === 'adventure'
																? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
																: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}"
										>
											{label}
										</span>
									{/each}
								</div>
							{/if}
						</div>
						<!-- Footer: always at the bottom -->
						<div
							class="mt-auto flex items-center justify-between border-t border-gray-200 pt-3 dark:border-gray-700"
						>
							<span class="text-xs text-gray-500 dark:text-gray-400">
								Updated {getRelativeTime(trip.updated_at)}
							</span>
							<button
								class="flex cursor-pointer items-center gap-1 text-sm font-medium text-blue-500 transition-colors hover:text-blue-600"
								on:click={() => showTripStatistics(trip)}
							>
								<BarChart class="h-4 w-4" />
								Show statistics
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Loading indicator for infinite scroll -->
		{#if isLoadingMore}
			<div class="mt-6 flex justify-center">
				<div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
					<Loader2 class="h-5 w-5 animate-spin" />
					<span>Loading more trips...</span>
				</div>
			</div>
		{/if}

		<!-- Results Summary -->
		<div class="py-4 text-center">
			<p class="text-sm text-gray-600 dark:text-gray-400">
				Showing {filteredTrips.length} of {trips.length} trips
				{#if hasMoreTrips}
					(and more available)
				{/if}
			</p>
		</div>
	{/if}

	<!-- Suggested Trips Modal -->
	<Modal
		open={showSuggestedTripsModal}
		title="Review Suggested Trips"
		size="xl"
		on:close={() => (showSuggestedTripsModal = false)}
	>
		<div class="flex flex-col h-full max-h-[70vh]">
			<!-- Scrollable content area -->
			<div
				class="flex-1 space-y-6 overflow-y-auto min-h-0"
				on:scroll={(e) => {
					const target = e.currentTarget;
					const scrollTop = target.scrollTop;
					const scrollHeight = target.scrollHeight;
					const clientHeight = target.clientHeight;

					// Load more when user scrolls to within 100px of the bottom
					if (scrollHeight - scrollTop - clientHeight < 100 &&
						suggestedTripsPagination.hasMore &&
						!isLoadingMoreSuggestedTrips) {
						loadMoreSuggestedTrips();
					}
				}}
			>
			<!-- Header with Generate New Suggestions button -->
			<div class="flex items-center justify-between">
				<div></div> <!-- Empty div for spacing -->
				<GenerateSuggestionsButton
					on:click={openTripGenerationModal}
				/>
			</div>

			{#if isLoadingSuggestedTrips && suggestedTrips.length === 0}
				<div class="flex items-center justify-center py-12">
					<Loader2 class="h-8 w-8 animate-spin text-blue-500" />
					<span class="ml-2 text-gray-600 dark:text-gray-400">Loading suggested trips...</span>
				</div>
			{:else if suggestedTrips.length === 0}
				<div class="py-12 text-center">
					<Route class="mx-auto mb-4 h-12 w-12 text-gray-400" />
					<h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">
						No suggested trips
					</h3>
					<p class="text-gray-600 dark:text-gray-400">No pending trip suggestions found.</p>
				</div>
			{:else}
				<div class="space-y-4">
					<div class="flex items-center justify-between">
						<p class="text-sm text-gray-600 dark:text-gray-400">
							{suggestedTrips.length} suggested trip{suggestedTrips.length !== 1 ? 's' : ''} found
						</p>
						<div class="flex gap-2">
							<button
								class="cursor-pointer rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
								on:click={() => (selectedSuggestedTrips = suggestedTrips.map((t) => t.id))}
							>
								Select All
							</button>
							<button
								class="cursor-pointer rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
								on:click={() => (selectedSuggestedTrips = [])}
							>
								Clear Selection
							</button>
						</div>
					</div>

					<div class="grid gap-4">
						{#each suggestedTrips as trip}
							<div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
								<div class="flex items-start gap-4">
									<input
										type="checkbox"
										id={`trip-${trip.id}`}
										checked={selectedSuggestedTrips.includes(trip.id)}
										on:change={(e) => {
											const target = e.target as HTMLInputElement;
											if (target.checked) {
												selectedSuggestedTrips = [...selectedSuggestedTrips, trip.id];
											} else {
												selectedSuggestedTrips = selectedSuggestedTrips.filter(
													(id) => id !== trip.id
												);
											}
										}}
										class="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
									/>
									<div class="flex-1">
										<div class="mb-2 flex items-center justify-between">
											<label
												for={`trip-${trip.id}`}
												class="text-lg font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-blue-600"
											>
												{trip.title}
											</label>

										</div>
										<p class="mb-2 text-sm text-gray-600 dark:text-gray-400">
											{trip.description}
										</p>
										<div class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
											<span>Start: {format(new Date(trip.start_date), 'MMM d, yyyy')}</span>
											<span>End: {format(new Date(trip.end_date), 'MMM d, yyyy')}</span>
											<span>{trip.metadata?.point_count || 0} data points</span>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>

					<!-- Loading indicator for infinite scroll -->
					{#if isLoadingMoreSuggestedTrips}
						<div class="flex items-center justify-center py-4">
							<div class="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
							<span class="ml-3 text-sm text-gray-600 dark:text-gray-400">Loading more trips...</span>
						</div>
					{/if}

					<!-- End of list indicator -->
					{#if !suggestedTripsPagination.hasMore && suggestedTrips.length > 0}
						<div class="text-center py-4">
							<span class="text-sm text-gray-500 dark:text-gray-400">
								All {suggestedTripsPagination.total} suggested trips loaded
							</span>
						</div>
					{/if}

				</div>
			{/if}
			</div>

			<!-- Sticky Action Buttons -->
			<div class="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
				<button
					on:click={() => (showSuggestedTripsModal = false)}
					class="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
				>
					Cancel
				</button>
				<button
					on:click={handleRejectTrips}
					disabled={selectedSuggestedTrips.length === 0}
					class="flex flex-1 items-center justify-center rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-700"
				>
					<X class="mr-2 h-4 w-4 flex-shrink-0" />
					<span class="truncate">
						Reject {selectedSuggestedTrips.length} Trip{selectedSuggestedTrips.length !== 1 ? 's' : ''}
					</span>
				</button>
				<button
					on:click={() => {

						handleApproveTrips();
					}}
					disabled={selectedSuggestedTrips.length === 0}
					class="flex flex-1 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700"
				>
					<Plus class="mr-2 h-4 w-4 flex-shrink-0" />
					<span class="truncate">
						Approve {selectedSuggestedTrips.length} Trip{selectedSuggestedTrips.length !== 1 ? 's' : ''}
					</span>
				</button>
			</div>
		</div>
	</Modal>

	<!-- Trip Generation Modal -->
	<TripGenerationModal
		open={showTripGenerationModal}
		bind:startDate={tripGenerationData.startDate}
		bind:endDate={tripGenerationData.endDate}
		bind:useCustomHomeAddress={tripGenerationData.useCustomHomeAddress}
		bind:customHomeAddress={tripGenerationData.customHomeAddress}
		bind:customHomeAddressInput
		bind:isCustomHomeAddressSearching
		bind:customHomeAddressSuggestions
		bind:showCustomHomeAddressSuggestions
		bind:selectedCustomHomeAddressIndex
		bind:customHomeAddressSearchError
		bind:selectedCustomHomeAddress
		bind:clearExistingSuggestions={tripGenerationData.clearExistingSuggestions}
		on:close={() => (showTripGenerationModal = false)}
		on:generate={generateNewTripSuggestions}
		on:customHomeAddressToggle={handleCustomHomeAddressToggle}
		on:customHomeAddressInput={handleCustomHomeAddressInput}
		on:customHomeAddressKeydown={handleCustomHomeAddressKeydown}
		on:selectCustomHomeAddress={selectCustomHomeAddress}
	/>

	<!-- Delete Confirmation Modal -->
	{#if showDeleteConfirm && tripToDelete}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			aria-labelledby="delete-modal-title"
		>
			<div
				class="relative mx-4 w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-gray-900"
				role="document"
			>
				<h2 id="delete-modal-title" class="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">
					Delete Trip
				</h2>
				<p class="mb-6 text-gray-700 dark:text-gray-300">
					Are you sure you want to delete <span class="font-semibold"
						>{tripToDelete?.title || ''}</span
					>? This action cannot be undone.
				</p>
				<div class="flex justify-end gap-3">
					<button
						class="cursor-pointer rounded-lg bg-gray-200 px-5 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
						on:click={cancelDeleteTrip}>Cancel</button
					>
					<button
						class="cursor-pointer rounded-lg bg-red-500 px-5 py-2 font-medium text-white transition-colors hover:bg-red-600"
						on:click={deleteTrip}>Delete</button
					>
				</div>
			</div>
		</div>
	{/if}

	<!-- Approval Progress Modal -->
	{#if isApprovalInProgress}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			aria-labelledby="progress-modal-title"
		>
			<div
				class="relative mx-4 w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-gray-900"
				role="document"
			>
				<h2 id="progress-modal-title" class="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">
					Approving Trips
				</h2>

				<!-- Progress Steps -->
				<div class="mb-6">
					<div class="flex items-center justify-between mb-2">
						<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Step {approvalProgress.currentStep} of {approvalProgress.totalSteps}</span>
						<span class="text-sm text-gray-500 dark:text-gray-400">{approvalProgress.progress}%</span>
					</div>

					<!-- Progress Bar -->
					<div class="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
						<div
							class="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
							style="width: {approvalProgress.progress}%"
						></div>
					</div>
				</div>

				<!-- Step Indicators -->
				<div class="mb-6 space-y-3">
					<div class="flex items-center">
						<div class="flex-shrink-0">
							{#if approvalProgress.step === 'generating-images' || approvalProgress.step === 'creating-trips' || approvalProgress.step === 'complete'}
								<div class="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
									<Check class="w-4 h-4 text-white" />
								</div>
							{:else}
								<div class="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center">
									<span class="text-xs text-gray-600">1</span>
								</div>
							{/if}
						</div>
						<div class="ml-3">
							<p class="text-sm font-medium text-gray-900 dark:text-gray-100">Generate Images</p>
							<p class="text-xs text-gray-500 dark:text-gray-400">Creating images for suggested trips</p>
						</div>
					</div>

					<div class="flex items-center">
						<div class="flex-shrink-0">
							{#if approvalProgress.step === 'creating-trips' || approvalProgress.step === 'complete'}
								<div class="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
									<Check class="w-4 h-4 text-white" />
								</div>
							{:else}
								<div class="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center">
									<span class="text-xs text-gray-600">2</span>
								</div>
							{/if}
						</div>
						<div class="ml-3">
							<p class="text-sm font-medium text-gray-900 dark:text-gray-100">Create Trips</p>
							<p class="text-xs text-gray-500 dark:text-gray-400">Approving trips with images</p>
						</div>
					</div>
				</div>

				<!-- Current Status Message -->
				<div class="mb-6 p-4 bg-blue-50 rounded-lg dark:bg-blue-900/20">
					<div class="flex items-center">
						{#if approvalProgress.step === 'generating-images'}
							<Loader2 class="w-5 h-5 text-blue-600 animate-spin mr-3" />
						{:else if approvalProgress.step === 'creating-trips'}
							<Loader2 class="w-5 h-5 text-blue-600 animate-spin mr-3" />
						{:else if approvalProgress.step === 'complete'}
							<Check class="w-5 h-5 text-green-600 mr-3" />
						{/if}
						<p class="text-sm text-blue-800 dark:text-blue-200">{approvalProgress.message}</p>
					</div>

					{#if approvalProgress.step === 'generating-images' && approvalProgress.imageProgress.total > 0}
						<div class="mt-3">
							<div class="flex justify-between text-xs text-blue-700 dark:text-blue-300 mb-1">
								<span>Image Generation Progress</span>
								<span>{approvalProgress.imageProgress.processed}/{approvalProgress.imageProgress.total}</span>
							</div>
							<div class="w-full bg-blue-200 rounded-full h-1.5 dark:bg-blue-800">
								<div
									class="bg-blue-600 h-1.5 rounded-full transition-all duration-300 ease-out"
									style="width: {(approvalProgress.imageProgress.processed / approvalProgress.imageProgress.total) * 100}%"
								></div>
							</div>
							{#if approvalProgress.imageProgress.currentTrip}
								<p class="text-xs text-blue-600 dark:text-blue-400 mt-1">
									Last processed: {approvalProgress.imageProgress.currentTrip}
								</p>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Action Buttons -->
				{#if approvalProgress.step === 'complete'}
					<div class="flex justify-end">
						<button
							class="cursor-pointer rounded-lg bg-blue-600 px-5 py-2 font-medium text-white transition-colors hover:bg-blue-700"
							on:click={() => isApprovalInProgress = false}
						>
							Close
						</button>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Powered by Pexels Footer -->
	<div class="mt-12 text-center">
		<div class="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-400">
			<span>Powered by</span>
			<a
				href="https://www.pexels.com"
				target="_blank"
				rel="noopener noreferrer"
				class="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
			>
				Pexels
			</a>
			<span>for high-quality trip images</span>
		</div>
	</div>
</div>



<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.modal-overlay {
		margin: 0 !important;
		height: 100vh;
		min-height: 100vh;
	}
</style>
