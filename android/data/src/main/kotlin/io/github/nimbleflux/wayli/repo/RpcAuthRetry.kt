package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.FluxbaseError
import io.github.nimbleflux.wayli.session.SessionArbiter

/**
 * RPC routes use OPTIONAL platform auth, so a stale access token silently
 * degrades the call to anonymous and the server answers 403 "procedure
 * requires authentication" — which the SDK's 401-driven refresh-retry never
 * sees. This wrapper turns that 403 into one adjudicated refresh + retry.
 *
 * A failed refresh alone does NOT mean the session is dead (it may be a
 * transient network failure) — only [SessionArbiter]'s verdict decides, so
 * this never signs the user out on recoverable errors.
 */
suspend fun <T> withRpcAuthRetry(
    client: FluxbaseClient,
    arbiter: SessionArbiter,
    block: suspend () -> Result<T>,
): Result<T> {
    val first = block()
    if (first.isSuccess) return first
    val err = first.exceptionOrNull()
    val authish = (err as? FluxbaseError)?.status == 403 &&
        err.message?.contains("procedure requires authentication", ignoreCase = true) == true
    if (!authish) return first
    return when (arbiter.adjudicate("rpc", err)) {
        // The refresh just rotated the token — the retry runs authenticated.
        SessionArbiter.Verdict.RECOVERED -> block()
        // Confirmed dead (refresh endpoint rejected the token): the arbiter
        // fired the expiry bus; surface the original failure.
        SessionArbiter.Verdict.DEAD -> first
        // Transient refresh failure — return the original failure; the SDK
        // background loop recovers and the next call retries fresh.
        SessionArbiter.Verdict.TRANSIENT -> first
    }
}
