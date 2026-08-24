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
import kotlinx.coroutines.async
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
    /** Full per-day rows keyed by ISO date — feeds the heatmap and the day sheet. */
    val dailyRows: Map<String, io.github.nimbleflux.wayli.repo.DailyActivity>,
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

/** Results of [StatsViewModel]'s parallel fetches. */
private data class StatsFetches(
    val calendar: Result<List<io.github.nimbleflux.wayli.repo.DailyActivity>>,
    val daily: Result<List<io.github.nimbleflux.wayli.repo.DailyActivity>>,
    val points: Result<List<io.github.nimbleflux.wayli.models.TrackerPoint>>,
    val countries: Result<List<String>>,
)

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

    /**
     * True while re-fetching with data already on screen (range switch,
     * refresh): the previous numbers stay visible under a subtle indicator
     * instead of the whole screen flashing to a spinner.
     */
    private val _reloading = MutableStateFlow(false)
    val reloading: StateFlow<Boolean> = _reloading.asStateFlow()

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
                    // Demo map is km/day; DailyActivity carries meters.
                    dailyRows = DemoData.dailyActivity.mapValues { (day, km) ->
                        io.github.nimbleflux.wayli.repo.DailyActivity(day = day, distance = km * 1000.0)
                    },
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
            // Keep the current data on screen while re-fetching (range
            // switch / refresh); only a first-ever load shows the spinner.
            val previous = _state.value as? StatsUiState.Success
            _reloading.value = previous != null
            if (previous == null) _state.value = StatsUiState.Loading
            val (start, end) = _selectedRange.value.toDates()

            // Heatmap always uses the server-side activity calendar (trailing
            // 371 days, like the web) — independent of the selected range so
            // the grid covers the full year even when a shorter range is picked.
            val results = kotlinx.coroutines.coroutineScope {
                val calendar = async { statsRepo.getActivityCalendar(userId) }
                val daily = async {
                    statsRepo.fetchDailyActivity(userId, start.toString(), end.toString())
                }
                val points = async {
                    statsRepo.fetchPoints(userId, start.toString(), end.toString())
                }
                val countries = async {
                    statsRepo.fetchCountryCodes(userId, start.toString(), end.toString())
                }
                StatsFetches(calendar.await(), daily.await(), points.await(), countries.await())
            }
            val calendarResult = results.calendar
            val dailyResult = results.daily
            val pointsResult = results.points
            val countriesResult = results.countries
            val calendar = calendarResult.getOrDefault(emptyList())
            val daily = dailyResult.getOrDefault(emptyList())
            val points = pointsResult.getOrDefault(emptyList())
            val countryCodes = countriesResult.getOrDefault(emptyList())

            // Distinguish "no data" from "queries failing": if every source
            // errored (network/permissions), say so instead of showing zeros.
            if (calendarResult.isFailure && dailyResult.isFailure &&
                pointsResult.isFailure && countriesResult.isFailure
            ) {
                _reloading.value = false
                _state.value = StatsUiState.Error(
                    calendarResult.exceptionOrNull()?.message
                        ?: dailyResult.exceptionOrNull()?.message
                        ?: pointsResult.exceptionOrNull()?.message
                        ?: countriesResult.exceptionOrNull()?.message
                        ?: "Failed to load statistics",
                )
                return@launch
            }

            // Partial failures keep the previous values for the affected
            // fields instead of silently zeroing them — a failed points fetch
            // must not wipe the countries count or the world map.
            val prevData = previous?.data
            val countriesValue = when {
                countriesResult.isSuccess -> countryCodes.size.toString()
                prevData != null -> prevData.countries
                else -> "0"
            }
            val visitedValue = when {
                countriesResult.isSuccess -> countryCodes.toSet()
                prevData != null -> prevData.visited
                else -> emptySet()
            }
            val modesValue = when {
                pointsResult.isSuccess -> StatsAggregator.transportModeShares(points)
                prevData != null -> prevData.modes
                else -> emptyMap()
            }
            val trackValue = when {
                pointsResult.isSuccess -> StatsAggregator.track(points).takeIf { it.size >= 2 }
                prevData != null -> prevData.track
                else -> null
            }

            if (daily.isEmpty() && points.isEmpty() && calendar.isEmpty()) {
                _reloading.value = false
                _state.value = StatsUiState.Success(
                    StatsData("0", countriesValue, "0", "0", emptyMap(), emptyMap(), null, visited = visitedValue),
                )
                return@launch
            }

            // Prefer the daily-activity cache; fall back to client-side
            // aggregation from raw points when the cache hasn't been built
            // yet (fresh instances) — for totals. The heatmap uses the
            // calendar rows with the range-scoped daily rows as fallback.
            val totals = if (daily.isNotEmpty()) {
                StatsAggregator.totalsFromDailyActivity(daily)
            } else {
                StatsAggregator.totalsFromPoints(points)
            }
            val heatRows = when {
                calendar.isNotEmpty() -> calendar
                daily.isNotEmpty() -> daily
                else -> emptyList()
            }
            val dailyRows = heatRows.associateBy { it.day }.let { byDay ->
                if (heatRows.isEmpty()) {
                    // Last resort: bucket raw points into local-day rows.
                    StatsAggregator.dailyDistanceFromPoints(points).entries.associate { (day, km) ->
                        day to io.github.nimbleflux.wayli.repo.DailyActivity(day = day, distance = km * 1000.0)
                    }
                } else {
                    byDay
                }
            }
            _reloading.value = false
            _state.value = StatsUiState.Success(
                StatsData(
                    distanceKm = "%.0f".format(totals.totalDistanceKm),
                    countries = countriesValue,
                    timeMovingHours = "%.0f".format(totals.timeMovingHours),
                    dataPoints = if (pointsResult.isSuccess) {
                        formatNumber(points.size.coerceAtLeast(totals.points))
                    } else {
                        prevData?.dataPoints ?: "0"
                    },
                    modes = modesValue,
                    dailyRows = dailyRows,
                    track = trackValue,
                    dailyCacheEmpty = daily.isEmpty() && calendar.isEmpty(),
                    visited = visitedValue,
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
