package io.github.nimbleflux.wayli.session

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.getOrNull
import io.github.nimbleflux.wayli.demo.DemoManager
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.delay

/**
 * Keeps the user signed in by refreshing the access token BEFORE it expires.
 *
 * The Kotlin SDK has no proactive refresh (its `autoRefresh` flag is unused —
 * unlike the TS SDK), so without this the app only refreshes reactively when a
 * request 401s. If the app then sits unused past the refresh-token window
 * (default 7 days server-side), the session dies and the user is logged out.
 * Refreshing while the app is alive keeps sliding that window forward — open
 * the app at least once per window and you stay signed in indefinitely.
 */
@Singleton
class SessionRefresher @Inject constructor(
    private val client: FluxbaseClient,
    private val demoManager: DemoManager,
) {
    private var refreshInFlight = false

    /**
     * Refresh when the access token expires within [REFRESH_AHEAD_MS] (or has
     * no known expiry). Returns true when a refresh was attempted and the
     * session is alive afterwards. A dead refresh token fires
     * [SessionExpiryBus] so the nav host routes to sign-in; network errors are
     * left for the next tick (the reactive 401-retry still covers requests).
     */
    suspend fun refreshIfDue(nowMs: Long = System.currentTimeMillis()): Boolean {
        if (demoManager.isDemoMode || refreshInFlight) return true
        val session = client.auth.currentSession ?: return true
        val expiresAt = session.expiresAt
        if (expiresAt != null && expiresAt - nowMs > REFRESH_AHEAD_MS) return true

        refreshInFlight = true
        try {
            val refreshed = runCatching { client.auth.refreshSession().getOrNull() }
            val error = refreshed.exceptionOrNull()
            if (error != null) {
                if (isSessionDeadError(error)) SessionExpiryBus.fire()
                return false
            }
            return refreshed.getOrNull() != null
        } finally {
            refreshInFlight = false
        }
    }

    /** Periodic check while the app is alive; launched from [io.github.nimbleflux.wayli.nav.WayliNavHost]. */
    suspend fun runLoop() {
        while (true) {
            runCatching { refreshIfDue() }
            delay(CHECK_INTERVAL_MS)
        }
    }

    private companion object {
        /** Refresh this far before actual expiry (access tokens live ~1h). */
        const val REFRESH_AHEAD_MS = 5 * 60 * 1000L
        const val CHECK_INTERVAL_MS = 5 * 60 * 1000L
    }
}
