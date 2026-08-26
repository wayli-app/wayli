package io.github.nimbleflux.wayli.gps

/**
 * Pure stationary-detection state machine. The controller feeds it captured
 * points; it decides when the user has been stationary long enough to pause
 * active tracking (a geofence then waits for movement to resume).
 *
 * Stationary = consecutive points within [TrackingConfig.stationaryResumeRadiusM]
 * of each other. With `stationaryPauseMin = 0` pausing is disabled.
 */
class StationaryTracker {

    enum class Decision { NONE, PAUSE, RESUME }

    enum class State { ACTIVE, PAUSED }

    var state: State = State.ACTIVE
        private set

    /** Anchor point when the user stopped moving (lat, lon, timestamp). */
    private var anchor: Triple<Double, Double, Long>? = null

    fun reset() {
        state = State.ACTIVE
        anchor = null
    }

    /**
     * Feed a point. [nowMs] is injectable for tests.
     */
    fun onPoint(point: CapturedPoint, config: TrackingConfig, nowMs: Long = System.currentTimeMillis()): Decision {
        if (config.stationaryPauseMin == 0L) return Decision.NONE

        return when (state) {
            State.ACTIVE -> {
                val current = anchor
                if (current == null) {
                    anchor = Triple(point.lat, point.lon, point.timestamp)
                    Decision.NONE
                } else if (distanceMeters(current.first, current.second, point.lat, point.lon) < config.stationaryResumeRadiusM) {
                    val stationaryForMs = (point.timestamp - current.third) * 1000L
                    if (stationaryForMs >= config.stationaryPauseMin * 60_000L) {
                        state = State.PAUSED
                        Decision.PAUSE
                    } else {
                        Decision.NONE
                    }
                } else {
                    // Moved beyond the radius — new anchor.
                    anchor = Triple(point.lat, point.lon, point.timestamp)
                    Decision.NONE
                }
            }
            State.PAUSED -> Decision.NONE // resume is driven by the geofence/trigger, not points
        }
    }

    /** Haversine distance in meters. */
    internal fun distanceMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6_371_000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
        return 2 * r * Math.asin(Math.sqrt(a))
    }
}
