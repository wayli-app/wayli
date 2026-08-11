package io.github.nimbleflux.wayli.feature.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.demo.DemoData
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.designsystem.map.MapPoint
import io.github.nimbleflux.wayli.designsystem.map.MapTrack
import io.github.nimbleflux.wayli.repo.StatsRepository
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.maplibre.android.geometry.LatLng

data class HistoryMapData(
    val points: List<MapPoint>,
    val tracks: List<MapTrack>,
)

sealed interface HistoryUiState {
    data object Loading : HistoryUiState
    data class Error(val message: String) : HistoryUiState
    data class Success(val data: HistoryMapData) : HistoryUiState
}

/**
 * Loads GPS track data for a selected date range. Demo mode shows the seeded
 * track regardless of range; real mode fetches `tracker_data` points between
 * the selected dates via [StatsRepository.fetchPoints] and builds a track.
 */
@HiltViewModel
class HistoryViewModel @Inject constructor(
    private val demoManager: DemoManager,
    private val fluxbaseClient: FluxbaseClient,
    private val statsRepo: StatsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<HistoryUiState>(HistoryUiState.Loading)
    val state: StateFlow<HistoryUiState> = _state.asStateFlow()

    private val _rangeStart = MutableStateFlow(LocalDate.now().minusMonths(1))
    private val _rangeEnd = MutableStateFlow(LocalDate.now())
    val rangeStart: StateFlow<LocalDate> = _rangeStart.asStateFlow()
    val rangeEnd: StateFlow<LocalDate> = _rangeEnd.asStateFlow()

    val isDemoMode: Boolean = demoManager.isDemoMode

    init {
        load()
    }

    fun setRange(start: LocalDate, end: LocalDate) {
        _rangeStart.value = start
        _rangeEnd.value = end
        load()
    }

    private fun load() {
        if (demoManager.isDemoMode) {
            // Synthetic data — not filtered by range, but the range text reflects the selection.
            _state.value = HistoryUiState.Success(
                HistoryMapData(
                    points = DemoData.homePoints,
                    tracks = listOf(
                        MapTrack(
                            points = DemoData.homeTrack.map { LatLng(it.first, it.second) },
                            color = "#3b82f6",
                            width = 5f,
                        ),
                    ),
                ),
            )
            return
        }
        val userId = fluxbaseClient.auth?.currentSession?.user?.id ?: run {
            _state.value = HistoryUiState.Error("Not authenticated")
            return
        }
        viewModelScope.launch {
            _state.value = HistoryUiState.Loading
            statsRepo.fetchPoints(
                userId,
                _rangeStart.value.toString(),
                _rangeEnd.value.plusDays(1).toString(),
            )
                .onSuccess { pts ->
                    val ll = pts.mapNotNull { parsePoint(it.location) }
                    val tracks = if (ll.size >= 2) listOf(MapTrack(ll, "#3b82f6", 4f)) else emptyList()
                    val points = ll.map { MapPoint(lat = it.latitude, lng = it.longitude, color = "#3b82f6") }
                    _state.value = HistoryUiState.Success(HistoryMapData(points, tracks))
                }
                .onFailure { _state.value = HistoryUiState.Error(it.message ?: "Failed to load") }
        }
    }

    private fun parsePoint(loc: String): LatLng? {
        val m = Regex("""POINT\((-?[\d.]+)\s+(-?[\d.]+)\)""").find(loc) ?: return null
        val lng = m.groupValues[1].toDoubleOrNull() ?: return null
        val lat = m.groupValues[2].toDoubleOrNull() ?: return null
        return LatLng(lat, lng)
    }
}
