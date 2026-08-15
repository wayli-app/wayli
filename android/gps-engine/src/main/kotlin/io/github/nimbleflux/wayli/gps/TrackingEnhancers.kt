package io.github.nimbleflux.wayli.gps

/**
 * Starts/stops the motion-signal source that feeds [ActivityStateHolder].
 * gplay: Play Services Activity Recognition. foss: no-op (holder stays
 * UNKNOWN and adaptive tracking is inert).
 */
interface ActivityRecognitionDriver {
    /** Begin emitting activity updates into the holder. Idempotent. */
    fun start()

    fun stop()
}

/**
 * Arms a wake-up trigger around the last known position so tracking can
 * resume when the user moves again after a stationary pause.
 * gplay: GeofencingClient ENTER/EXIT. foss: no-op (resume happens on the
 * next service start / manual toggle).
 */
interface StationaryResumeTrigger {
    /** Register the resume trigger around [point]. [onResume] fires on movement. */
    fun arm(point: CapturedPoint, radiusM: Float, onResume: () -> Unit)

    fun disarm()
}
