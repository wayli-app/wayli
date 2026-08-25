package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.wayli.db.CacheDao
import io.github.nimbleflux.wayli.db.CacheEntity
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * Room-backed response cache for offline reads. Repositories wrap their
 * network calls in [withCache]: successes are written through, failures fall
 * back to the last cached payload (stale data beats an empty screen).
 */
@Singleton
class CacheStore @Inject constructor(
    private val dao: CacheDao,
) {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    suspend fun <T> get(key: String, serializer: KSerializer<T>): T? = runCatching {
        dao.payload(key)?.let { json.decodeFromString(serializer, it) }
    }.getOrNull()

    suspend fun <T> put(key: String, value: T, serializer: KSerializer<T>) {
        runCatching {
            dao.upsert(CacheEntity(key, json.encodeToString(serializer, value)))
        }
    }

    /**
     * Write-through + serve-stale around a [fetch]: cache the success value,
     * and when the fetch fails answer with the cached copy if one exists.
     *
     * Exception: a 401 is a dead session, not a connectivity blip — serving
     * the stale cache there would keep a logged-out dashboard rendering
     * cached data indefinitely, so auth failures propagate to the caller.
     */
    suspend fun <T> withCache(key: String, serializer: KSerializer<T>, fetch: suspend () -> Result<T>): Result<T> {
        val result = fetch()
        result.onSuccess { put(key, it, serializer) }
        if (result.isSuccess) return result
        if (isAuthFailure(result)) return result
        return get(key, serializer)?.let { Result.success(it) } ?: result
    }

    private fun isAuthFailure(result: Result<*>): Boolean {
        val error = result.exceptionOrNull()
        return (error as? io.github.nimbleflux.fluxbase.FluxbaseError)?.status == 401 ||
            (error as? io.github.nimbleflux.fluxbase.core.FluxbaseException)?.status == 401
    }

    /** List convenience — most cached payloads are whole result lists. */
    suspend fun <T> withCacheList(key: String, element: KSerializer<T>, fetch: suspend () -> Result<List<T>>): Result<List<T>> =
        withCache(key, ListSerializer(element), fetch)
}
