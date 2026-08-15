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
) : ViewModel() {

    val tripId: String = savedStateHandle.get<String>("tripId") ?: ""

    private val _state = MutableStateFlow<TripDetailUiState>(TripDetailUiState.Loading)
    val state: StateFlow<TripDetailUiState> = _state.asStateFlow()

    private val _entries = MutableStateFlow<List<TripEntry>>(emptyList())
    val entries: StateFlow<List<TripEntry>> = _entries.asStateFlow()

    /** Ordered (lat, lon) coordinates for the trip map; empty = no track. */
    private val _track = MutableStateFlow<List<Pair<Double, Double>>>(emptyList())
    val track: StateFlow<List<Pair<Double, Double>>> = _track.asStateFlow()

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
                }
                .onFailure {
                    _state.value = TripDetailUiState.Error(it.message ?: "Failed to load trip")
                }
        }
    }

    /** Fetch tracker points for the trip's date range and build the polyline. */
    private suspend fun loadTrack(trip: Trip) {
        val userId = client.auth.currentSession?.user?.id ?: return
        val end = trip.endDate ?: java.time.LocalDate.now().toString()
        val points = statsRepo.fetchPoints(userId, trip.startDate, end).getOrDefault(emptyList())
        _track.value = StatsAggregator.track(points)
    }

    /** Add a journal entry. Demo keeps it in-memory; real mode inserts via the repo. */
    private val _entryError = MutableStateFlow<String?>(null)
    val entryError: StateFlow<String?> = _entryError.asStateFlow()

    fun clearEntryError() { _entryError.value = null }

    fun addEntry(title: String, entryDate: String, body: String?) {
        if (demoManager.isDemoMode) {
            _entries.value = listOf(localEntry(title, entryDate, body)) + _entries.value
            return
        }
        viewModelScope.launch {
            tripRepo.createEntry(tripId, title, entryDate, body)
                .onSuccess { created -> _entries.value = listOf(created) + _entries.value }
                .onFailure { _entryError.value = it.message ?: "Failed to add entry" }
        }
    }

    private fun localEntry(title: String, entryDate: String, body: String?): TripEntry {
        val now = java.time.Instant.now().toString()
        return TripEntry(
            id = "local-${System.currentTimeMillis()}",
            tripId = tripId,
            entryDate = entryDate,
            body = body?.takeIf { it.isNotBlank() },
            title = title,
            status = "published",
            createdAt = now,
            updatedAt = now,
        )
    }
}
