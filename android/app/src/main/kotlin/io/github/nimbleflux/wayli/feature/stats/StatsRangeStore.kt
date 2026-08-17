package io.github.nimbleflux.wayli.feature.stats

import io.github.nimbleflux.wayli.designsystem.DateRange
import io.github.nimbleflux.wayli.designsystem.dateRangePresets
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The app-wide stats period, shared by Home and Statistics so navigating
 * between them keeps the selected date range. Session-scoped (not persisted),
 * matching the previous per-screen 30-day default.
 */
@Singleton
class StatsRangeStore @Inject constructor() {

    private val _range = MutableStateFlow<DateRange>(dateRangePresets[1]) // 30d
    val range: StateFlow<DateRange> = _range.asStateFlow()

    fun set(range: DateRange) {
        _range.value = range
    }
}
