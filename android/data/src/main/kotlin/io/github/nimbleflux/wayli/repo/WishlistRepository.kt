package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.from
import io.github.nimbleflux.wayli.models.WantToVisit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WishlistRepository @Inject constructor(
    private val client: FluxbaseClient,
    private val cache: CacheStore,
) {

    suspend fun listPlaces(userId: String): Result<List<WantToVisit>> =
        cache.withCacheList("places:$userId", WantToVisit.serializer()) {
            runCatching {
                val result = client.from<WantToVisit>("want_to_visit_places")
                    .select()
                    .eq("user_id", userId)
                    .order("created_at", ascending = false)
                    .execute()
                result.dataOrThrow() ?: emptyList()
            }
        }

    suspend fun deletePlace(placeId: String): Result<Unit> = runCatching {
        client.from<WantToVisit>("want_to_visit_places").eq("id", placeId).delete()
    }

    /**
     * Add a place via the `add-want-to-visit` RPC (namespace `wayli`) — the
     * server builds the PostGIS point from lat/lng and pins user_id from the
     * session (owner-only RLS).
     */
    suspend fun addPlace(
        title: String,
        lat: Double,
        lng: Double,
        address: String? = null,
        countryCode: String? = null,
    ): Result<Unit> = runCatching {
        val payload = buildMap<String, Any?> {
            put("title", title)
            put("lat", lat)
            put("lng", lng)
            address?.takeIf { it.isNotBlank() }?.let { put("address", it) }
            countryCode?.takeIf { it.isNotBlank() }?.let { put("country_code", it) }
        }
        client.rpc.invoke(
            "add-want-to-visit",
            payload,
            io.github.nimbleflux.fluxbase.rpc.RpcInvokeOptions(namespace = "wayli"),
        )
        Unit
    }
}
