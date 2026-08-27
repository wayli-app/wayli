package io.github.nimbleflux.wayli.session

import android.util.Log
import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.wayli.demo.DemoManager
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.delay

/**
 * Keeps the user signed in by refreshing the access token BEFORE it expires.
 *
 * Belt-and-braces alongside the SDK's own `autoRefresh` scheduler (enabled in
 * [io.github.nimbleflux.wayli.di.FluxbaseModule]): both funnel into the SDK's
 * single-flight `refreshSession` mutex, so they can never issue concurrent
 * refresh calls. This loop doubles as the authoritative periodic dead-session
 * re-check: a refresh error is classified by the same rules as
 * [SessionArbiter] — only a definitive rejection by the refresh endpoint
 * (HTTP 401 / "invalid or expired refresh token") signs the user out;
 * transport-level failures (no status) are retried on the next tick.
 */
@Singleton
class SessionRefresher @Inject constructor(
    private val client: FluxbaseClient,
    private val demoManager: DemoManager,
) {
    private var refreshInFlight = false

    /**
     * Refresh when the access token expires within [REFRESH_AHEAD_MS] (or has
     * no known expiry). Returns true when no refresh was needed or it
     * succeeded. A confirmed-dead refresh token fires [SessionExpiryBus];
     * transient failures are left for the next tick (the SDK's reactive
     * 401-retry and autoRefresh still cover requests meanwhile).
     */
    suspend fun refreshIfDue(nowMs: Long = System.currentTimeMillis()): Boolean {
        if (demoManager.isDemoMode || refreshInFlight) return true
        val session = client.auth.currentSession ?: return true
        val expiresAt = session.expiresAt
        if (expiresAt != null && expiresAt - nowMs > REFRESH_AHEAD_MS) return true

        refreshInFlight = true
        try {
            // refreshSession() RETURNS errors (it never throws), so inspect
            // the response — the previous runCatching/exceptionOrNull() here
            // could never observe a failure.
            val result = client.auth.refreshSession()
            val error = result.error
            if (error == null) return true
            return when (SessionArbiter.classify(error)) {
                SessionArbiter.Verdict.DEAD -> {
                    Log.w(TAG, "periodic refresh rejected (dead session): ${error.message?.take(120)}")
                    SessionExpiryBus.fire()
                    false
                }
                SessionArbiter.Verdict.TRANSIENT -> {
                    Log.i(TAG, "periodic refresh failed transiently: ${error.message?.take(120)} — retrying next tick")
                    false
                }
                SessionArbiter.Verdict.RECOVERED -> true
            }
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
        const val TAG = "WayliSession"
        /** Refresh this far before actual expiry (access tokens live ~1h). */
        const val REFRESH_AHEAD_MS = 5 * 60 * 1000L
        const val CHECK_INTERVAL_MS = 5 * 60 * 1000L
    }
}
