package io.github.nimbleflux.wayli.repo

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Pure helpers for the fitness feature — a port of the web's
 * `utils/fitness.ts` (sport visuals, stat formatting, list grouping, and the
 * track post-processing used by the analyzer). No Android dependencies so the
 * logic stays unit-testable on the JVM.
 */

/** Accent color + display label per sport (web `sportTheme` parity). */
data class SportTheme(
    val label: String,
    /** Solid hex color for chart lines and map polylines. */
    val strokeHex: String,
)

private val DEFAULT_THEME = SportTheme("Workout", "#64748b")

private val SPORT_THEMES = mapOf(
    "cycling" to SportTheme("Cycling", "#10b981"),
    "e_biking" to SportTheme("E-biking", "#22d3ee"),
    "running" to SportTheme("Running", "#f97316"),
    "walking" to SportTheme("Walking", "#84cc16"),
    "hiking" to SportTheme("Hiking", "#f59e0b"),
    "swimming" to SportTheme("Swimming", "#0ea5e9"),
    "rowing" to SportTheme("Rowing", "#06b6d4"),
)

fun sportTheme(sport: String?): SportTheme =
    sport?.let { SPORT_THEMES[it] } ?: DEFAULT_THEME

/** Distance in meters → "12.34 km" / "840 m" (web formatDistance parity). */
fun formatDistance(meters: Double?): String {
    if (meters == null || meters.isNaN()) return "—"
    if (meters < 1000) return "${Math.round(meters)} m"
    val km = meters / 1000
    val decimals = if (meters < 10000) 2 else 1
    return String.format(Locale.US, "%.${decimals}f km", km)
}

/** Seconds → "1:23:45" or "23:45" (web formatDuration parity). */
fun formatDuration(seconds: Double?): String {
    if (seconds == null || seconds.isNaN()) return "—"
    val s = Math.round(seconds)
    val h = s / 3600
    val m = (s % 3600) / 60
    val sec = s % 60
    return if (h > 0) {
        String.format(Locale.US, "%d:%02d:%02d", h, m, sec)
    } else {
        String.format(Locale.US, "%d:%02d", m, sec)
    }
}

/** Meters/second → "12.3" (km/h number, no unit suffix — web formatSpeed parity). */
fun formatSpeed(metersPerSecond: Double?): String {
    if (metersPerSecond == null || metersPerSecond.isNaN()) return "—"
    return String.format(Locale.US, "%.1f", metersPerSecond * 3.6)
}

/**
 * Elevation gain in meters from a chronological altitude series (nulls
 * skipped). Hysteresis threshold so barometric noise doesn't accumulate: only
 * sustained changes of at least [thresholdMeters] count, and the anchor moves
 * only once such a change is confirmed.
 */
fun elevationGain(altitudes: List<Double?>, thresholdMeters: Double = 2.0): Int {
    var gain = 0.0
    var anchor: Double? = null
    for (alt in altitudes) {
        if (alt == null || alt.isNaN()) continue
        val a = anchor
        if (a == null) {
            anchor = alt
            continue
        }
        val delta = alt - a
        if (Math.abs(delta) >= thresholdMeters) {
            if (delta > 0) gain += delta
            anchor = alt
        }
    }
    return Math.round(gain).toInt()
}

/**
 * Centered moving average over a window of [halfWindow] * 2 + 1 samples,
 * skipping nulls. Tames single-sample GPS speed spikes for display.
 */
fun movingAverage(values: List<Double?>, halfWindow: Int): List<Double?> {
    val result = arrayOfNulls<Double>(values.size)
    for (i in values.indices) {
        var sum = 0.0
        var n = 0
        val from = maxOf(0, i - halfWindow)
        val to = minOf(values.size - 1, i + halfWindow)
        for (j in from..to) {
            val v = values[j]
            if (v != null && !v.isNaN()) {
                sum += v
                n++
            }
        }
        result[i] = if (n > 0) sum / n else null
    }
    return result.toList()
}

