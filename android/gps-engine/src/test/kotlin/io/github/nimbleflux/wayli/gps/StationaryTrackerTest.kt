package io.github.nimbleflux.wayli.gps

import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals

class StationaryTrackerTest {

    private lateinit var tracker: StationaryTracker

    private val config = TrackingConfig(
        stationaryPauseMin = 5,
        stationaryResumeRadiusM = 100f,
    )

    @BeforeTest
    fun setUp() {
        tracker = StationaryTracker()
    }

    private fun point(tst: Long, lat: Double = 52.0, lon: Double = 5.0) =
        CapturedPoint(lat = lat, lon = lon, timestamp = tst)

    @Test
    fun `no pause before the configured duration`() {
        // Anchor at t=0, same spot at t=4min → not yet 5min.
        assertEquals(StationaryTracker.Decision.NONE, tracker.onPoint(point(0), config))
        assertEquals(StationaryTracker.Decision.NONE, tracker.onPoint(point(240), config))
    }

    @Test
    fun `pause after stationary duration within radius`() {
        tracker.onPoint(point(0), config)
        // ~50m north of the anchor — within the 100m radius.
        val decision = tracker.onPoint(point(305, lat = 52.0005), config)
        assertEquals(StationaryTracker.Decision.PAUSE, decision)
        assertEquals(StationaryTracker.State.PAUSED, tracker.state)
    }

    @Test
    fun `moving beyond the radius resets the anchor`() {
        tracker.onPoint(point(0), config)
        // ~1.1km east — beyond the radius: new anchor, no pause.
        assertEquals(StationaryTracker.Decision.NONE, tracker.onPoint(point(400, lon = 5.015), config))
        // Stationary time starts over from the new anchor (same new spot).
        assertEquals(StationaryTracker.Decision.NONE, tracker.onPoint(point(500, lon = 5.015), config))
        assertEquals(StationaryTracker.Decision.PAUSE, tracker.onPoint(point(710, lon = 5.015), config))
    }

    @Test
    fun `paused tracker ignores further points`() {
        tracker.onPoint(point(0), config)
        assertEquals(StationaryTracker.Decision.PAUSE, tracker.onPoint(point(305), config))
        assertEquals(StationaryTracker.Decision.NONE, tracker.onPoint(point(400), config))
    }

    @Test
    fun `pause disabled when stationaryPauseMin is zero`() {
        val off = config.copy(stationaryPauseMin = 0)
        tracker.onPoint(point(0), off)
        assertEquals(StationaryTracker.Decision.NONE, tracker.onPoint(point(10_000), off))
    }

    @Test
    fun `reset returns to active`() {
        tracker.onPoint(point(0), config)
        assertEquals(StationaryTracker.Decision.PAUSE, tracker.onPoint(point(305), config))
        tracker.reset()
        assertEquals(StationaryTracker.State.ACTIVE, tracker.state)
    }
}
