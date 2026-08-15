package io.github.nimbleflux.wayli.tracking

import io.github.nimbleflux.wayli.gps.ActivityRecognitionDriver
import io.github.nimbleflux.wayli.gps.CapturedPoint
import io.github.nimbleflux.wayli.gps.StationaryResumeTrigger
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Flavor fallbacks without Play Services: activity recognition reports
 * nothing (adaptive tracking stays inert) and stationary pauses simply wait
 * for the next service start instead of a geofence wake-up.
 */
@Singleton
class NoopActivityRecognitionDriver @Inject constructor() : ActivityRecognitionDriver {
    override fun start() = Unit
    override fun stop() = Unit
}

@Singleton
class NoopStationaryResumeTrigger @Inject constructor() : StationaryResumeTrigger {
    override fun arm(point: CapturedPoint, radiusM: Float, onResume: () -> Unit) = Unit
    override fun disarm() = Unit
}
