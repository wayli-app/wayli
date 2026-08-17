package io.github.nimbleflux.wayli.feature.stats

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.demo.DemoData
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.designsystem.DateRange
import io.github.nimbleflux.wayli.designsystem.dateRangePresets
import io.github.nimbleflux.wayli.designsystem.toDates
import io.github.nimbleflux.wayli.repo.StatsAggregator
import io.github.nimbleflux.wayli.repo.StatsRepository
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Everything the Stats screen renders. */
data class StatsData(
    val distanceKm: String,
    val countries: String,
    val timeMovingHours: String,
    val dataPoints: String,
    val modes: Map<String, Double>,
    val dailyActivity: Map<String, Double>,
    /** Ordered (lat, lon) track for the activity map; null → hide the map card. */
    val track: List<Pair<Double, Double>>?,
)

sealed interface StatsUiState {
    data object Loading : StatsUiState
    data class Error(val message: String) : StatsUiState
    data class Success(val data: StatsData) : StatsUiState
}

/**
 * Feeds the Stats screen. Demo mode serves [DemoData]; real mode aggregates
 * `tracker_daily_activity` (totals + heatmap) and `tracker_data` (countries,
 * transport modes, map track) over the selected [DateRange].
 */
@HiltViewModel
class StatsViewModel @Inject constructor(
    private val demoManager: DemoManager,
    private val client: FluxbaseClient,
    private val statsRepo: StatsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<StatsUiState>(StatsUiState.Loading)
    val state: StateFlow<StatsUiState> = _state.asStateFlow()

    val isDemoMode: Boolean = demoManager.isDemoMode

    /** Selected stats period — everything on the screen reacts to it. */
    private val _selectedRange = MutableStateFlow<DateRange>(dateRangePresets[1]) // 30d
    val selectedRange: StateFlow<DateRange> = _selectedRange.asStateFlow()

    init { load() }

    fun setRange(range: DateRange) {
        if (_selectedRange.value == range) return
        _selectedRange.value = range
        load()
    }

    fun load() {
        if (demoManager.isDemoMode) {
            _state.value = StatsUiState.Success(
                StatsData(
                    distanceKm = formatNumber(DemoData.totalDistanceKm),
                    countries = DemoData.countriesVisited.toString(),
                    timeMovingHours = DemoData.timeMovingHours.toString(),
                    dataPoints = formatNumber(DemoData.dataPoints),
                    modes = DemoData.transportModeBreakdown,
                    dailyActivity = DemoData.dailyActivity,
                    track = DemoData.homeTrack,
                ),
            )
            return
        }
        val userId = client.auth.currentSession?.user?.id ?: run {
            _state.value = StatsUiState.Error("Not authenticated")
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            _state.value = StatsUiState.Loading
            val (start, end) = _selectedRange.value.toDates()

            val daily = statsRepo.fetchDailyActivity(userId, start.toString(), end.toString())
                .getOrDefault(emptyList())
            val points = statsRepo.fetchPoints(userId, start.toString(), end.toString())
                .getOrDefault(emptyList())

            if (daily.isEmpty() && points.isEmpty()) {
                _state.value = StatsUiState.Success(
                    StatsData("0", "0", "0", "0", emptyMap(), emptyMap(), emptyList()),
                )
                return@launch
            }

            // Prefer the daily-activity cache; fall back to client-side totals
            // from raw points when the cache hasn't been built yet (fresh
            // instances — the web offers a "Build activity data" button there).
            val totals = if (daily.isNotEmpty()) {
                StatsAggregator.totalsFromDailyActivity(daily)
            } else {
                StatsAggregator.totalsFromPoints(points)
            }
            _state.value = StatsUiState.Success(
                StatsData(
                    distanceKm = "%.0f".format(totals.totalDistanceKm),
                    countries = StatsAggregator.countries(points).toString(),
                    timeMovingHours = "%.0f".format(totals.timeMovingHours),
                    dataPoints = formatNumber(points.size.coerceAtLeast(totals.points)),
                    modes = StatsAggregator.transportModeFractions(points),
                    dailyActivity = StatsAggregator.dailyDistance(daily),
                    track = StatsAggregator.track(points).takeIf { it.size >= 2 },
                ),
            )
        }
    }

    private fun formatNumber(n: Int): String = "%,d".format(n)
}
