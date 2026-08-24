package io.github.nimbleflux.wayli.feature.travel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.models.Trip
import io.github.nimbleflux.wayli.repo.AdminRepository
import io.github.nimbleflux.wayli.repo.CommunityRepository
import io.github.nimbleflux.wayli.repo.CommunityStory
import io.github.nimbleflux.wayli.repo.TripRepository
import io.github.nimbleflux.wayli.session.InstanceManager
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

sealed interface TripUiState {
    data object Loading : TripUiState
    data class Success(val trips: List<Trip>) : TripUiState
    data class Error(val message: String) : TripUiState
}

/** Journal summary shown on the merged Travel list cards. */
data class JournalPreview(
    val entryCount: Int,
    val latestTitle: String? = null,
    val latestDate: String? = null,
)

@HiltViewModel
class TripViewModel @Inject constructor(
    private val tripRepo: TripRepository,
    private val fluxbaseClient: FluxbaseClient,
    private val demoManager: io.github.nimbleflux.wayli.demo.DemoManager,
    private val adminRepo: AdminRepository,
    private val communityRepo: CommunityRepository,
    private val instanceManager: InstanceManager,
    private val mediaUploader: io.github.nimbleflux.wayli.feature.media.MediaUploader,
    onlineMonitor: io.github.nimbleflux.wayli.util.OnlineMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow<TripUiState>(TripUiState.Loading)
    val uiState: StateFlow<TripUiState> = _uiState.asStateFlow()

    private val _selectedTrip = MutableStateFlow<Trip?>(null)
    val selectedTrip: StateFlow<Trip?> = _selectedTrip.asStateFlow()

    /** Trip id → journal summary (merges the old Journals tab into Travel). */
    private val _journalPreviews = MutableStateFlow<Map<String, JournalPreview>>(emptyMap())
    val journalPreviews: StateFlow<Map<String, JournalPreview>> = _journalPreviews.asStateFlow()

    /** Live connectivity — drives the offline banner (cached data served). */
    val online: StateFlow<Boolean> = onlineMonitor.online

    fun loadTrips() {
        if (demoManager.isDemoMode) {
            val trips = io.github.nimbleflux.wayli.demo.DemoData.trips.sortedByDescending { it.startDate }
            _uiState.value = TripUiState.Success(trips)
            _journalPreviews.value = trips.associate { trip ->
                val entries = io.github.nimbleflux.wayli.demo.DemoData.entries[trip.id].orEmpty()
                trip.id to JournalPreview(
                    entryCount = entries.size,
                    latestTitle = entries.lastOrNull()?.title,
                    latestDate = entries.lastOrNull()?.entryDate,
                )
            }
            return
        }
        val userId = fluxbaseClient.auth?.currentSession?.user?.id ?: run {
            _uiState.value = TripUiState.Error("Not authenticated")
            return
        }
        viewModelScope.launch {
            _uiState.value = TripUiState.Loading
            tripRepo.listTrips(userId)
                .onSuccess { trips ->
                    _uiState.value = TripUiState.Success(trips)
                    loadJournalPreviews(trips)
                    fillMissingCovers(trips)
                }
                .onFailure { _uiState.value = TripUiState.Error(it.message ?: "Failed to load trips") }
        }
    }

    /**
     * Auto-detected trips usually have no `image_url` — fall back to the
     * trip's first photo (one batched `trip_media` query) so list cards and
     * heroes aren't stuck on the placeholder. Only patches trips that are
     * still on screen.
     */
    private fun fillMissingCovers(trips: List<Trip>) {
        val missing = trips.filter { it.imageUrl.isNullOrBlank() }
        if (missing.isEmpty()) return
        viewModelScope.launch {
            val firstMedia = tripRepo.firstMediaPerTrip(missing.map { it.id }).getOrNull() ?: return@launch
            val patches = mutableMapOf<String, String>()
            missing.forEach { trip ->
                val media = firstMedia[trip.id] ?: return@forEach
                mediaUploader.resolveDisplayUrl(storagePath = media.storagePath)?.let { url ->
                    patches[trip.id] = url
                }
            }
            if (patches.isEmpty()) return@launch
            val current = _uiState.value as? TripUiState.Success ?: return@launch
            _uiState.value = TripUiState.Success(
                current.trips.map { trip ->
                    patches[trip.id]?.let { trip.copy(imageUrl = it) } ?: trip
                },
            )
        }
    }

    /** Concurrently fetch per-trip journal summaries (small selects). */
    private fun loadJournalPreviews(trips: List<Trip>) {
        viewModelScope.launch {
            kotlinx.coroutines.coroutineScope {
                trips.forEach { trip ->
                    launch {
                        val entries = tripRepo.listEntries(trip.id).getOrNull().orEmpty()
                        _journalPreviews.value = _journalPreviews.value + (
                            trip.id to JournalPreview(
                                entryCount = entries.size,
                                latestTitle = entries.lastOrNull()?.title,
                                latestDate = entries.lastOrNull()?.entryDate,
                            )
                            )
                    }
                }
            }
        }
    }

    fun selectTrip(trip: Trip) {
        _selectedTrip.value = trip
    }

    fun createTrip(title: String, startDate: String, endDate: String?, description: String?) {
        val userId = fluxbaseClient.auth?.currentSession?.user?.id ?: return
        viewModelScope.launch {
            tripRepo.createTrip(userId, title, startDate, endDate, description)
                .onSuccess { loadTrips() }
        }
    }

    fun deleteTrip(tripId: String) {
        viewModelScope.launch {
            tripRepo.deleteTrip(tripId)
                .onSuccess { loadTrips() }
        }
    }

    // ---- Trip auto-detection (web-parity "Auto-detect Trips") ----

    private val _detectMessage = MutableStateFlow<String?>(null)
    val detectMessage: StateFlow<String?> = _detectMessage.asStateFlow()

    private val _detectRunning = MutableStateFlow(false)
    val detectRunning: StateFlow<Boolean> = _detectRunning.asStateFlow()

    val isDemoMode: Boolean get() = demoManager.isDemoMode

    /**
     * Submit the `trip-generation` job (the same job the web's travel
     * dashboard submits). Optional [startDate]/[endDate] bound the scan;
     * blank values scan the full history. Detected trips appear after the
     * job finishes — reload to pick them up.
     */
    fun submitTripGeneration(startDate: String?, endDate: String?) {
        if (demoManager.isDemoMode || _detectRunning.value) return
        viewModelScope.launch {
            _detectRunning.value = true
            _detectMessage.value = null
            adminRepo.runTripGeneration(
                startDate = startDate?.trim()?.takeIf { it.isNotBlank() },
                endDate = endDate?.trim()?.takeIf { it.isNotBlank() },
            ).fold(
                onSuccess = {
                    _detectMessage.value = "Trip detection queued — detected trips appear in a few minutes."
                    loadTrips()
                },
                onFailure = { _detectMessage.value = it.message ?: "Failed to submit trip detection" },
            )
            _detectRunning.value = false
        }
    }

    fun clearDetectMessage() { _detectMessage.value = null }

    // ---- Community (public stories feed, hidden when the hub is disabled) ----

    /** Story + resolved author, ready to render. */
    data class StoryRow(
        val story: CommunityStory,
        val authorName: String?,
        val authorUsername: String?,
    )

    sealed interface StoriesUiState {
        data object Loading : StoriesUiState
        data class Success(val stories: List<StoryRow>, val endReached: Boolean) : StoriesUiState
        data class Error(val message: String) : StoriesUiState
    }

    private val _communityEnabled = MutableStateFlow(false)
    val communityEnabled: StateFlow<Boolean> = _communityEnabled.asStateFlow()

    private val _stories = MutableStateFlow<StoriesUiState>(StoriesUiState.Loading)
    val stories: StateFlow<StoriesUiState> = _stories.asStateFlow()

    /** True while a further page of stories is fetching (infinite-scroll footer). */
    private val _storiesLoadingMore = MutableStateFlow(false)
    val storiesLoadingMore: StateFlow<Boolean> = _storiesLoadingMore.asStateFlow()

    private var communityChecked = false

    /** Check the server's community-hub setting once per session (demo: on). */
    fun checkCommunity() {
        if (demoManager.isDemoMode) {
            _communityEnabled.value = true
            return
        }
        if (communityChecked) return
        communityChecked = true
        viewModelScope.launch(Dispatchers.IO) {
            _communityEnabled.value = communityRepo.communityEnabled()
        }
    }

    /** Load (or page) the stories feed; [reset] restarts from the top. */
    fun loadStories(reset: Boolean = false) {
        if (demoManager.isDemoMode) {
            _stories.value = StoriesUiState.Success(
                io.github.nimbleflux.wayli.demo.DemoData.communityStories.map {
                    StoryRow(
                        story = CommunityStory(
                            id = it.id,
                            tripId = it.tripId,
                            title = it.title,
                            body = it.body,
                            entryDate = it.entryDate,
                            tripTitle = it.tripTitle,
                            tripImageUrl = it.tripImageUrl,
                        ),
                        authorName = it.authorName,
                        authorUsername = it.authorUsername,
                    )
                },
                endReached = true,
            )
            return
        }
        val current = _stories.value as? StoriesUiState.Success
        val offset = when {
            reset || current == null -> 0
            else -> current.stories.size
        }
        if (offset > 0 && _storiesLoadingMore.value) return
        viewModelScope.launch(Dispatchers.IO) {
            if (offset == 0) {
                _stories.value = StoriesUiState.Loading
            } else {
                _storiesLoadingMore.value = true
            }
            communityRepo.stories(offset).fold(
                onSuccess = { (page, authors) ->
                    val byId = authors.associateBy { it.id }
                    val rows = page.map { story ->
                        val author = story.tripOwnerId?.let { byId[it] }
                        StoryRow(
                            story = story,
                            authorName = author?.fullName ?: author?.username,
                            authorUsername = author?.username,
                        )
                    }
                    val merged = if (offset == 0) rows else (current?.stories ?: emptyList()) + rows
                    _stories.value = StoriesUiState.Success(merged, endReached = page.isEmpty())
                },
                onFailure = {
                    if (offset == 0) {
                        _stories.value = StoriesUiState.Error(it.message ?: "Failed to load stories")
                    } // paging failures keep the current rows; the next scroll retries
                },
            )
            _storiesLoadingMore.value = false
        }
    }

    /**
     * Public web URL for a story's trip — only when both the Wayli web URL is
     * configured and the author's username is known (`/u/{username}/trips/{id}`).
     */
    fun storyWebUrl(row: StoryRow): String? {
        val webUrl = instanceManager.getConfig()?.webUrl ?: return null
        val username = row.authorUsername ?: return null
        return "$webUrl/u/$username/trips/${row.story.tripId}"
    }
}
