package io.github.nimbleflux.wayli.feature.stats

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.demo.DemoData
import io.github.nimbleflux.wayli.demo.DemoManager
import io.github.nimbleflux.wayli.designsystem.DateRange
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
    /** True when the heatmap was derived from raw points, not the server cache. */
    val dailyCacheEmpty: Boolean = false,
    /** ISO alpha-2 country codes present in the range (world map). */
    val visited: Set<String> = emptySet(),
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
    private val rangeStore: StatsRangeStore,
) : ViewModel() {

    private val _state = MutableStateFlow<StatsUiState>(StatsUiState.Loading)
    val state: StateFlow<StatsUiState> = _state.asStateFlow()

    val isDemoMode: Boolean = demoManager.isDemoMode

    /** Selected stats period — shared with Home, everything on screen reacts to it. */
    private val _selectedRange = MutableStateFlow(rangeStore.range.value)
    val selectedRange: StateFlow<DateRange> = _selectedRange.asStateFlow()

    init { load() }

    fun setRange(range: DateRange) {
        if (_selectedRange.value == range) return
        _selectedRange.value = range
        rangeStore.set(range)
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
                    visited = DemoData.visitedCountries,
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

            // Prefer the daily-activity cache; fall back to client-side
            // aggregation from raw points when the cache hasn't been built
            // yet (fresh instances) — for both totals and the heatmap.
            val totals = if (daily.isNotEmpty()) {
                StatsAggregator.totalsFromDailyActivity(daily)
            } else {
                StatsAggregator.totalsFromPoints(points)
            }
            val heatmap = if (daily.isNotEmpty()) {
                StatsAggregator.dailyDistance(daily)
            } else {
                StatsAggregator.dailyDistanceFromPoints(points)
            }
            _state.value = StatsUiState.Success(
                StatsData(
                    distanceKm = "%.0f".format(totals.totalDistanceKm),
                    countries = StatsAggregator.countries(points).toString(),
                    timeMovingHours = "%.0f".format(totals.timeMovingHours),
                    dataPoints = formatNumber(points.size.coerceAtLeast(totals.points)),
                    modes = StatsAggregator.transportModeShares(points),
                    dailyActivity = heatmap,
                    track = StatsAggregator.track(points).takeIf { it.size >= 2 },
                    dailyCacheEmpty = daily.isEmpty(),
                    visited = points.mapNotNull { it.countryCode?.uppercase() }.toSet(),
                ),
            )
        }
    }

    /** One-shot messages surfaced by the screen as snackbars. */
    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    fun consumeMessage() {
        _message.value = null
    }

    /**
     * Queue the server-side daily-activity rebuild (web parity for its
     * "Build activity data" button) — the job upserts tracker_daily_activity
     * from tracker_data; refresh afterwards to see it.
     */
    fun buildActivityData() {
        if (demoManager.isDemoMode) {
            _message.value = "Demo data is already complete"
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            _message.value = "Building activity data — this can take a minute"
            val res = runCatching {
                client.jobs.submit(
                    "refresh-daily-activity",
                    emptyMap<String, Any>(),
                    io.github.nimbleflux.fluxbase.jobs.SubmitJobOptions(namespace = "wayli"),
                )
            }
            _message.value = when {
                res.isFailure -> "Couldn't queue the rebuild: ${res.exceptionOrNull()?.message ?: "network error"}"
                res.getOrNull()?.data != null -> "Activity rebuild queued — tap refresh in a minute"
                else -> "Couldn't queue the rebuild: ${res.getOrNull()?.error?.message ?: "unknown error"}"
            }
        }
    }

    private fun formatNumber(n: Int): String = "%,d".format(n)
}
