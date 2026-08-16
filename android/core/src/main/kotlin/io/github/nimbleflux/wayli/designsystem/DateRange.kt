package io.github.nimbleflux.wayli.designsystem

import java.time.LocalDate

/**
 * A stats period. Either one of the presets (last N days) or a custom
 * inclusive date range picked from the calendar.
 */
sealed interface DateRange {
    data class LastDays(val days: Int, val label: String) : DateRange
    data class Custom(val start: LocalDate, val endInclusive: LocalDate) : DateRange
}

val DateRange.label: String
    get() = when (this) {
        is DateRange.LastDays -> label
        is DateRange.Custom -> "${start} → $endInclusive"
    }

/** Resolve to an inclusive (start, end) pair for querying. Pure — testable. */
fun DateRange.toDates(today: LocalDate = LocalDate.now()): Pair<LocalDate, LocalDate> = when (this) {
    is DateRange.LastDays -> today.minusDays((days - 1).toLong()) to today
    is DateRange.Custom -> start to endInclusive
}

/** The presets shown as filter chips. */
val dateRangePresets = listOf(
    DateRange.LastDays(7, "7d"),
    DateRange.LastDays(30, "30d"),
    DateRange.LastDays(90, "3m"),
    DateRange.LastDays(365, "1y"),
)
