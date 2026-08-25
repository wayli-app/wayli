package io.github.nimbleflux.wayli.util

import kotlinx.coroutines.flow.MutableStateFlow

/**
 * Signals that the persisted session died (expired refresh token) and the
 * user must be routed to sign-in. HomeViewModel can't navigate, so it flags
 * expiry here and WayliNavHost performs the hardened sign-out + routing.
 */
object SessionExpiryBus {
    val expired = MutableStateFlow(false)

    fun fire() {
        expired.value = true
    }

    fun consume() {
        expired.value = false
    }
}
