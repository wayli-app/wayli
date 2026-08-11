package io.github.nimbleflux.wayli.feature.travel

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.wayli.demo.DemoData
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.models.Trip
import io.github.nimbleflux.wayli.models.TripEntry
import io.github.nimbleflux.wayli.repo.TripRepository
import javax.inject.Inject
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
 */
@HiltViewModel
class TripDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val demoManager: DemoManager,
    private val tripRepo: TripRepository,
) : ViewModel() {

    val tripId: String = savedStateHandle.get<String>("tripId") ?: ""

    private val _state = MutableStateFlow<TripDetailUiState>(TripDetailUiState.Loading)
    val state: StateFlow<TripDetailUiState> = _state.asStateFlow()

    private val _entries = MutableStateFlow<List<TripEntry>>(emptyList())
    val entries: StateFlow<List<TripEntry>> = _entries.asStateFlow()

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
            return
        }
        viewModelScope.launch {
            _state.value = TripDetailUiState.Loading
            val tripResult = tripRepo.getTrip(tripId)
            val entriesResult = tripRepo.listEntries(tripId)
            tripResult
                .onSuccess { trip ->
                    _state.value = TripDetailUiState.Success(TripDetailData(trip))
                    _entries.value = entriesResult.getOrDefault(emptyList())
                }
                .onFailure {
                    _state.value = TripDetailUiState.Error(it.message ?: "Failed to load trip")
                }
        }
    }

    /** Add a journal entry. Demo keeps it in-memory; real mode inserts via the repo. */
    fun addEntry(title: String, entryDate: String, body: String?) {
        if (demoManager.isDemoMode) {
            _entries.value = listOf(localEntry(title, entryDate, body)) + _entries.value
            return
        }
        viewModelScope.launch {
            tripRepo.createEntry(tripId, title, entryDate, body)
                .onSuccess { created -> _entries.value = listOf(created) + _entries.value }
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
