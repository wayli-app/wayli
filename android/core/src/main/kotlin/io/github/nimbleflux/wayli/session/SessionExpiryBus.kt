package io.github.nimbleflux.wayli.session

import kotlinx.coroutines.flow.MutableStateFlow

/**
 * Signals that the persisted session died (expired refresh token) and the
 * user must be routed to sign-in. ViewModels and repositories can't navigate,
 * so they flag expiry here and WayliNavHost performs the hardened sign-out +
 * routing.
 *
 * Lives in `core` so the data layer (CacheStore, RPC retry) can fire it on
 * auth failures observed from ANY screen, not just Home.
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
