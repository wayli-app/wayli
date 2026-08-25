package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.FluxbaseError
import io.github.nimbleflux.fluxbase.getOrNull

/**
 * RPC routes use OPTIONAL platform auth, so a stale access token silently
 * degrades the call to anonymous and the server answers 403 "procedure
 * requires authentication" — which the SDK's 401-driven refresh-retry never
 * sees. This wrapper turns that 403 into one explicit refresh + retry.
 */
suspend fun <T> withRpcAuthRetry(
    client: FluxbaseClient,
    block: suspend () -> Result<T>,
): Result<T> {
    val first = block()
    if (first.isSuccess) return first
    val err = first.exceptionOrNull()
    val authish = (err as? FluxbaseError)?.status == 403 &&
        err.message?.contains("procedure requires authentication", ignoreCase = true) == true
    if (!authish) return first
    val refreshed = client.auth?.refreshSession()?.getOrNull() ?: return first
    return if (refreshed != null) block() else first
}
