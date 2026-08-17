package io.github.nimbleflux.wayli.feature.travel

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import kotlin.math.roundToInt

/** Friendly date rendering for trips and entries (web parity: "Aug 12 – Aug 19, 2026"). */

internal fun formatDateRange(startIso: String, endIso: String?): String {
    val start = runCatching { LocalDate.parse(startIso) }.getOrNull() ?: return startIso
    val end = endIso?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    return when {
        end == null -> "${format(start, "MMM d, yyyy")} · ongoing"
        start.year == end.year -> "${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}"
        else -> "${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}"
    }
}

/** Inclusive day count of a trip (open trips count up to today). */
internal fun tripDays(startIso: String, endIso: String?): Long {
    val start = runCatching { LocalDate.parse(startIso) }.getOrNull() ?: return 0
    val end = endIso?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: LocalDate.now()
    if (end.isBefore(start)) return 1
    return ChronoUnit.DAYS.between(start, end) + 1
}

private fun format(date: LocalDate, pattern: String): String =
    DateTimeFormatter.ofPattern(pattern).format(date)

/** Meters → "830 m" / "42 km" (web's trip-card formatting). */
internal fun formatDistance(meters: Double): String =
    if (meters < 1000) "${meters.roundToInt()} m" else "${(meters / 1000.0).roundToInt()} km"
