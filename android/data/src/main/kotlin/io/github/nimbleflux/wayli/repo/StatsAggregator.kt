package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.wayli.models.TrackerPoint

/**
 * Client-side aggregation over tracker data for the stats screens.
 * Pure functions — unit-testable without Android.
 */
object StatsAggregator {

    data class Totals(
        val totalDistanceKm: Double,
        val timeMovingHours: Double,
        val points: Int,
    )

    /** Totals from the `tracker_daily_activity` table. */
    fun totalsFromDailyActivity(rows: List<DailyActivity>): Totals = Totals(
        totalDistanceKm = rows.sumOf { it.distance ?: 0.0 },
        timeMovingHours = rows.sumOf { it.timeSpent ?: 0.0 },
        points = rows.sumOf { it.points ?: 0 },
    )

    /** day → km for the activity heatmap. */
    fun dailyDistance(rows: List<DailyActivity>): Map<String, Double> =
        rows.associate { it.day to (it.distance ?: 0.0) }

    /** Distinct non-null country codes across points. */
    fun countries(points: List<TrackerPoint>): Int =
        points.mapNotNull { it.countryCode?.uppercase() }.distinct().size

    /**
     * Transport-mode fractions (0..1) keyed by web mode names
     * (car/train/airplane/cycling/walking/stationary/unknown).
     */
    fun transportModeFractions(points: List<TrackerPoint>): Map<String, Double> {
        if (points.isEmpty()) return emptyMap()
        return points
            .groupingBy { it.transportMode?.lowercase() ?: "unknown" }
            .eachCount()
            .mapValues { (_, count) -> count.toDouble() / points.size }
    }

    /** Ordered (lat, lon) track from points; invalid locations skipped. */
    fun track(points: List<TrackerPoint>): List<Pair<Double, Double>> =
        points.mapNotNull { parsePostgisPoint(it.location) }

    /**
     * Parse a PostGIS POINT string ("POINT(lon lat)" with optional
     * SRID prefix) or GeoJSON Point ({"coordinates":[lon,lat]}) to (lat, lon).
     */
    fun parsePostgisPoint(value: String): Pair<Double, Double>? {
        Regex("""POINT\((-?[\d.]+)\s+(-?[\d.]+)\)""").find(value)?.let { m ->
            val lon = m.groupValues[1].toDoubleOrNull() ?: return@let null
            val lat = m.groupValues[2].toDoubleOrNull() ?: return@let null
            return lat to lon
        }
        Regex(""""coordinates"\s*:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]""").find(value)?.let { m ->
            val lon = m.groupValues[1].toDoubleOrNull() ?: return@let null
            val lat = m.groupValues[2].toDoubleOrNull() ?: return@let null
            return lat to lon
        }
        return null
    }
}
