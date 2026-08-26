package io.github.nimbleflux.wayli.designsystem

import java.time.LocalDate
import java.time.format.DateTimeFormatter

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

/** Human label for the active stats period, e.g. "Last 30 days" / "Aug 1 – Aug 17, 2026". */
fun DateRange.displayLabel(): String = when (this) {
    is DateRange.LastDays -> when (days) {
        7 -> "Last 7 days"
        30 -> "Last 30 days"
        90 -> "Last 3 months"
        365 -> "Last year"
        else -> "Last $days days"
    }
    is DateRange.Custom -> {
        val sameYear = start.year == endInclusive.year
        val startPattern = if (sameYear) "MMM d" else "MMM d, yyyy"
        "${DateTimeFormatter.ofPattern(startPattern).format(start)} – " +
            DateTimeFormatter.ofPattern("MMM d, yyyy").format(endInclusive)
    }
}

/** The presets shown as filter chips. */
val dateRangePresets = listOf(
    DateRange.LastDays(7, "7d"),
    DateRange.LastDays(30, "30d"),
    DateRange.LastDays(90, "3m"),
    DateRange.LastDays(365, "1y"),
)
