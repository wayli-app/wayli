package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.wayli.models.TrackerPoint
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json

class StatsAggregatorTest {

    private fun activity(day: String, meters: Double?, seconds: Double?, pts: Int?) =
        DailyActivity(userId = "u", day = day, distance = meters, timeSpent = seconds, points = pts)

    private fun tp(
        recordedAt: String = "2026-08-01",
        location: kotlinx.serialization.json.JsonElement? = Json.parseToJsonElement(
            """{"type":"Point","coordinates":[4.9,52.35]}""",
        ),
        country: String? = "NL",
        mode: String? = "car",
        distance: Double? = null,
        timeSpent: Double? = null,
    ) = TrackerPoint(
        userId = "u", recordedAt = recordedAt, location = location,
        countryCode = country, transportMode = mode, distance = distance, timeSpent = timeSpent,
    )

    // ---- Wire-format deserialization (the real-mode zeros root cause) ----

    @Test
    fun `DailyActivity deserializes the server's snake_case payload`() {
        val json = Json { ignoreUnknownKeys = true }
        val row = json.decodeFromString(
            DailyActivity.serializer(),
            """{"user_id":"u1","day":"2026-08-01","distance":1234.5,"time_spent":600,"points":40}""",
        )
        assertEquals("u1", row.userId)
        assertEquals("2026-08-01", row.day)
        assertEquals(1234.5, row.distance)
        assertEquals(600.0, row.timeSpent)
        assertEquals(40, row.points)
    }

    @Test
    fun `TrackerPoint deserializes a GeoJSON object location`() {
        val json = Json { ignoreUnknownKeys = true }
        val point = json.decodeFromString(
            TrackerPoint.serializer(),
            """{"user_id":"u","recorded_at":"2026-08-01T10:00:00Z",
                "location":{"type":"Point","coordinates":[4.9,52.35]},"country_code":"NL"}""",
        )
        assertEquals(52.35 to 4.9, StatsAggregator.parseLocation(point.location))
    }

    // ---- Unit conversions (schema: meters / seconds) ----

    @Test
    fun `daily totals convert meters to km and seconds to hours`() {
        val totals = StatsAggregator.totalsFromDailyActivity(
            listOf(
                activity("2026-08-01", meters = 10_000.0, seconds = 3600.0, pts = 100),
                activity("2026-08-02", meters = 5000.0, seconds = 1800.0, pts = 50),
            ),
        )
        assertEquals(15.0, totals.totalDistanceKm, 1e-9)
        assertEquals(1.5, totals.timeMovingHours, 1e-9)
        assertEquals(150, totals.points)
    }

    @Test
    fun `points fallback totals use per-point segment meters and seconds`() {
        val totals = StatsAggregator.totalsFromPoints(
            listOf(
                tp(distance = 2500.0, timeSpent = 600.0),
                tp(distance = 1500.0, timeSpent = 300.0),
                tp(distance = 0.0, timeSpent = 0.0), // point without segment data
            ),
        )
        assertEquals(4.0, totals.totalDistanceKm, 1e-9)
        assertEquals(0.25, totals.timeMovingHours, 1e-9)
        assertEquals(3, totals.points)
    }

    @Test
    fun `heatmap distance is km`() {
        val map = StatsAggregator.dailyDistance(
            listOf(activity("2026-08-01", meters = 12_000.0, seconds = 0.0, pts = 0)),
        )
        assertEquals(12.0, map["2026-08-01"]!!, 1e-9)
    }

    // ---- Location parsing ----

    @Test
    fun `track parses GeoJSON objects in order`() {
        val track = StatsAggregator.track(
            listOf(
                tp(location = Json.parseToJsonElement("""{"coordinates":[4.9,52.35]}""")),
                tp(location = Json.parseToJsonElement("""{"coordinates":[-3.7,40.4]}""")),
                tp(location = null), // skipped
            ),
        )
        assertEquals(listOf(52.35 to 4.9, 40.4 to -3.7), track)
    }

    @Test
    fun `parseLocation accepts WKT strings and GeoJSON strings`() {
        assertEquals(52.35 to 4.9, StatsAggregator.parseLocation(Json.parseToJsonElement("\"POINT(4.9 52.35)\"")))
        assertEquals(-34.6 to -58.38, StatsAggregator.parsePostgisPoint("POINT(-58.38 -34.6)"))
        assertEquals(51.5 to -0.12, StatsAggregator.parsePostgisPoint("""{"coordinates":[-0.12,51.5]}"""))
        assertNull(StatsAggregator.parsePostgisPoint("garbage"))
    }

    // ---- Countries / modes (unchanged semantics) ----

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
        assertEquals(1.0, fractions.values.sum(), 1e-9)
    }

    // ---- Distance-weighted mode shares (web parity) ----

    @Test
    fun `mode shares weight by distance and exclude stationary`() {
        val points = listOf(
            tp(mode = "car", distance = 6000.0),
            tp(mode = "car", distance = 2000.0),
            tp(mode = "train", distance = 2000.0),
            tp(mode = "stationary", distance = 90000.0), // not movement
        )
        val shares = StatsAggregator.transportModeShares(points)
        assertEquals(setOf("car", "train"), shares.keys)
        assertEquals(0.8, shares["car"]!!, 1e-9)
        assertEquals(0.2, shares["train"]!!, 1e-9)
        assertEquals(1.0, shares.values.sum(), 1e-9)
    }

    @Test
    fun `mode shares include unknown and are empty without moving distance`() {
        val shares = StatsAggregator.transportModeShares(
            listOf(tp(mode = null, distance = 100.0), tp(mode = null, distance = 300.0)),
        )
        assertEquals(1.0, shares["unknown"]!!, 1e-9)

        val noDistance = StatsAggregator.transportModeShares(
            listOf(tp(mode = "car", distance = null), tp(mode = "car")),
        )
        assertTrue(noDistance.isEmpty())
    }

    @Test
    fun `percentages sum to exactly one hundred via largest remainder`() {
        val fractions = mapOf("car" to 0.335, "train" to 0.335, "cycling" to 0.33)
        val pct = StatsAggregator.percentagesSummingTo100(fractions)
        assertEquals(100, pct.values.sum())
        // Floored: 33+33+33 = 99 — the single lost point goes to the largest
        // fractional part (car and train tie at .5; stable order picks car).
        assertEquals(34, pct["car"])
        assertEquals(33, pct["train"])
        assertEquals(33, pct.getValue("cycling"))
    }

    @Test
    fun `percentages handle a single dominant mode`() {
        val pct = StatsAggregator.percentagesSummingTo100(mapOf("car" to 1.0))
        assertEquals(mapOf("car" to 100), pct)
    }

    // ---- Heatmap fallback from raw points ----

    @Test
    fun `daily distance from points buckets by recorded_at day`() {
        val points = listOf(
            tp(recordedAt = "2026-08-01T08:00:00Z", distance = 1500.0),
            tp(recordedAt = "2026-08-01T09:00:00Z", distance = 500.0),
            tp(recordedAt = "2026-08-02T10:00:00Z", distance = 2000.0),
            tp(recordedAt = "2026-08-02T11:00:00Z", distance = null),
        )
        val daily = StatsAggregator.dailyDistanceFromPoints(points)
        assertEquals(2.0, daily["2026-08-01"]!!, 1e-9)
        assertEquals(2.0, daily["2026-08-02"]!!, 1e-9)
    }
}
