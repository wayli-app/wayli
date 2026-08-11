package io.github.nimbleflux.wayli.repo

import io.github.nimbleflux.fluxbase.FluxbaseClient
import io.github.nimbleflux.fluxbase.from
import io.github.nimbleflux.wayli.models.WantToVisit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WishlistRepository @Inject constructor(
    private val client: FluxbaseClient,
) {

    suspend fun listPlaces(userId: String): Result<List<WantToVisit>> = runCatching {
        val result = client.from<WantToVisit>("want_to_visit_places")
            .select()
            .eq("user_id", userId)
            .order("created_at", ascending = false)
            .execute()
        result.data ?: emptyList()
    }

    suspend fun deletePlace(placeId: String): Result<Unit> = runCatching {
        client.from<WantToVisit>("want_to_visit_places").eq("id", placeId).delete()
    }
}
