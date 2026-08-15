package io.github.nimbleflux.wayli.gps

/**
 * Pure policy: how the configured tracking request adapts to the current
 * activity kind. Unit-testable without Android.
 *
 * - STILL: passive priority and a 4× interval — we're parked; keep a slow
 *   heartbeat so stationary-pause detection still sees points.
 * - Moving (foot/vehicle/bike): the configured accuracy profile and interval.
 * - UNKNOWN: the configured values (no signal → no change).
 */
object AdaptiveTrackingPolicy {

    data class Effective(
        val intervalMultiplier: Long,
        val passivePriority: Boolean,
    )

    fun effectiveFor(kind: ActivityKind): Effective = when (kind) {
        ActivityKind.STILL -> Effective(intervalMultiplier = 4, passivePriority = true)
        ActivityKind.ON_FOOT, ActivityKind.IN_VEHICLE, ActivityKind.ON_BIKE ->
            Effective(intervalMultiplier = 1, passivePriority = false)
        ActivityKind.UNKNOWN -> Effective(intervalMultiplier = 1, passivePriority = false)
    }

    /** The interval to request right now, given the config and activity. */
    fun intervalMs(config: TrackingConfig, kind: ActivityKind): Long {
        val base = config.minIntervalSec * 1000L
        return base * effectiveFor(kind).intervalMultiplier
    }

    /** Whether to fall back to passive priority under this activity. */
    fun wantsPassive(kind: ActivityKind): Boolean = effectiveFor(kind).passivePriority
}
