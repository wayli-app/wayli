package io.github.nimbleflux.wayli.feature.travel

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.demo.DemoData
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.models.Trip
import io.github.nimbleflux.wayli.models.TripEntry
import io.github.nimbleflux.wayli.repo.DraftRepository
import io.github.nimbleflux.wayli.repo.StatsAggregator
import io.github.nimbleflux.wayli.repo.StatsRepository
import io.github.nimbleflux.wayli.repo.TripRepository
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class TripDetailData(
    val trip: Trip,
)

sealed interface TripDetailUiState {
    data object Loading : TripDetailUiState
    data class Error(val message: String) : TripDetailUiState
    data class Success(val data: TripDetailData) : TripDetailUiState
}

/**
 * Loads a single trip and its journal entries by id (from the nav
 * SavedStateHandle). Demo mode serves [DemoData]; real mode calls the repos.
 * Journal entries are exposed as a separate [StateFlow] so [addEntry] can
 * prepend (in-memory for demo, persisted for real instances).
 *
 * The trip's GPS track ([track]) comes from DemoData in demo mode and from
 * `tracker_data` between the trip's start/end dates in real mode.
 */
@HiltViewModel
class TripDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val demoManager: DemoManager,
    private val tripRepo: TripRepository,
    private val statsRepo: StatsRepository,
    private val client: FluxbaseClient,
    private val draftRepo: DraftRepository,
    private val mediaUploader: io.github.nimbleflux.wayli.feature.media.MediaUploader,
) : ViewModel() {

    val tripId: String = savedStateHandle.get<String>("tripId") ?: ""

    private val _state = MutableStateFlow<TripDetailUiState>(TripDetailUiState.Loading)
    val state: StateFlow<TripDetailUiState> = _state.asStateFlow()

    private val _entries = MutableStateFlow<List<TripEntry>>(emptyList())
    val entries: StateFlow<List<TripEntry>> = _entries.asStateFlow()

    /** Ordered (lat, lon) coordinates for the trip map; empty = no track. */
    private val _track = MutableStateFlow<List<Pair<Double, Double>>>(emptyList())
    val track: StateFlow<List<Pair<Double, Double>>> = _track.asStateFlow()

    /** Signed URLs per media id (all media of the trip). */
    private val _mediaUrls = MutableStateFlow<Map<String, String>>(emptyMap())
    val mediaUrls: StateFlow<Map<String, String>> = _mediaUrls.asStateFlow()

    /** Raw media rows (id, entryId, cover resolution order preserved). */
    private val _media = MutableStateFlow<List<io.github.nimbleflux.wayli.models.TripMedia>>(emptyList())
    val media: StateFlow<List<io.github.nimbleflux.wayli.models.TripMedia>> = _media.asStateFlow()

    /**
     * The entry's hero photo URL (cover_media_id → first by sort_order —
     * the web's cover-resolution rule), or null when the entry has no media.
     */
    fun heroFor(entry: TripEntry): String? {
        val rows = _media.value.filter { it.entryId == entry.id }
        if (rows.isEmpty()) return null
        val cover = entry.coverMediaId?.let { id -> rows.firstOrNull { it.id == id } }
        val chosen = cover ?: rows.first()
        return _mediaUrls.value[chosen.id]
    }

    /** The trip's cover for the hero header: image_url → first trip media. */
    fun tripCoverFor(trip: Trip): String? =
        trip.imageUrl ?: _media.value.firstOrNull()?.let { _mediaUrls.value[it.id] }

    val isDemoMode: Boolean = demoManager.isDemoMode

    init {
        load()
    }

    private fun load() {
        if (demoManager.isDemoMode) {
            val trip = DemoData.trips.firstOrNull { it.id == tripId }
            if (trip == null) {
                _state.value = TripDetailUiState.Error("Trip not found")
                return
            }
            _state.value = TripDetailUiState.Success(TripDetailData(trip))
            _entries.value = DemoData.entries[tripId].orEmpty()
            _track.value = DemoData.tripTracks[tripId].orEmpty()
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            _state.value = TripDetailUiState.Loading
            val tripResult = tripRepo.getTrip(tripId)
            val entriesResult = tripRepo.listEntries(tripId)
            tripResult
                .onSuccess { trip ->
                    _state.value = TripDetailUiState.Success(TripDetailData(trip))
                    _entries.value = entriesResult.getOrDefault(emptyList())
                    loadTrack(trip)
                    loadMedia()
                }
                .onFailure {
                    _state.value = TripDetailUiState.Error(it.message ?: "Failed to load trip")
                }
        }
    }

    /** Fetch the trip's media rows and sign their display URLs. */
    private suspend fun loadMedia() {
        val rows = tripRepo.listMedia(tripId).getOrDefault(emptyList())
        _media.value = rows
        val urls = mutableMapOf<String, String>()
        for (m in rows) {
            mediaUploader.getSignedUrl(path = m.storagePath).getOrNull()?.let { urls[m.id] = it }
        }
        _mediaUrls.value = urls
    }

    /** Fetch tracker points for the trip's date range and build the polyline. */
    private suspend fun loadTrack(trip: Trip) {
        val userId = client.auth.currentSession?.user?.id ?: return
        val end = trip.endDate ?: java.time.LocalDate.now().toString()
        val points = statsRepo.fetchPoints(userId, trip.startDate, end).getOrDefault(emptyList())
        _track.value = StatsAggregator.track(points)
    }

    // ---- Editor integration ----

    private val _drafts = MutableStateFlow<List<io.github.nimbleflux.wayli.repo.EntryDraft>>(emptyList())
    val drafts: StateFlow<List<io.github.nimbleflux.wayli.repo.EntryDraft>> = _drafts.asStateFlow()

    init {
        refreshDrafts()
    }

    /** Reload the trip's local drafts (cards with title + edit button). */
    fun refreshDrafts() {
        viewModelScope.launch(Dispatchers.IO) {
            _drafts.value = draftRepo.listForTrip(tripId)
        }
    }

    /**
     * Called when returning from the editor. In real mode (or when no
     * in-memory entry was handed back) the entries reload; demo entries are
     * upserted into the in-memory list.
     */
    fun applyEditorResult(entry: TripEntry?) {
        if (entry != null && (demoManager.isDemoMode || entry.id.startsWith("local-"))) {
            _entries.value = listOf(entry) + _entries.value.filter { it.id != entry.id }
        } else if (!demoManager.isDemoMode) {
            viewModelScope.launch(Dispatchers.IO) {
                tripRepo.listEntries(tripId)
                    .onSuccess { _entries.value = it }
            }
        }
        refreshDrafts()
    }
}
