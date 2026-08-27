package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.wayli.db.CacheDao
import io.github.nimbleflux.wayli.db.CacheEntity
import io.github.nimbleflux.wayli.session.SessionArbiter
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
    private val arbiter: SessionArbiter,
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
     * and when the fetch fails answer with the cached payload if one exists.
     *
     * Exception: a 401-shaped failure is adjudicated by [SessionArbiter]
     * before it is treated as fatal — a 401 only means "one refresh attempt
     * didn't yield a working token", which includes transient network
     * failures that must NOT sign the user out. A confirmed dead session
     * (refresh endpoint rejected the token) propagates to the caller and
     * routes to sign-in; a recovered one retries the fetch; anything
     * transient falls back to the stale cache like a connectivity blip.
     */
    suspend fun <T> withCache(key: String, serializer: KSerializer<T>, fetch: suspend () -> Result<T>): Result<T> {
        val result = fetch()
        result.onSuccess { put(key, it, serializer) }
        if (result.isSuccess) return result
        if (isAuthFailure(result)) {
            return when (arbiter.adjudicate("cache:$key", result.exceptionOrNull())) {
                SessionArbiter.Verdict.RECOVERED ->
                    fetch().also { retried -> retried.onSuccess { put(key, it, serializer) } }
                SessionArbiter.Verdict.DEAD -> result
                SessionArbiter.Verdict.TRANSIENT ->
                    get(key, serializer)?.let { Result.success(it) } ?: result
            }
        }
        return get(key, serializer)?.let { Result.success(it) } ?: result
    }

    private fun isAuthFailure(result: Result<*>): Boolean =
        io.github.nimbleflux.wayli.session.isSessionDeadError(result.exceptionOrNull())

    /** List convenience — most cached payloads are whole result lists. */
    suspend fun <T> withCacheList(key: String, element: KSerializer<T>, fetch: suspend () -> Result<List<T>>): Result<List<T>> =
        withCache(key, ListSerializer(element), fetch)
}
