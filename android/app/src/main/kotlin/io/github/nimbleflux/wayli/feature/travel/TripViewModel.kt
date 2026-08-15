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

@HiltViewModel
class TripViewModel @Inject constructor(
    private val tripRepo: TripRepository,
    private val fluxbaseClient: FluxbaseClient,
    private val demoManager: io.github.nimbleflux.wayli.demo.DemoManager,
    private val adminRepo: AdminRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<TripUiState>(TripUiState.Loading)
    val uiState: StateFlow<TripUiState> = _uiState.asStateFlow()

    private val _selectedTrip = MutableStateFlow<Trip?>(null)
    val selectedTrip: StateFlow<Trip?> = _selectedTrip.asStateFlow()

    fun loadTrips() {
        if (demoManager.isDemoMode) {
            _uiState.value = TripUiState.Success(
                io.github.nimbleflux.wayli.demo.DemoData.trips.sortedByDescending { it.startDate },
            )
            return
        }
        val userId = fluxbaseClient.auth?.currentSession?.user?.id ?: run {
            _uiState.value = TripUiState.Error("Not authenticated")
            return
        }
        viewModelScope.launch {
            _uiState.value = TripUiState.Loading
            tripRepo.listTrips(userId)
                .onSuccess { _uiState.value = TripUiState.Success(it) }
                .onFailure { _uiState.value = TripUiState.Error(it.message ?: "Failed to load trips") }
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
