package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.wayli.models.TrackerPoint
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Client-side aggregation over tracker data for the stats screens.
 * Pure functions — unit-testable without Android.
 *
 * Units (schema-verified): `tracker_daily_activity.distance` is meters,
 * `time_spent` is seconds, `tracker_data.distance` is meters — converted
 * here to the km/hours the UI labels.
 */
object StatsAggregator {

    data class Totals(
        val totalDistanceKm: Double,
        val timeMovingHours: Double,
        val points: Int,
    )

    /** Totals from the `tracker_daily_activity` cache table (meters/seconds → km/hours). */
    fun totalsFromDailyActivity(rows: List<DailyActivity>): Totals = Totals(
        totalDistanceKm = rows.sumOf { it.distance ?: 0.0 } / 1000.0,
        timeMovingHours = rows.sumOf { it.timeSpent ?: 0.0 } / 3600.0,
        points = rows.sumOf { it.points ?: 0 },
    )

    /**
     * Totals computed directly from `tracker_data` points — the fallback when
     * the `tracker_daily_activity` job-populated cache is empty (fresh
     * instances). Distance sums the per-point segment meters; time sums the
     * per-point `time_spent` seconds where present.
     */
    fun totalsFromPoints(points: List<TrackerPoint>): Totals = Totals(
        totalDistanceKm = points.sumOf { it.distance ?: 0.0 } / 1000.0,
        timeMovingHours = points.sumOf { it.timeSpent ?: 0.0 } / 3600.0,
        points = points.size,
    )

    /** day → km for the activity heatmap. */
    fun dailyDistance(rows: List<DailyActivity>): Map<String, Double> =
        rows.associate { it.day to (it.distance ?: 0.0) / 1000.0 }

    /**
     * day → km computed straight from raw points — the heatmap fallback when
     * the `tracker_daily_activity` cache is empty. Day = local calendar day
     * of `recorded_at` (web parity — UTC buckets put late-evening moves on
     * the wrong day for most longitudes).
     */
    fun dailyDistanceFromPoints(
        points: List<TrackerPoint>,
        zone: java.time.ZoneId = java.time.ZoneId.systemDefault(),
    ): Map<String, Double> =
        points
            .groupBy { point ->
                runCatching {
                    java.time.Instant.parse(point.recordedAt).atZone(zone).toLocalDate().toString()
                }.getOrElse { point.recordedAt.take(10) }
            }
            .mapValues { (_, dayPoints) -> dayPoints.sumOf { it.distance ?: 0.0 } / 1000.0 }
            .filterValues { it > 0.0 }

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

    /**
     * Distance-weighted transport-mode shares (0..1), web parity: stationary
     * points aren't movement and are excluded (unknown is kept), and each
     * mode's share is its share of the moving distance, not of point counts.
     * Empty when there is no moving distance.
     */
    fun transportModeShares(points: List<TrackerPoint>): Map<String, Double> {
        val totals = points
            .groupBy { it.transportMode?.lowercase() ?: "unknown" }
            .mapValues { (_, modePoints) -> modePoints.sumOf { it.distance ?: 0.0 } }
            .filterKeys { it != "stationary" }
        val movingDistance = totals.values.sum()
        if (movingDistance <= 0.0) return emptyMap()
        return totals.mapValues { (_, meters) -> meters / movingDistance }
    }

    /**
     * Whole-number percentages that sum to exactly 100 (largest-remainder
     * rounding), from fractions in 0..1.
     */
    fun percentagesSummingTo100(fractions: Map<String, Double>): Map<String, Int> {
        if (fractions.isEmpty()) return emptyMap()
        val floored = LinkedHashMap<String, Int>()
        fractions.forEach { (key, f) -> floored[key] = (f * 100).toInt() }
        var remainder = 100 - floored.values.sum()
        // Hand the lost percentage points to the largest fractional parts.
        if (remainder > 0) {
            fractions.entries
                .sortedByDescending { (_, f) -> f * 100 - (f * 100).toInt() }
                .forEach { (key, _) ->
                    if (remainder > 0) {
                        floored[key] = floored.getValue(key) + 1
                        remainder--
                    }
                }
        }
        return floored
    }

