package io.github.nimbleflux.wayli.feature.travel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.models.Trip
import io.github.nimbleflux.wayli.repo.AdminRepository
import io.github.nimbleflux.wayli.repo.TripRepository
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
                }
                .onFailure { _uiState.value = TripUiState.Error(it.message ?: "Failed to load trips") }
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
}
