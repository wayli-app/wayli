package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.wayli.models.TrackerPoint
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class StatsAggregatorTest {

    private fun activity(day: String, km: Double?, hours: Double?, pts: Int?) =
        DailyActivity(userId = "u", day = day, distance = km, timeSpent = hours, points = pts)

    private fun tp(
        recordedAt: String = "2026-08-01",
        location: String = "POINT(4.9 52.35)",
        country: String? = "NL",
        mode: String? = "car",
    ) = TrackerPoint(
        userId = "u", recordedAt = recordedAt, location = location,
        countryCode = country, transportMode = mode,
    )

    @Test
    fun `totals sum ignoring nulls`() {
        val rows = listOf(
            activity("2026-08-01", 10.0, 1.0, 100),
            activity("2026-08-02", null, 2.0, null),
            activity("2026-08-03", 5.5, null, 50),
        )
        val totals = StatsAggregator.totalsFromDailyActivity(rows)
        assertEquals(15.5, totals.totalDistanceKm)
        assertEquals(3.0, totals.timeMovingHours)
        assertEquals(150, totals.points)
    }

    @Test
    fun `daily distance maps day to km`() {
        val map = StatsAggregator.dailyDistance(
            listOf(activity("2026-08-01", 12.0, 0.0, 0), activity("2026-08-02", null, 0.0, 0)),
        )
        assertEquals(12.0, map["2026-08-01"])
        assertEquals(0.0, map["2026-08-02"])
    }

    @Test
    fun `countries counts distinct codes case-insensitively`() {
        val points = listOf(
            tp(country = "NL"), tp(country = "nl"), tp(country = "DE"),
            tp(country = null), tp(country = "BE"),
        )
        assertEquals(3, StatsAggregator.countries(points))
    }

    @Test
    fun `mode fractions sum to one and bucket nulls as unknown`() {
        val points = listOf(
            tp(mode = "car"), tp(mode = "car"), tp(mode = "train"), tp(mode = null),
        )
        val fractions = StatsAggregator.transportModeFractions(points)
        assertEquals(0.5, fractions["car"])
        assertEquals(0.25, fractions["train"])
        assertEquals(0.25, fractions["unknown"])
        assertEquals(1.0, fractions.values.sum(), 1e-9)
    }

    @Test
    fun `track parses postgis and geojson locations to lat-lon`() {
        val points = listOf(
            tp(location = "POINT(4.9 52.35)"), // lon lat
            tp(location = "SRID=4326;POINT(-3.7 40.4)"),
            tp(location = """{"type":"Point","coordinates":[-0.12,51.5]}"""),
            tp(location = "garbage"),
        )
        val track = StatsAggregator.track(points)
        assertEquals(3, track.size)
        assertEquals(52.35, track[0].first)
        assertEquals(4.9, track[0].second)
        assertEquals(40.4, track[1].first)
        assertEquals(-3.7, track[1].second)
        assertEquals(51.5, track[2].first)
        assertEquals(-0.12, track[2].second)
    }

    @Test
    fun `negative coordinates parse`() {
        val parsed = StatsAggregator.parsePostgisPoint("POINT(-58.38 -34.60)") // Buenos Aires
        assertEquals(-34.60 to -58.38, parsed)
    }

    @Test
    fun `unparseable locations yield empty track`() {
        assertTrue(StatsAggregator.track(listOf(tp(location = "nope"))).isEmpty())
    }
}