/** Cumulative distance in meters along a (lat, lon) track — haversine. */
fun cumulativeDistances(points: List<Pair<Double, Double>>): List<Double> {
    val earthRadiusM = 6371000.0
    val out = ArrayList<Double>(points.size)
    var total = 0.0
    var prev: Pair<Double, Double>? = null
    for (p in points) {
        prev?.let { q ->
            val dLat = Math.toRadians(p.first - q.first)
            val dLon = Math.toRadians(p.second - q.second)
            val lat1 = Math.toRadians(q.first)
            val lat2 = Math.toRadians(p.first)
            val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
            total += 2 * earthRadiusM * Math.asin(Math.sqrt(a))
        }
        out += total
        prev = p
    }
    return out
}

/**
 * CSS color for a speed value — the web's green→yellow→red ramp. Slow is deep
 * green, fast approaches red; null falls back to the sport color.
 */
fun speedColor(kmh: Double?, fallbackHex: String): String {
    if (kmh == null || kmh.isNaN()) return fallbackHex
    val max = 45.0
    val frac = (kmh / max).coerceAtMost(1.0)
    val hue = 140 - frac * 140
    return String.format(Locale.US, "hsl(%.0f, 70%%, 45%%)", hue)
}

/** One speed-colored stretch of the track: a color and the polyline it paints. */
data class SpeedSegment(
    /** CSS color (hsl ramp bucket). */
    val color: String,
    /** (lat, lon) vertices of the stretch, ≥ 2 points. */
    val latLngs: List<Pair<Double, Double>>,
)

/**
 * Split the track into speed-colored stretches for the map. Speeds are
 * quantized into [buckets] color bands of the same green→red ramp the web
 * uses per-segment; consecutive points in the same band merge into one
 * segment, keeping the layer count MapLibre-friendly (hundreds, not
 * point-count).
 */
fun speedSegments(
    track: List<FitnessTrackPoint>,
    fallbackHex: String,
    buckets: Int = 24,
    maxSpeedKmh: Double = 45.0,
): List<SpeedSegment> {
    if (track.size < 2) return emptyList()
    fun bucketOf(kmh: Double?): Int {
        if (kmh == null || kmh.isNaN()) return -1
        val frac = (kmh / maxSpeedKmh).coerceIn(0.0, 1.0)
        return (frac * (buckets - 1)).toInt()
    }
    fun colorOf(bucket: Int): String {
        if (bucket < 0) return fallbackHex
        val hue = 140 - bucket * (140.0 / (buckets - 1))
        return String.format(Locale.US, "hsl(%.0f, 70%%, 45%%)", hue)
    }

    val segments = mutableListOf<SpeedSegment>()
    var currentBucket = bucketOf(track.first().speedSmooth)
    var currentColor = colorOf(currentBucket)
    val currentPoints = mutableListOf(track.first().lat to track.first().lon)

    for (i in 1 until track.size) {
        val p = track[i]
        val bucket = bucketOf(p.speedSmooth)
        currentPoints.add(p.lat to p.lon)
        if (bucket != currentBucket || i == track.size - 1) {
            if (currentPoints.size >= 2) {
                segments += SpeedSegment(currentColor, currentPoints.toList())
            }
            if (i == track.size - 1) break
            currentBucket = bucket
            currentColor = colorOf(bucket)
            // Start the next stretch from the boundary point so segments connect.
            currentPoints.clear()
            currentPoints.add(p.lat to p.lon)
        }
    }
    return segments
}

private val monthFormatter = DateTimeFormatter.ofPattern("MMMM uuuu", Locale.getDefault())

/** Label for a month bucket, e.g. "August 2026" in the device locale. */
fun monthLabel(isoTimestamp: String): String = runCatching {
    monthFormatter.format(Instant.parse(isoTimestamp).atZone(ZoneId.systemDefault()))
}.getOrElse { isoTimestamp.take(7) }

/**
 * Group activities into month buckets, newest first (web groupByMonth parity).
 * Assumes the input is sorted by started_at descending.
 */
fun groupByMonth(activities: List<FitnessActivity>): List<Pair<String, List<FitnessActivity>>> {
    val groups = LinkedHashMap<String, MutableList<FitnessActivity>>()
    for (activity in activities) {
        groups.getOrPut(monthLabel(activity.startedAt)) { mutableListOf() }.add(activity)
    }
    return groups.map { (label, list) -> label to list.toList() }
}
