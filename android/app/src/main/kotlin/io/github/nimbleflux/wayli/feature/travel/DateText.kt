package io.github.nimbleflux.wayli.feature.travel

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import kotlin.math.roundToInt

/** Friendly date rendering for trips and entries (web parity: "Aug 12 – Aug 19, 2026"). */

internal fun formatDateRange(startIso: String, endIso: String?): String {
    val start = io.github.nimbleflux.wayli.util.parseIsoDate(startIso) ?: return startIso.take(10)
    val end = io.github.nimbleflux.wayli.util.parseIsoDate(endIso)
    return when {
        end == null -> "${format(start, "MMM d, yyyy")} · ongoing"
        start.year == end.year && start.month == end.month -> "${format(start, "MMM d")} – ${format(end, "d, yyyy")}"
        start.year == end.year -> "${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}"
        else -> "${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}"
    }
}


/** Compact range for home trip cards: "Mar 1 – Apr 2, 2025" / "Mar 1, 2025 · ongoing". */
internal fun shortTripRange(startIso: String, endIso: String?): String {
    val start = io.github.nimbleflux.wayli.util.parseIsoDate(startIso) ?: return startIso.take(10)
    val end = io.github.nimbleflux.wayli.util.parseIsoDate(endIso) ?: return "${format(start, "MMM d, yyyy")} · ongoing"
    return when {
        start.year == end.year && start.month == end.month -> "${format(start, "MMM d")} – ${format(end, "d, yyyy")}"
        start.year == end.year -> "${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}"
        else -> "${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}"
    }
}

/** Inclusive day count of a trip (open trips count up to today). */
internal fun tripDays(startIso: String, endIso: String?): Long {
    val start = io.github.nimbleflux.wayli.util.parseIsoDate(startIso) ?: return 0
    val end = io.github.nimbleflux.wayli.util.parseIsoDate(endIso) ?: LocalDate.now()
    if (end.isBefore(start)) return 1
    return ChronoUnit.DAYS.between(start, end) + 1
}

private fun format(date: LocalDate, pattern: String): String =
    DateTimeFormatter.ofPattern(pattern).format(date)

/** Meters → "830 m" / "42 km" (web's trip-card formatting). */
internal fun formatDistance(meters: Double): String =
    if (meters < 1000) "${meters.roundToInt()} m" else "${(meters / 1000.0).roundToInt()} km"