    /** Ordered (lat, lon) track from points; invalid locations skipped. */
    fun track(points: List<TrackerPoint>): List<Pair<Double, Double>> =
        downsample(points.mapNotNull { parseLocation(it.location) }, maxPoints = 800)

    /** A renderable polyline segment, colored by transport mode on the map. */
    data class TrackSegment(
        val mode: String?,
        val points: List<Pair<Double, Double>>,
    )

    /**
     * Split a point stream into map segments by transport mode AND movement
     * gaps (web parity: segmentByGaps with SEGMENT_GAP_MS = 5 min). Each
     * segment becomes its own colored polyline.
     *
     * Fragmentation control: detection flaps between modes for a point or two
     * and leaves long runs unlabeled — both would shred the track into
     * confetti. Short mode runs (< [MIN_MODE_RUN] points) are absorbed into
     * the surrounding segment, and null/unknown labels never start a new
     * segment (they inherit the current one).
     */
    fun segmentsByMode(points: List<TrackerPoint>, @Suppress("UNUSED_PARAMETER") gapMs: Long = 5 * 60 * 1000): List<TrackSegment> {
        val segments = mutableListOf<TrackSegment>()
        var currentMode: String? = null
        var current = mutableListOf<Pair<Double, Double>>()

        fun flush() {
            if (current.size >= 2) {
                segments += TrackSegment(currentMode, downsample(current, maxPoints = 400))
            }
            current = mutableListOf()
        }

        points.forEachIndexed { index, point ->
            val coords = parseLocation(point.location) ?: return@forEachIndexed

            val mode = point.transportMode?.takeIf { it.isNotBlank() && it != "unknown" }
            // A new mode only starts a segment if it STAYS for MIN_MODE_RUN
            // points; otherwise it's detection noise and gets absorbed.
            val modeBreak = mode != null && mode != currentMode && current.isNotEmpty() && run {
                val lookahead = points.subList(index, minOf(index + MIN_MODE_RUN, points.size))
                lookahead.count { it.transportMode == mode } >= MIN_MODE_RUN
            }
            // Time gaps do NOT split the polyline — the line bridges the gap
            // (straight connector in the previous mode's color), keeping the
            // journey one continuous thread instead of confetti fragments.
            if (modeBreak) flush()
            if (current.isEmpty()) currentMode = mode ?: currentMode
            current += coords
        }
        flush()
        return segments
    }

    private const val MIN_MODE_RUN = 3

    /**
     * Stride-downsample a polyline for rendering (the web caps map points the
     * same way). Full-resolution tracks made mini-map composition take
     * multi-second main-thread frames — 800 vertices is visually identical at
     * card sizes and keeps the GeoJSON build trivial.
     */
    fun downsample(track: List<Pair<Double, Double>>, maxPoints: Int): List<Pair<Double, Double>> {
        if (track.size <= maxPoints) return track
        val stride = Math.ceil(track.size.toDouble() / maxPoints).toInt()
        return track.filterIndexed { index, _ -> index % stride == 0 } + track.last()
    }

    /**
     * Parse a point location into (lat, lon). The tables API returns a
     * GeoJSON Point **object** `{"type":"Point","coordinates":[lon,lat]}`
     * (the web types it the same); WKT strings ("POINT(lon lat)" with
     * optional SRID prefix) and GeoJSON strings are handled as fallbacks.
     */
    fun parseLocation(value: JsonElement?): Pair<Double, Double>? {
        if (value == null) return null
        when (value) {
            is JsonObject -> {
                val coords = value["coordinates"] as? JsonArray ?: return null
                if (coords.size < 2) return null
                val lon = (coords[0] as? JsonPrimitive)?.doubleOrNull ?: return null
                val lat = (coords[1] as? JsonPrimitive)?.doubleOrNull ?: return null
                return lat to lon
            }
            is JsonPrimitive -> return parsePostgisPoint(value.jsonPrimitive.content)
            else -> return null
        }
    }

    /**
     * Parse a PostGIS POINT string ("POINT(lon lat)" with optional
     * SRID prefix) or a GeoJSON Point string to (lat, lon).
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
