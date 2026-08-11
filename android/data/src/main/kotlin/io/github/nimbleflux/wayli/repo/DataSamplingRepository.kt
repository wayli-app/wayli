package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.from
import io.github.nimbleflux.wayli.models.UserDataSampling
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Reads/writes the `user_data_sampling` row (one per user, keyed by `user_id`).
 * Writes use [FluxbaseClient.from] upsert with merge-on-conflict so the row is
 * created if absent and updated otherwise.
 */
@Singleton
class DataSamplingRepository @Inject constructor(
    private val client: FluxbaseClient,
) {
    suspend fun get(userId: String): Result<UserDataSampling> = runCatching {
        val result = client.from<UserDataSampling>("user_data_sampling")
            .select()
            .eq("user_id", userId)
            .maybeSingle()
        result.data ?: UserDataSampling(userId = userId)
    }

    suspend fun upsert(
        userId: String,
        enabled: Boolean,
        minDistanceM: Double,
        minTimeS: Double,
    ): Result<Unit> = runCatching {
        client.from<UserDataSampling>("user_data_sampling").upsert(
            mapOf(
                "user_id" to userId,
                "enabled" to enabled,
                "min_distance_m" to minDistanceM,
                "min_time_s" to minTimeS,
            ),
        )
        Unit
    }
}
