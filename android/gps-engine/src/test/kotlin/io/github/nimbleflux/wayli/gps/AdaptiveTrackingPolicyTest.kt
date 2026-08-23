package io.github.nimbleflux.wayli.gps

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AdaptiveTrackingPolicyTest {

    private val config = TrackingConfig(minIntervalSec = 30) // base 30s

    @Test
    fun `still backs off to a 4x interval but stays active`() {
        val effective = AdaptiveTrackingPolicy.effectiveFor(ActivityKind.STILL)
        assertEquals(4, effective.intervalMultiplier)
        assertEquals(120_000L, AdaptiveTrackingPolicy.intervalMs(config, ActivityKind.STILL))
    }

    @Test
    fun `moving kinds use the configured interval`() {
        listOf(ActivityKind.ON_FOOT, ActivityKind.IN_VEHICLE, ActivityKind.ON_BIKE).forEach { kind ->
            assertEquals(30_000L, AdaptiveTrackingPolicy.intervalMs(config, kind), "$kind")
        }
    }

    @Test
    fun `unknown keeps configured values`() {
        assertEquals(30_000L, AdaptiveTrackingPolicy.intervalMs(config, ActivityKind.UNKNOWN))
    }

    @Test
    fun `multipliers never zero out the interval`() {
        ActivityKind.entries.forEach { kind ->
            assertTrue(AdaptiveTrackingPolicy.intervalMs(config, kind) > 0, "$kind")
        }
    }
}
