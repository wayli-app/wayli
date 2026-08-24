package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.postgrest.PostgrestResponse

/**
 * Returns the payload of a PostgREST response, throwing when the call failed.
 *
 * The query builder catches transport/HTTP errors and answers with
 * `data = null, error = FluxbaseError(...)` instead of throwing, so
 * `result.data ?: emptyList()` silently converts an expired-token 401 (or any
 * other server error) into "no rows" — which then renders as a signed-in
 * dashboard with zero data and poisons the offline cache. Repositories must
 * surface the error instead.
 */
fun <T> PostgrestResponse<T>.dataOrThrow(): T? {
    error?.let { throw it }
    return data
}
