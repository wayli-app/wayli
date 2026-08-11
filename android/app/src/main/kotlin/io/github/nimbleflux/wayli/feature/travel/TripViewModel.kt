package io.github.nimbleflux.wayli.feature.travel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.models.Trip
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
    private val fluxbaseClient: dagger.Lazy<FluxbaseClient?>,
    private val demoManager: io.github.nimbleflux.wayli.demo.DemoManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow<TripUiState>(TripUiState.Loading)
    val uiState: StateFlow<TripUiState> = _uiState.asStateFlow()

    private val _selectedTrip = MutableStateFlow<Trip?>(null)
    val selectedTrip: StateFlow<Trip?> = _selectedTrip.asStateFlow()

    fun loadTrips() {
        if (demoManager.isDemoMode) {
            _uiState.value = TripUiState.Success(io.github.nimbleflux.wayli.demo.DemoData.trips)
            return
        }
        val userId = fluxbaseClient.get()?.auth?.currentSession?.user?.id ?: run {
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
        val userId = fluxbaseClient.get()?.auth?.currentSession?.user?.id ?: return
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
}
