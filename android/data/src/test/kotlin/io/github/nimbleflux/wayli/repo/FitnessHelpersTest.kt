package io.github.nimbleflux.wayli.repo

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class FitnessHelpersTest {

    // ---- Formatters (web fitness.ts parity) ----

    @Test
    fun `formatDistance keeps meters below 1km`() {
        assertEquals("840 m", formatDistance(840.0))
    }

    @Test
    fun `formatDistance uses two decimals below 10km`() {
        assertEquals("1.23 km", formatDistance(1234.0))
        assertEquals("9.99 km", formatDistance(9990.0))
    }

    @Test
    fun `formatDistance uses one decimal at 10km and beyond`() {
        assertEquals("12.3 km", formatDistance(12340.0))
        assertEquals("42.5 km", formatDistance(42500.0))
    }

    @Test
    fun `formatDistance handles null and NaN`() {
        assertEquals("—", formatDistance(null))
        assertEquals("—", formatDistance(Double.NaN))
    }

    @Test
    fun `formatDuration renders h mm ss and mm ss`() {
        assertEquals("1:23:45", formatDuration(5025.0))
        assertEquals("23:45", formatDuration(1425.4))
        assertEquals("—", formatDuration(null))
    }

    @Test
    fun `formatSpeed converts m per s to km per h`() {
        assertEquals("36.0", formatSpeed(10.0))
        assertEquals("—", formatSpeed(null))
    }

    // ---- Sport themes ----

    @Test
    fun `known and unknown sports resolve themes`() {
        assertEquals("Cycling", sportTheme("cycling").label)
        assertEquals("#10b981", sportTheme("cycling").strokeHex)
        assertEquals("Workout", sportTheme(null).label)
        assertEquals("Workout", sportTheme("archery").label)
    }

    // ---- Elevation gain (hysteresis) ----

    @Test
    fun `elevationGain ignores noise below the threshold`() {
        // +-1 m jitter around 100 m must not accumulate.
        val altitudes = listOf(100.0, 101.0, 100.0, 101.0, 100.0, null, 101.0)
        assertEquals(0, elevationGain(altitudes))
    }

    @Test
    fun `elevationGain counts sustained climbs and skips nulls`() {
        // 100 → 110 (+10), sustained 2 m dip moves the anchor to 108,
        // 108 → 112 (+4), then 112 → 120 (+8). Noise below 2 m never moves it.
        val altitudes = listOf<Double?>(100.0, 110.0, 108.0, 112.0, null, 120.0)
        assertEquals(22, elevationGain(altitudes))
    }

    @Test
    fun `elevationGain counts descents as zero gain`() {
        assertEquals(0, elevationGain(listOf(100.0, 50.0)))
    }

    // ---- Moving average ----

    @Test
    fun `movingAverage averages windows skipping nulls`() {
        val smoothed = movingAverage(listOf(null, 10.0, 20.0, null, 30.0), halfWindow = 1)
        // i=0: {10}=10 · i=1: {10,20}=15 · i=2: {10,20}=15 · i=3: {20,30}=25 · i=4: {30}=30
        assertEquals(10.0, smoothed[0])
        assertEquals(15.0, smoothed[1])
        assertEquals(15.0, smoothed[2])
        assertEquals(25.0, smoothed[3])
        assertEquals(30.0, smoothed[4])
    }

    @Test
    fun `movingAverage of all nulls stays null`() {
        val smoothed = movingAverage(listOf(null, null, null), halfWindow = 2)
        assertTrue(smoothed.all { it == null })
    }

    // ---- Cumulative distance (haversine) ----

    @Test
    fun `cumulativeDistances measures along the track`() {
        // ~111.2 km per degree of latitude; three points heading north.
        val points = listOf(52.0 to 4.9, 52.1 to 4.9, 52.2 to 4.9)
        val out = cumulativeDistances(points)
        assertEquals(0.0, out[0])
        assertEquals(out[1], out[2] - out[1], absoluteTolerance = 1.0)
        assertTrue(out[1] in 11000.0..11300.0)
    }

    @Test
    fun `cumulativeDistances of a single point is zero`() {
        assertEquals(listOf(0.0), cumulativeDistances(listOf(52.0 to 4.9)))
    }

    // ---- Speed colors ----

    @Test
    fun `speedColor ramps from green to red`() {
        assertEquals("hsl(140, 70%, 45%)", speedColor(0.0, "#123456"))
        assertEquals("hsl(0, 70%, 45%)", speedColor(99.0, "#123456")) // clamped
        assertEquals("#123456", speedColor(null, "#123456"))
    }

    // ---- Speed segments (map layer bucketing) ----

    private fun tp(epoch: Long, lat: Double, speed: Double?) = FitnessTrackPoint(
        epochMs = epoch, lat = lat, lon = 4.9, speedSmooth = speed,
    )

    @Test
    fun `speedSegments merges consecutive same-band points`() {
        val track = listOf(
            tp(0, 52.00, 10.0), // slow band
            tp(1000, 52.01, 11.0),
            tp(2000, 52.02, 40.0), // fast band
            tp(3000, 52.03, 41.0),
        )
        val segments = speedSegments(track, "#000000", buckets = 4)
        assertEquals(2, segments.size)
        // The boundary vertex closes the slow stretch and starts the fast one,
        // so the polylines connect.
        assertEquals(3, segments[0].latLngs.size)
        assertEquals(2, segments[1].latLngs.size)
        assertEquals(segments[0].latLngs.last(), segments[1].latLngs.first())
        assertTrue(segments[0].color != segments[1].color)
    }

    @Test
    fun `speedSegments empty for short tracks and null speeds use fallback`() {
        assertTrue(speedSegments(emptyList(), "#abc").isEmpty())
        assertTrue(speedSegments(listOf(tp(0, 52.0, 10.0)), "#abc").isEmpty())
        // All-null speeds collapse into one fallback-colored stretch.
        val one = speedSegments(listOf(tp(0, 52.0, null), tp(1, 52.1, null), tp(2, 52.2, null)), "#abc")
        assertEquals(1, one.size)
        assertEquals("#abc", one[0].color)
    }

    // ---- Month grouping ----

    private fun activity(id: String, startedAt: String) = FitnessActivity(id = id, startedAt = startedAt)

    @Test
    fun `groupByMonth buckets newest first preserving order`() {
        val activities = listOf(
            activity("a3", "2026-08-27T08:00:00Z"),
            activity("a2", "2026-08-03T08:00:00Z"),
            activity("a1", "2026-07-19T08:00:00Z"),
        )
        val groups = groupByMonth(activities)
        assertEquals(2, groups.size)
        assertEquals(listOf("a3", "a2"), groups[0].second.map { it.id })
        assertEquals(listOf("a1"), groups[1].second.map { it.id })
    }
}
